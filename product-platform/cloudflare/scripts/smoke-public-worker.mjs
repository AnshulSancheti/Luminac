const baseUrl = process.argv[2] ?? process.env.PUBLIC_CATALOG_URL;
if (!baseUrl) throw new Error("Pass the public catalogue base URL as the first argument or PUBLIC_CATALOG_URL");

const origin = new URL(baseUrl);
if (origin.protocol !== "https:" && origin.hostname !== "127.0.0.1" && origin.hostname !== "localhost") {
  throw new Error("Refusing to test a non-HTTPS remote URL");
}

const securityHeaders = [
  "content-security-policy",
  "permissions-policy",
  "referrer-policy",
  "x-content-type-options",
  "x-frame-options",
];

const health = await request("/api/health", 200);
const healthBody = await health.json();
assert(Number.isInteger(healthBody.productCount) && healthBody.productCount > 0, "Health response has no product count");
for (const header of securityHeaders) assert(health.headers.has(header), `Missing security header: ${header}`);
assert(!health.headers.has("access-control-allow-origin"), "Unexpected permissive CORS header");

const list = await request("/api/products?pageSize=3&environment=indoor", 200);
const listBody = await list.json();
assert(Array.isArray(listBody.products) && listBody.products.length > 0, "Product list is empty");
assert(listBody.products.length <= 3, "Product page-size limit was not applied");

const product = listBody.products[0];
const detail = await request(`/api/products/${encodeURIComponent(product.slug)}`, 200);
const detailBody = await detail.json();
assert(detailBody.product?.slug === product.slug, "Product detail does not match list result");
assert(Array.isArray(detailBody.product.assets) && detailBody.product.assets.length > 0, "Product detail has no public assets");
assert(Array.isArray(detailBody.product.assetGroups?.product), "Product detail has no grouped product assets");
assert(Array.isArray(detailBody.product.assetGroups?.application), "Product detail has no grouped application assets");
assert(Array.isArray(detailBody.product.assetGroups?.lineDrawing), "Product detail has no grouped line-drawing assets");
assert(detailBody.product.assetGroups.product.length > 0, "Product detail has no grouped primary product image");

const assetPath = detailBody.product.assets[0].url;
const assetHead = await request(assetPath, 200, { method: "HEAD" });
assert(assetHead.headers.get("content-type") === "image/webp", "Public asset is not WebP");
assert(assetHead.headers.get("cache-control")?.includes("immutable"), "Public asset is not immutable-cached");
const etag = assetHead.headers.get("etag");
assert(etag, "Public asset has no ETag");
await request(assetPath, 304, { headers: { "if-none-match": etag } });

const writeAttempt = await request("/api/products", 405, { method: "POST" });
assert(writeAttempt.headers.get("allow") === "GET, HEAD", "Write rejection has an incorrect Allow header");
await request("/api/products?pageSize=500", 400);
await request("/assets/products/%2e%2e/private.webp", 400);

console.log(JSON.stringify({
  verified: true,
  origin: origin.origin,
  productCount: healthBody.productCount,
  testedProduct: product.slug,
  testedAsset: assetPath,
  checks: {
    d1Read: true,
    r2Read: true,
    conditionalAssetRequest: true,
    writeRejected: true,
    invalidInputRejected: true,
    traversalRejected: true,
    securityHeaders: securityHeaders.length,
    permissiveCorsAbsent: true,
  },
}, null, 2));

async function request(path, expectedStatus, init) {
  const response = await fetch(new URL(path, origin), { redirect: "error", ...init });
  if (response.status !== expectedStatus) {
    throw new Error(`${init?.method ?? "GET"} ${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  return response;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

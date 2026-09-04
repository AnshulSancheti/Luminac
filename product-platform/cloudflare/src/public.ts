type Row = Record<string, unknown>;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public allow?: string) {
    super(message);
  }
}

const API_SECURITY_HEADERS = {
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

const LEGACY_PUBLIC_ASSET_KEY = /^products\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/;
const VERSIONED_PUBLIC_ASSET_KEY = /^products\/[a-z0-9-]+\/(?:product|application|line-drawing)\/[a-z0-9-]+\.[a-f0-9]{12}\.webp$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_URL_LENGTH = 2048;
const MAX_PAGE_SIZE = 50;

export default {
  async fetch(request: Request, env: PublicEnv): Promise<Response> {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    let status = 500;
    let pathname = "/invalid-url";

    try {
      if (request.url.length > MAX_URL_LENGTH) throw new HttpError(414, "uri_too_long", "Request URL is too long");
      const url = new URL(request.url);
      pathname = url.pathname;
      let response: Response;

      if (url.pathname.startsWith("/assets/")) {
        response = await serveAsset(request, env, url.pathname.slice("/assets/".length));
      } else if (url.pathname.startsWith("/api/")) {
        response = await routeApi(request, env, url);
      } else {
        throw new HttpError(404, "not_found", "Route not found");
      }

      response = withRequestHeaders(response, env, requestId);
      status = response.status;
      return response;
    } catch (error) {
      const httpError = error instanceof HttpError ? error : null;
      status = httpError?.status ?? 500;
      const headers = new Headers({ "cache-control": "no-store" });
      if (httpError?.allow) headers.set("allow", httpError.allow);
      const response = json({
        error: httpError?.code ?? "internal_error",
        message: httpError?.message ?? "Internal server error",
        requestId,
      }, status, headers);
      return withRequestHeaders(response, env, requestId);
    } finally {
      console.log(JSON.stringify({
        event: "http_request",
        requestId,
        method: request.method,
        path: pathname,
        status,
        durationMs: Date.now() - startedAt,
        environment: env.ENVIRONMENT,
      }));
    }
  },
} satisfies ExportedHandler<PublicEnv>;

async function routeApi(request: Request, env: PublicEnv, url: URL): Promise<Response> {
  requireMethod(request, "GET, HEAD");

  if (url.pathname === "/api/health") {
    rejectUnknownParams(url, []);
    const count = await env.PUBLIC_DB.prepare("SELECT COUNT(*) AS count FROM products").first<number>("count");
    return json({ status: "ok", service: "luminac-public-catalog", environment: env.ENVIRONMENT, productCount: count ?? 0 }, 200, {
      "cache-control": "no-store",
    }, request.method === "HEAD");
  }

  if (url.pathname === "/api/categories") {
    rejectUnknownParams(url, []);
    const { results } = await env.PUBLIC_DB.prepare(
      "SELECT id,parent_id,level,environment,name,slug,full_slug,route_path,sort_order FROM catalog_categories ORDER BY CASE level WHEN 'environment' THEN 0 WHEN 'subcategory' THEN 1 ELSE 2 END,sort_order,name"
    ).all<Row>();
    return json({ categories: results }, 200, { "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" }, request.method === "HEAD");
  }

  if (url.pathname === "/api/products") return listProducts(request, env.PUBLIC_DB, url);

  const match = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (match) {
    rejectUnknownParams(url, []);
    const slug = safeDecode(match[1]);
    if (!SLUG.test(slug) || slug.length > 120) throw new HttpError(400, "invalid_slug", "Invalid product slug");
    return getProduct(request, env.PUBLIC_DB, slug);
  }

  throw new HttpError(404, "not_found", "Route not found");
}

async function listProducts(request: Request, db: D1Database, url: URL): Promise<Response> {
  rejectUnknownParams(url, ["q", "environment", "category", "page", "pageSize"]);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > 80) throw new HttpError(400, "invalid_query", "Search text must be 80 characters or fewer");

  const environment = url.searchParams.get("environment") ?? "";
  if (environment && environment !== "indoor" && environment !== "outdoor") {
    throw new HttpError(400, "invalid_environment", "Environment must be indoor or outdoor");
  }

  const category = url.searchParams.get("category") ?? "";
  if (category && (!SLUG.test(category) || category.length > 120)) {
    throw new HttpError(400, "invalid_category", "Invalid category slug");
  }

  const page = parseBoundedInteger(url.searchParams.get("page"), 1, 1, 10000, "page");
  const pageSize = parseBoundedInteger(url.searchParams.get("pageSize"), 24, 1, MAX_PAGE_SIZE, "pageSize");
  const where = [];
  const bindings: unknown[] = [];

  if (environment) {
    where.push("pf.environment = ?");
    bindings.push(environment);
  }
  if (category) {
    where.push("(cc.slug = ? OR cc.full_slug = ?)");
    bindings.push(category, category);
  }
  if (q) {
    const like = `%${escapeLike(q.toLocaleLowerCase("en"))}%`;
    where.push("(lower(p.model_no) LIKE ? ESCAPE '\\' OR lower(p.display_name) LIKE ? ESCAPE '\\' OR lower(pf.display_name) LIKE ? ESCAPE '\\')");
    bindings.push(like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const from = "FROM products p JOIN product_families pf ON pf.id=p.family_id JOIN catalog_categories cc ON cc.id=pf.category_id";
  const countStatement = db.prepare(`SELECT COUNT(*) AS count ${from} ${clause}`).bind(...bindings);
  const rowsStatement = db.prepare(`
    SELECT p.id,p.model_no,p.slug,p.display_name,p.variant_label,p.power_text,p.power_watts,p.is_primary_variant,
      pf.slug AS family_slug,pf.display_name AS family_name,pf.series_label,pf.environment,
      cc.slug AS category_slug,cc.full_slug AS category_full_slug,cc.name AS category_name,
      af.storage_key AS primary_image_key,pa.alt_text AS primary_image_alt
    ${from}
    LEFT JOIN product_assets pa ON pa.product_id=p.id AND pa.is_primary=1 AND pa.is_public=1
    LEFT JOIN asset_files af ON af.id=pa.asset_id
    ${clause}
    ORDER BY pf.sort_order,p.sort_order,p.model_no
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, (page - 1) * pageSize);

  const [countResult, rowsResult] = await db.batch([countStatement, rowsStatement]);
  const total = Number((countResult.results[0] as Row | undefined)?.count ?? 0);
  const products = rowsResult.results.map((row) => presentProductSummary(row as Row));
  return json({ products, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } }, 200, {
    "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  }, request.method === "HEAD");
}

async function getProduct(request: Request, db: D1Database, slug: string): Promise<Response> {
  const product = await db.prepare(`
    SELECT p.id,p.model_no,p.slug,p.display_name,p.variant_label,p.power_text,p.power_watts,p.is_primary_variant,
      pf.id AS family_id,pf.slug AS family_slug,pf.display_name AS family_name,pf.series_label,pf.short_description,pf.description,pf.environment,
      cc.id AS category_id,cc.slug AS category_slug,cc.full_slug AS category_full_slug,cc.name AS category_name,cc.route_path AS category_route_path
    FROM products p
    JOIN product_families pf ON pf.id=p.family_id
    JOIN catalog_categories cc ON cc.id=pf.category_id
    WHERE p.slug=?
  `).bind(slug).first<Row>();
  if (!product) throw new HttpError(404, "product_not_found", "Product not found");

  const productId = String(product.id);
  const [indoor, outdoor, specs, extras, assets, tags, seo] = await db.batch([
    db.prepare("SELECT size_text,cutout_text,finish_text,cct_text,beam_angle_text,light_source,ip_rating,cri FROM indoor_product_details WHERE product_id=?").bind(productId),
    db.prepare("SELECT size_text,finish_text,cct_text,light_source,ip_rating FROM outdoor_product_details WHERE product_id=?").bind(productId),
    db.prepare("SELECT spec_key,spec_label,value_text,value_normalized,value_number,unit,sort_order FROM product_spec_values WHERE product_id=? ORDER BY sort_order,id").bind(productId),
    db.prepare("SELECT field_group,field_key,field_label,value_text,value_number,unit,sort_order FROM product_extra_fields WHERE product_id=? ORDER BY sort_order,id").bind(productId),
    db.prepare("SELECT af.storage_key,af.mime_type,af.width,af.height,pa.asset_role,pa.variant,pa.title,pa.alt_text,pa.caption,pa.sort_order,pa.is_primary FROM product_assets pa JOIN asset_files af ON af.id=pa.asset_id WHERE pa.product_id=? AND pa.is_public=1 ORDER BY pa.asset_role,pa.sort_order,pa.id").bind(productId),
    db.prepare("SELECT t.tag_type,t.name,t.slug FROM product_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.product_id=? ORDER BY t.sort_order,t.name").bind(productId),
    db.prepare("SELECT route_path,canonical_path,meta_title,meta_description,og_title,og_description,schema_json,noindex FROM seo_entries WHERE product_id=?").bind(productId),
  ]);

  const detail = product.environment === "indoor" ? indoor.results[0] ?? null : outdoor.results[0] ?? null;
  const presentedAssets: Row[] = assets.results.map((asset): Row => {
    const row = asset as Row;
    return { ...row, url: row.storage_key ? `/assets/${row.storage_key}` : null };
  }).sort((left, right) => assetRoleRank(left.asset_role) - assetRoleRank(right.asset_role) || Number(left.sort_order) - Number(right.sort_order));
  return json({
    product: {
      ...presentProductSummary(product),
      family: {
        id: product.family_id,
        slug: product.family_slug,
        name: product.family_name,
        seriesLabel: product.series_label,
        shortDescription: product.short_description,
        description: product.description,
      },
      category: {
        id: product.category_id,
        slug: product.category_slug,
        fullSlug: product.category_full_slug,
        name: product.category_name,
        routePath: product.category_route_path,
      },
      details: detail,
      specifications: specs.results,
      extraFields: extras.results,
      assets: presentedAssets,
      assetGroups: groupAssets(presentedAssets),
      tags: tags.results,
      seo: seo.results[0] ? presentSeo(seo.results[0] as Row) : null,
    },
  }, 200, { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" }, request.method === "HEAD");
}

async function serveAsset(request: Request, env: PublicEnv, encodedKey: string): Promise<Response> {
  requireMethod(request, "GET, HEAD");
  const key = encodedKey.split("/").map(safeDecode).join("/");
  if (!LEGACY_PUBLIC_ASSET_KEY.test(key) && !VERSIONED_PUBLIC_ASSET_KEY.test(key)) {
    throw new HttpError(400, "invalid_asset_key", "Invalid asset key");
  }

  if (request.method === "HEAD") {
    const object = await env.PUBLIC_ASSETS.head(key);
    if (!object) throw new HttpError(404, "asset_not_found", "Asset not found");
    return new Response(null, { status: 200, headers: assetHeaders(object) });
  }

  const object = await env.PUBLIC_ASSETS.get(key, { onlyIf: request.headers });
  if (!object) throw new HttpError(404, "asset_not_found", "Asset not found");
  if (!("body" in object)) return new Response(null, { status: 304, headers: assetHeaders(object) });
  return new Response(object.body, { status: 200, headers: assetHeaders(object) });
}

function presentProductSummary(row: Row) {
  return {
    id: row.id,
    modelNo: row.model_no,
    slug: row.slug,
    name: row.display_name,
    variantLabel: row.variant_label,
    powerText: row.power_text,
    powerWatts: row.power_watts,
    isPrimaryVariant: row.is_primary_variant === 1,
    environment: row.environment,
    family: row.family_slug ? { slug: row.family_slug, name: row.family_name, seriesLabel: row.series_label } : undefined,
    category: row.category_slug ? { slug: row.category_slug, fullSlug: row.category_full_slug, name: row.category_name } : undefined,
    primaryImage: row.primary_image_key ? { url: `/assets/${row.primary_image_key}`, alt: row.primary_image_alt } : null,
  };
}

function groupAssets(assets: Row[]) {
  return {
    product: assets.filter((asset) => asset.asset_role === "product"),
    application: assets.filter((asset) => asset.asset_role === "application"),
    lineDrawing: assets.filter((asset) => asset.asset_role === "line_drawing"),
  };
}

function assetRoleRank(value: unknown): number {
  if (value === "product") return 0;
  if (value === "application") return 1;
  if (value === "line_drawing") return 2;
  return 99;
}

function json(body: unknown, status = 200, headersInit?: HeadersInit, head = false): Response {
  const headers = new Headers(headersInit);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(head ? null : JSON.stringify(body), { status, headers });
}

function withRequestHeaders(response: Response, env: PublicEnv, requestId: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) headers.set(name, value);
  headers.set("x-request-id", requestId);
  if (env.ENABLE_HSTS === "true") headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function assetHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

function requireMethod(request: Request, allow: string): void {
  if (!allow.split(", ").includes(request.method)) throw new HttpError(405, "method_not_allowed", `Allowed methods: ${allow}`, allow);
}

function rejectUnknownParams(url: URL, allowed: string[]): void {
  const allow = new Set(allowed);
  for (const key of url.searchParams.keys()) {
    if (!allow.has(key)) throw new HttpError(400, "unknown_parameter", `Unknown query parameter: ${key}`);
  }
}

function parseBoundedInteger(raw: string | null, fallback: number, min: number, max: number, name: string): number {
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new HttpError(400, `invalid_${name}`, `${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, `invalid_${name}`, `${name} must be between ${min} and ${max}`);
  }
  return value;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid_encoding", "Invalid URL encoding");
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function presentSeo(row: Row): Row {
  return { ...row, schema_json: parseJsonObject(row.schema_json) };
}

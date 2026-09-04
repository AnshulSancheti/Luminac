import assert from "node:assert/strict";

const origin = process.argv[2] ?? "http://127.0.0.1:8788";
const status = await jsonRequest("/api/status");
assert.equal(status.writesEnabled, true);
assert.equal(status.authenticatedAdmin, "shivam@luminac.net");
assert.match(status.csrfToken, /^[a-f0-9]{64}$/);

const list = await jsonRequest("/api/products");
assert.equal(list.total, 135);
const productId = list.products.find((product) => product.model_no === "LF-LL-1337A")?.id;
assert.ok(productId, "Expected at least one local product");

const initial = await jsonRequest(`/api/products/${encodeURIComponent(productId)}`);
const originalDraft = structuredClone(initial.editable);
const originalName = initial.product.product.display_name;
const originalVersion = initial.product.product.version;
assert.ok(Number.isSafeInteger(originalVersion) && originalVersion >= 1);
const originalSpecs = structuredClone(initial.product.specs);
const originalExtras = structuredClone(initial.product.extras);
const originalIndoorDetail = structuredClone(initial.product.indoorDetail);
const originalOutdoorDetail = structuredClone(initial.product.outdoorDetail);
assert.ok(originalSpecs.some((spec) => spec.spec_key === "cct_range"), "Fixture must include an underscore spec key");
assert.ok(originalSpecs.some((spec) => spec.spec_key === "cct_mode"), "Fixture must include a second underscore spec key");

const changedDraft = structuredClone(originalDraft);
changedDraft.product.display_name = `${originalName} [local-write-test]`;
let testApplied = false;

try {
  await expectStatus(403, `/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: writeHeaders(originalVersion, { csrf: false }),
    body: JSON.stringify({ confirm: true, draft: changedDraft }),
  });
  await expectStatus(403, `/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: writeHeaders(originalVersion, { origin: "https://attacker.invalid" }),
    body: JSON.stringify({ confirm: true, draft: changedDraft }),
  });

  if (originalDraft.specValues.length) {
    const removalDraft = structuredClone(originalDraft);
    removalDraft.specValues.pop();
    await expectStatus(400, `/api/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      headers: writeHeaders(originalVersion),
      body: JSON.stringify({ confirm: true, draft: removalDraft }),
    });
  }

  const changed = await jsonRequest(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: writeHeaders(originalVersion),
    body: JSON.stringify({ confirm: true, draft: changedDraft }),
  });
  testApplied = true;
  assert.equal(changed.product.product.display_name, changedDraft.product.display_name);
  assert.equal(changed.product.product.version, originalVersion + 1);
  assert.equal(changed.auditLog.written, true);
  assert.equal(changed.auditLog.actorEmail, "shivam@luminac.net");
  assert.deepEqual(changed.product.specs, originalSpecs, "Product-only write must not rewrite parsed specs");
  assert.deepEqual(changed.product.extras, originalExtras, "Product-only write must not rewrite extra fields");
  assert.deepEqual(changed.product.indoorDetail, originalIndoorDetail, "Product-only write must not rewrite indoor details");
  assert.deepEqual(changed.product.outdoorDetail, originalOutdoorDetail, "Product-only write must not rewrite outdoor details");
  assert.equal(changed.changedFields.length, 1);
  assert.equal(changed.changedFields[0].section, "product");
  assert.equal(changed.changedFields[0].field, "display_name");

  await expectStatus(409, `/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: writeHeaders(originalVersion),
    body: JSON.stringify({ confirm: true, draft: originalDraft }),
  });

  const restored = await jsonRequest(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: writeHeaders(changed.product.product.version),
    body: JSON.stringify({ confirm: true, draft: originalDraft }),
  });
  testApplied = false;
  assert.equal(restored.product.product.display_name, originalName);
  assert.equal(restored.product.product.version, originalVersion + 2);
  assert.equal(restored.auditLog.written, true);

  console.log(JSON.stringify({
    verified: true,
    scope: "local D1 only",
    productId,
    restored: true,
    checks: {
      csrfRejected: true,
      foreignOriginRejected: true,
      signedActorUsed: true,
      atomicWriteAndAudit: true,
      staleVersionRejected: true,
      rowDeletionRejected: originalDraft.specValues.length > 0,
      untouchedSectionsPreservedExactly: true,
      reversibleCanaryRestored: true,
    },
  }, null, 2));
} finally {
  if (testApplied) {
    const current = await jsonRequest(`/api/products/${encodeURIComponent(productId)}`);
    await jsonRequest(`/api/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      headers: writeHeaders(current.product.product.version),
      body: JSON.stringify({ confirm: true, draft: originalDraft }),
    });
  }
}

function writeHeaders(version, overrides = {}) {
  const headers = {
    "content-type": "application/json",
    origin: overrides.origin ?? origin,
    "if-match": `"${version}"`,
  };
  if (overrides.csrf !== false) headers["x-luminac-csrf"] = status.csrfToken;
  return headers;
}

async function jsonRequest(path, options) {
  const response = await fetch(new URL(path, origin), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function expectStatus(expected, path, options) {
  const response = await fetch(new URL(path, origin), options);
  assert.equal(response.status, expected, await response.text());
}

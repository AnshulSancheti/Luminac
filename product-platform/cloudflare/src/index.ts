import {
  EXTRA_FIELD_FIELDS,
  INDOOR_DETAIL_FIELDS,
  OUTDOOR_DETAIL_FIELDS,
  PRODUCT_EDIT_FIELDS,
  SPEC_VALUE_FIELDS,
  STATUS_OPTIONS,
  buildCategoryBreadcrumb,
  composeProductRecord,
  diffEditable,
  editableFromRecord,
  facetSummary,
  groupBy,
  indexBy,
  isBlank,
  matchesProductFilters,
  normalizeToken,
  summarizeProductRecord,
} from "../../src/lib/productQaCore.js";
import { createRemoteJWKSet, jwtVerify } from "jose";

type Row = Record<string, unknown>;
type AccessPrincipal = { email: string; sessionSeed: string };
type EditableDraft = {
  product: Row;
  indoorDetail: Row;
  outdoorDetail: Row;
  specValues: Row[];
  extraFields: Row[];
};

const MAX_URL_LENGTH = 2048;
const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_CHILD_ROWS = 64;
let cachedAccessJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedAccessJwksUrl: string | undefined;
const ADMIN_SECURITY_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  "pragma": "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: AdminEnv, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    let pathname = "/invalid-url";
    let status = 500;

    try {
      if (request.url.length > MAX_URL_LENGTH) throw new HttpError(414, "uri_too_long", "Request URL is too long");
      const url = new URL(request.url);
      pathname = url.pathname;
      const principal = await requireAccessIdentity(request, ctx, env);

      let response: Response;
      if (url.pathname === "/lib/productQaCore.js") {
        requireReadMethod(request);
        response = await env.ASSETS.fetch(new Request(new URL("/lib/productQaCore.js", url), request));
      } else if (url.pathname.startsWith("/api/images/")) {
        response = await serveImage(request, env, url.pathname.slice("/api/images/".length));
      } else if (url.pathname.startsWith("/api/")) {
        response = await routeApi(request, env, url, principal);
      } else {
        requireReadMethod(request);
        response = await env.ASSETS.fetch(request);
      }

      response = withAdminHeaders(response, requestId);
      status = response.status;
      return response;
    } catch (error) {
      status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : "internal_error";
      const message = error instanceof HttpError ? error.message : "Internal server error";
      if (!(error instanceof HttpError)) {
        console.error(JSON.stringify({ event: "request_error", requestId, code, error: error instanceof Error ? error.message : String(error) }));
      }
      const response = Response.json({ error: code, message, requestId }, { status });
      return withAdminHeaders(response, requestId);
    } finally {
      console.log(JSON.stringify({
        event: "admin_http_request",
        requestId,
        method: request.method,
        path: pathname,
        status,
        durationMs: Date.now() - startedAt,
        environment: env.ENVIRONMENT,
      }));
    }
  },
} satisfies ExportedHandler<AdminEnv>;

async function requireAccessIdentity(request: Request, ctx: ExecutionContext, env: AdminEnv): Promise<AccessPrincipal> {
  const expectedAudience = env.ACCESS_AUD?.trim();
  const expectedEmail = env.ACCESS_ADMIN_EMAIL?.trim().toLowerCase();
  const teamDomain = parseAccessTeamDomain(env.ACCESS_TEAM_DOMAIN);
  if (!expectedAudience || !expectedEmail || !teamDomain) {
    throw new HttpError(403, "access_denied", "Access denied");
  }

  const access = ctx.access;
  if (access) {
    if (access.aud !== expectedAudience) {
      throw new HttpError(403, "access_denied", "Access denied");
    }

    const identity = await access.getIdentity();
    const email = requireExpectedAccessEmail(identity?.email, expectedEmail);
    return { email, sessionSeed: `local:${expectedAudience}:${email}` };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    throw new HttpError(403, "access_denied", "Access denied");
  }

  try {
    const { payload } = await jwtVerify(token, getAccessJwks(teamDomain), {
      issuer: teamDomain.origin,
      audience: expectedAudience,
      algorithms: ["RS256"],
    });
    const email = requireExpectedAccessEmail(payload.email, expectedEmail);
    return { email, sessionSeed: token };
  } catch {
    throw new HttpError(403, "access_denied", "Access denied");
  }
}

function parseAccessTeamDomain(value: string | undefined): URL | null {
  try {
    const url = new URL(value?.trim() ?? "");
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".cloudflareaccess.com") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function getAccessJwks(teamDomain: URL): ReturnType<typeof createRemoteJWKSet> {
  const jwksUrl = new URL("/cdn-cgi/access/certs", teamDomain).href;
  if (!cachedAccessJwks || cachedAccessJwksUrl !== jwksUrl) {
    cachedAccessJwks = createRemoteJWKSet(new URL(jwksUrl));
    cachedAccessJwksUrl = jwksUrl;
  }
  return cachedAccessJwks;
}

function requireExpectedAccessEmail(value: unknown, expectedEmail: string): string {
  if (typeof value !== "string" || value.trim().toLowerCase() !== expectedEmail) {
    throw new HttpError(403, "access_denied", "Access denied");
  }
  return expectedEmail;
}

function requireReadMethod(request: Request): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "method_not_allowed", "Only GET and HEAD are allowed");
  }
}

function withAdminHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ADMIN_SECURITY_HEADERS)) headers.set(name, value);
  headers.set("x-request-id", requestId);
  headers.append("vary", "Cookie");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function routeApi(request: Request, env: AdminEnv, url: URL, principal: AccessPrincipal): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/status") {
    const productCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE deleted_at IS NULL").first<number>("count");
    const writesEnabled = String(env.WRITES_ENABLED) === "true";
    return Response.json({
      app: "Luminac Product QA", mode: "cloudflare-d1", environment: env.ENVIRONMENT,
      writesEnabled, readOnlyReason: writesEnabled ? null : "QA writes are disabled.",
      productCount: productCount ?? 0, imageStorage: "cloudflare-r2", staleGeneratedTypes: false,
      authenticatedAdmin: principal.email,
      csrfToken: await createCsrfToken(principal.sessionSeed),
    });
  }

  if (request.method === "GET" && url.pathname === "/api/products") {
    const snapshot = await loadCatalogSnapshot(env.DB);
    const filters = Object.fromEntries(["search","environment","status","category","light_source","cct","finish","ip_rating"].map((key) => [key, url.searchParams.get(key) ?? (key === "environment" || key === "status" || key === "category" ? "all" : "")]));
    const filtered = snapshot.records.filter((record) => matchesProductFilters(record, filters));
    return Response.json({ products: filtered.map(summarizeProductRecord), total: filtered.length, unfilteredTotal: snapshot.records.length, facets: facetSummary(snapshot.records), mode: "cloudflare-d1" });
  }

  const match = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (match && request.method === "GET") {
    const productId = decodeURIComponent(match[1]);
    const snapshot = await loadCatalogSnapshot(env.DB, productId);
    if (!snapshot.records.length) throw new HttpError(404, "product_not_found", "Product not found");
    const product = snapshot.records[0];
    return Response.json(
      { product, editable: editableFromRecord(product), mode: "cloudflare-d1" },
      { headers: { etag: quoteVersion(product.product?.version) } },
    );
  }

  if (match && request.method === "PATCH") {
    requireWritesEnabled(env);
    await requireWriteRequest(request, url, principal);
    const payload = await readJsonBody(request);
    const productId = decodeURIComponent(match[1]);
    return Response.json(await updateProduct(env.DB, productId, payload, principal, request.headers.get("if-match")));
  }

  const reviewMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/review$/);
  if (reviewMatch && request.method === "POST") {
    requireWritesEnabled(env);
    await requireWriteRequest(request, url, principal);
    const payload = await readJsonBody(request);
    const productId = decodeURIComponent(reviewMatch[1]);
    return Response.json(await writeReviewAudit(env.DB, productId, payload, principal, request.headers.get("if-match")));
  }
  throw new HttpError(404, "not_found", "Route not found");
}

function requireWritesEnabled(env: AdminEnv): void {
  if (String(env.WRITES_ENABLED) !== "true") {
    throw new HttpError(403, "read_only", "D1 QA writes are disabled.");
  }
}

async function requireWriteRequest(request: Request, url: URL, principal: AccessPrincipal): Promise<void> {
  if (request.headers.get("origin") !== url.origin) {
    throw new HttpError(403, "invalid_origin", "Write request origin was rejected.");
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "unsupported_media_type", "Writes require application/json.");
  }
  const provided = request.headers.get("x-luminac-csrf") ?? "";
  const expected = await createCsrfToken(principal.sessionSeed);
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(provided);
  const expectedBytes = encoder.encode(expected);
  if (providedBytes.byteLength !== expectedBytes.byteLength || !crypto.subtle.timingSafeEqual(providedBytes, expectedBytes)) {
    throw new HttpError(403, "csrf_rejected", "CSRF validation failed.");
  }
}

async function createCsrfToken(sessionSeed: string): Promise<string> {
  const bytes = new TextEncoder().encode(`luminac-admin-csrf-v1\0${sessionSeed}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readJsonBody(request: Request): Promise<Row> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }
  if (!request.body) throw new HttpError(400, "invalid_json", "A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "payload_too_large", "Request body is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    if (!isRow(parsed)) throw new Error("JSON root must be an object");
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function updateProduct(
  db: D1Database,
  productId: string,
  payload: Row,
  principal: AccessPrincipal,
  ifMatch: string | null,
) {
  if (payload.confirm !== true) throw new HttpError(400, "confirmation_required", "Explicit save confirmation is required.");
  const expectedVersion = parseIfMatch(ifMatch);
  const beforeRecord = await loadProductRecord(db, productId);
  const currentVersion = positiveInteger(requiredRow(beforeRecord.product, "product").version, "version");
  if (expectedVersion !== currentVersion) throw new HttpError(409, "stale_write", "Product changed after it was loaded. Refresh before saving.");

  const draft = sanitizeEditableDraft(payload.draft);
  const beforeEditable = editableFromRecord(beforeRecord);
  const requestedChanges = diffEditable(beforeEditable, draft);
  if (!requestedChanges.length) {
    return { product: beforeRecord, changedFields: [], auditLog: { written: false, reason: "No changes" } };
  }

  const sectionChanged = (section: keyof EditableDraft): boolean => requestedChanges.some(
    (change: Row) => change.section === section || String(change.section ?? "").startsWith(`${section}.`),
  );

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (sectionChanged("product")) {
    statements.push(db.prepare(`
      UPDATE products SET
        display_name = ?, variant_label = ?, power_text = ?, power_watts = ?, status = ?,
        is_primary_variant = ?, sort_order = ?, mrp_inr = ?
      WHERE id = ? AND version = ?
    `).bind(
      draft.product.display_name, draft.product.variant_label, draft.product.power_text,
      draft.product.power_watts, draft.product.status, booleanInteger(draft.product.is_primary_variant),
      draft.product.sort_order, draft.product.mrp_inr, productId, expectedVersion,
    ));
  }

  if (sectionChanged("indoorDetail")) {
    appendDetailStatements(statements, db, "indoor_product_details", productId, expectedVersion, beforeRecord.indoorDetail, draft.indoorDetail, INDOOR_DETAIL_FIELDS, now);
  }
  if (sectionChanged("outdoorDetail")) {
    appendDetailStatements(statements, db, "outdoor_product_details", productId, expectedVersion, beforeRecord.outdoorDetail, draft.outdoorDetail, OUTDOOR_DETAIL_FIELDS, now);
  }
  if (sectionChanged("specValues")) {
    appendChildChangeStatements(statements, db, "product_spec_values", productId, expectedVersion, beforeEditable.specValues, draft.specValues, now);
  }
  if (sectionChanged("extraFields")) {
    appendChildChangeStatements(statements, db, "product_extra_fields", productId, expectedVersion, beforeEditable.extraFields, draft.extraFields, now);
  }

  const auditId = crypto.randomUUID();
  statements.push(db.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, metadata, created_at)
    SELECT ?, ?, 'product_qa_update', 'product', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND version = ?)
  `).bind(auditId, principal.email, productId, JSON.stringify({
    changed_fields: requestedChanges,
    before: beforeEditable,
    after: draft,
    client_confirmed: true,
    concurrency_version: expectedVersion,
  }), now, productId, expectedVersion));
  statements.push(db.prepare(`
    UPDATE products SET updated_at = ?, version = version + 1
    WHERE id = ? AND version = ?
  `).bind(now, productId, expectedVersion));

  const results = await db.batch(statements);
  const versionResult = results.at(-1);
  if (!versionResult || versionResult.meta.changes !== 1) {
    throw new HttpError(409, "stale_write", "Product changed while it was being saved. Refresh before retrying.");
  }

  const afterRecord = await loadProductRecord(db, productId);
  return {
    product: afterRecord,
    changedFields: diffEditable(beforeEditable, editableFromRecord(afterRecord)),
    auditLog: { written: true, id: auditId, actorEmail: principal.email },
  };
}

async function writeReviewAudit(
  db: D1Database,
  productId: string,
  payload: Row,
  principal: AccessPrincipal,
  ifMatch: string | null,
) {
  if (payload.confirm !== true) throw new HttpError(400, "confirmation_required", "Explicit review confirmation is required.");
  const expectedVersion = parseIfMatch(ifMatch);
  const status = requiredText(payload.status, "status", 32);
  if (!["needs_review", "reviewed_ok", "corrected", "blocked"].includes(status)) {
    throw new HttpError(400, "invalid_review_status", "Invalid review status.");
  }
  const notes = optionalText(payload.notes, "notes", 2000) ?? "";
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const result = await db.prepare(`
    INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, metadata, created_at)
    SELECT ?, ?, 'product_qa_review_status', 'product', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND version = ? AND deleted_at IS NULL)
  `).bind(id, principal.email, productId, JSON.stringify({
    review_status: status,
    notes,
    persisted_review_state: false,
    concurrency_version: expectedVersion,
  }), createdAt, productId, expectedVersion).run();
  if (result.meta.changes !== 1) throw new HttpError(409, "stale_write", "Product changed after it was loaded. Refresh before saving the review.");
  return { auditLog: { written: true, id, actorEmail: principal.email } };
}

async function loadProductRecord(db: D1Database, productId: string): Promise<Row> {
  const snapshot = await loadCatalogSnapshot(db, productId);
  if (!snapshot.records.length) throw new HttpError(404, "product_not_found", "Product not found");
  return snapshot.records[0];
}

function appendDetailStatements(
  statements: D1PreparedStatement[],
  db: D1Database,
  table: "indoor_product_details" | "outdoor_product_details",
  productId: string,
  expectedVersion: number,
  before: unknown,
  after: Row,
  fields: string[],
  now: string,
): void {
  const hasExisting = isRow(before);
  const hasAnyValue = fields.some((field) => !isBlank(after[field]));
  if (!hasExisting && !hasAnyValue) return;
  const assignments = fields.map((field) => `${field} = ?`).join(", ");
  statements.push(db.prepare(`
    UPDATE ${table} SET ${assignments}, updated_at = ?
    WHERE product_id = ? AND EXISTS (
      SELECT 1 FROM products WHERE id = ? AND version = ?
    )
  `).bind(...fields.map((field) => dbValue(after[field])), now, productId, productId, expectedVersion));
  if (!hasExisting) {
    const columns = ["product_id", ...fields, "created_at", "updated_at"];
    const placeholders = columns.map(() => "?").join(", ");
    statements.push(db.prepare(`
      INSERT INTO ${table} (${columns.join(", ")})
      SELECT ${placeholders}
      WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE product_id = ?)
        AND EXISTS (SELECT 1 FROM products WHERE id = ? AND version = ?)
    `).bind(productId, ...fields.map((field) => dbValue(after[field])), now, now, productId, productId, expectedVersion));
  }
}

function appendChildChangeStatements(
  statements: D1PreparedStatement[],
  db: D1Database,
  table: "product_spec_values" | "product_extra_fields",
  productId: string,
  expectedVersion: number,
  beforeRows: Row[],
  afterRows: Row[],
  now: string,
): void {
  const fields = table === "product_spec_values" ? SPEC_VALUE_FIELDS : EXTRA_FIELD_FIELDS;
  const beforeById = new Map(beforeRows.map((row) => [String(row.id), row]));
  const retainedIds = new Set(afterRows.flatMap((row) => row.id ? [String(row.id)] : []));
  const removed = [...beforeById.keys()].filter((id) => !retainedIds.has(id));
  if (removed.length) {
    throw new HttpError(400, "row_deletion_disabled", `${table} row removal is disabled.`);
  }

  for (const row of afterRows) {
    const rowId = row.id ? String(row.id) : null;
    if (rowId) {
      const before = beforeById.get(rowId);
      if (!before) throw new HttpError(400, "invalid_child_id", `${table} contains an unknown row id.`);
      const changed = fields.some((field) => String(before[field] ?? "") !== String(row[field] ?? ""));
      if (!changed) continue;
      const assignments = fields.map((field) => `${field} = ?`).join(", ");
      statements.push(db.prepare(`
        UPDATE ${table} SET ${assignments}
        WHERE id = ? AND product_id = ?
          AND EXISTS (SELECT 1 FROM products WHERE id = ? AND version = ?)
      `).bind(...fields.map((field) => dbValue(row[field])), rowId, productId, productId, expectedVersion));
      continue;
    }

    const columns = ["id", "product_id", ...fields, "created_at"];
    const placeholders = columns.map(() => "?").join(", ");
    statements.push(db.prepare(`
      INSERT INTO ${table} (${columns.join(", ")})
      SELECT ${placeholders}
      WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND version = ?)
    `).bind(
      crypto.randomUUID(), productId, ...fields.map((field) => dbValue(row[field])), now,
      productId, expectedVersion,
    ));
  }
}

function sanitizeEditableDraft(value: unknown): EditableDraft {
  if (!isRow(value)) throw new HttpError(400, "invalid_payload", "Missing editable product draft.");
  const productSource = requiredRow(value.product, "product");
  const product = sanitizeFields(productSource, PRODUCT_EDIT_FIELDS);
  product.display_name = requiredText(product.display_name, "display_name", 160);
  const status = requiredText(product.status, "status", 32);
  if (!STATUS_OPTIONS.includes(status)) throw new HttpError(400, "invalid_status", "Invalid product status.");
  product.status = status;

  const indoorDetail = sanitizeFields(optionalRow(value.indoorDetail, "indoorDetail"), INDOOR_DETAIL_FIELDS);
  const outdoorDetail = sanitizeFields(optionalRow(value.outdoorDetail, "outdoorDetail"), OUTDOOR_DETAIL_FIELDS);
  const specValues = sanitizeChildRows(value.specValues, "product_spec_values");
  const extraFields = sanitizeChildRows(value.extraFields, "product_extra_fields");
  return { product, indoorDetail, outdoorDetail, specValues, extraFields };
}

function sanitizeChildRows(value: unknown, table: "product_spec_values" | "product_extra_fields"): Row[] {
  if (!Array.isArray(value)) throw new HttpError(400, "invalid_payload", `${table} must be an array.`);
  if (value.length > MAX_CHILD_ROWS) throw new HttpError(400, "too_many_rows", `${table} has too many rows.`);
  const fields = table === "product_spec_values" ? SPEC_VALUE_FIELDS : EXTRA_FIELD_FIELDS;
  const rows: Row[] = [];
  const unique = new Set<string>();
  const rowIds = new Set<string>();
  for (const rawRow of value) {
    const source = requiredRow(rawRow, table);
    const rawId = optionalText(source.id, "id", 64);
    if (rawId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)) {
      throw new HttpError(400, "invalid_child_id", `${table} contains an invalid row id.`);
    }
    if (rawId && rowIds.has(rawId)) throw new HttpError(400, "duplicate_child_id", `${table} contains a duplicate row id.`);
    if (rawId) rowIds.add(rawId);
    const row: Row = { id: rawId, ...sanitizeFields(source, fields) };
    const keyField = table === "product_spec_values" ? "spec_key" : "field_key";
    const key = optionalText(row[keyField], keyField, 64)?.toLowerCase() ?? "";
    const text = optionalText(row.value_text, "value_text", 500);
    if (!key && !text) continue;
    if (!key || !text) throw new HttpError(400, "invalid_child_row", `${table} rows require a key and value.`);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) throw new HttpError(400, "invalid_child_key", `Invalid ${keyField}.`);
    row[keyField] = key;
    row.value_text = text;
    if (table === "product_spec_values") {
      row.spec_label = optionalText(row.spec_label, "spec_label", 120) ?? key;
      row.value_normalized = normalizeToken(row.value_normalized ?? text);
      if (!row.value_normalized) throw new HttpError(400, "invalid_child_row", "Spec value normalization cannot be empty.");
      const identity = `${key}\0${row.value_normalized}`;
      if (unique.has(identity)) throw new HttpError(400, "duplicate_child_row", "Duplicate normalized spec value.");
      unique.add(identity);
    } else {
      row.field_group = optionalText(row.field_group, "field_group", 64) ?? "general";
      row.field_label = optionalText(row.field_label, "field_label", 120) ?? key;
      if (unique.has(key)) throw new HttpError(400, "duplicate_child_row", "Duplicate extra field key.");
      unique.add(key);
    }
    rows.push(row);
  }
  return rows;
}

function sanitizeFields(source: Row, fields: string[]): Row {
  const result: Row = {};
  for (const field of fields) result[field] = sanitizeField(field, source[field]);
  return result;
}

function sanitizeField(field: string, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (["is_primary_variant", "is_public"].includes(field)) {
    if (typeof value !== "boolean") throw new HttpError(400, "invalid_field", `${field} must be a boolean.`);
    return value;
  }
  const integerBounds: Record<string, [number, number]> = { sort_order: [0, 1_000_000], mrp_inr: [0, 1_000_000_000], cri: [0, 100] };
  if (field in integerBounds) return boundedNumber(value, field, integerBounds[field], true);
  if (["power_watts", "value_number"].includes(field)) return boundedNumber(value, field, [0, 1_000_000], false);
  const maxLength: Record<string, number> = {
    display_name: 160, variant_label: 160, power_text: 120, status: 32,
    size_text: 500, cutout_text: 500, finish_text: 500, cct_text: 500,
    beam_angle_text: 500, light_source: 500, ip_rating: 64,
    spec_key: 64, spec_label: 120, value_text: 500, value_normalized: 160,
    unit: 32, source_text: 1000, field_group: 64, field_key: 64, field_label: 120,
  };
  return optionalText(value, field, maxLength[field] ?? 500);
}

function boundedNumber(value: unknown, field: string, [minimum, maximum]: [number, number], integer: boolean): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < minimum || parsed > maximum) {
    throw new HttpError(400, "invalid_field", `${field} is outside the allowed range.`);
  }
  return parsed;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const text = optionalText(value, field, maxLength);
  if (!text) throw new HttpError(400, "invalid_field", `${field} is required.`);
  return text;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "invalid_field", `${field} must be text.`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new HttpError(400, "invalid_field", `${field} is too long.`);
  return text;
}

function parseIfMatch(value: string | null): number {
  const match = value?.match(/^"([1-9][0-9]*)"$/);
  if (!match) throw new HttpError(428, "precondition_required", "A quoted product version is required in If-Match.");
  return positiveInteger(match[1], "If-Match");
}

function quoteVersion(value: unknown): string {
  return `"${positiveInteger(value, "version")}"`;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HttpError(500, "invalid_database_state", `${field} is invalid.`);
  return parsed;
}

function requiredRow(value: unknown, field: string): Row {
  if (!isRow(value)) throw new HttpError(400, "invalid_payload", `${field} must be an object.`);
  return value;
}

function optionalRow(value: unknown, field: string): Row {
  if (value === null || value === undefined) return {};
  return requiredRow(value, field);
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanInteger(value: unknown): number {
  return value === true ? 1 : 0;
}

function dbValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return booleanInteger(value);
  if (typeof value === "string" || typeof value === "number") return value;
  throw new HttpError(400, "invalid_field", "Unsupported database value.");
}

async function serveImage(request: Request, env: AdminEnv, encodedKey: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "method_not_allowed", "Only GET and HEAD are allowed");
  const key = encodedKey.split("/").map(decodeURIComponent).join("/");
  if (!key || key.includes("..")) throw new HttpError(400, "invalid_image_key", "Invalid image key");
  const object = request.method === "HEAD" ? await env.PRODUCT_IMAGES.head(key) : await env.PRODUCT_IMAGES.get(key);
  if (!object) throw new HttpError(404, "image_not_found", "Image not found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : (object as R2ObjectBody).body, { headers });
}

async function loadCatalogSnapshot(db: D1Database, productId?: string) {
  const productWhere = productId ? "WHERE id = ?" : "WHERE deleted_at IS NULL";
  const productStatement = productId ? db.prepare(`SELECT * FROM products ${productWhere}`).bind(productId) : db.prepare(`SELECT * FROM products ${productWhere} ORDER BY model_no`);
  const results = await db.batch([
    productStatement,
    db.prepare("SELECT * FROM product_families WHERE deleted_at IS NULL ORDER BY sort_order"),
    db.prepare("SELECT * FROM catalog_categories ORDER BY sort_order"),
    productId ? db.prepare("SELECT * FROM indoor_product_details WHERE product_id = ?").bind(productId) : db.prepare("SELECT * FROM indoor_product_details"),
    productId ? db.prepare("SELECT * FROM outdoor_product_details WHERE product_id = ?").bind(productId) : db.prepare("SELECT * FROM outdoor_product_details"),
    productId ? db.prepare("SELECT * FROM product_spec_values WHERE product_id = ? ORDER BY sort_order").bind(productId) : db.prepare("SELECT * FROM product_spec_values ORDER BY sort_order"),
    productId ? db.prepare("SELECT * FROM product_extra_fields WHERE product_id = ? ORDER BY sort_order").bind(productId) : db.prepare("SELECT * FROM product_extra_fields ORDER BY sort_order"),
    productId ? db.prepare("SELECT * FROM import_source_rows WHERE product_id = ? ORDER BY source_row_number").bind(productId) : db.prepare("SELECT * FROM import_source_rows WHERE 0"),
    productId ? db.prepare("SELECT pa.*,af.storage_key,af.width,af.height,af.was_upscaled,af.source_was_low_resolution FROM product_assets pa JOIN asset_files af ON af.id=pa.asset_id WHERE pa.product_id=? AND pa.is_public=1 ORDER BY pa.sort_order").bind(productId) : db.prepare("SELECT * FROM product_assets WHERE 0"),
  ]);
  const [productsResult, familiesResult, categoriesResult, indoorResult, outdoorResult, specsResult, extrasResult, importsResult, assetsResult] = results;
  const products = productsResult.results.map(normalizeRow);
  const families = familiesResult.results.map(normalizeRow);
  const categories = categoriesResult.results.map(normalizeRow);
  const familyMap = indexBy(families, (row: Row) => row.id);
  const categoryMap = indexBy(categories, (row: Row) => row.id);
  const indoorMap = indexBy(indoorResult.results.map(normalizeRow), (row: Row) => row.product_id);
  const outdoorMap = indexBy(outdoorResult.results.map(normalizeRow), (row: Row) => row.product_id);
  const specsByProduct = groupBy(specsResult.results.map(normalizeRow), (row: Row) => row.product_id);
  const extrasByProduct = groupBy(extrasResult.results.map(normalizeRow), (row: Row) => row.product_id);
  const importsByProduct = groupBy(importsResult.results.map(normalizeRow), (row: Row) => row.product_id);
  const assetsByProduct = groupBy(assetsResult.results.map(normalizeRow), (row: Row) => row.product_id);
  const duplicateCounts = new Map<string, number>();
  for (const product of products) duplicateCounts.set(String(product.model_no_normalized), (duplicateCounts.get(String(product.model_no_normalized)) ?? 0) + 1);
  const records = products.map((product) => {
    const family = familyMap.get(product.family_id) ?? null;
    const category = family?.category_id ? categoryMap.get(family.category_id) ?? null : null;
    const record = composeProductRecord({
      product, family, category, categoryBreadcrumb: category ? buildCategoryBreadcrumb(category, categoryMap) : [],
      indoorDetail: indoorMap.get(product.id) ?? null, outdoorDetail: outdoorMap.get(product.id) ?? null,
      specs: specsByProduct.get(product.id) ?? [], extras: extrasByProduct.get(product.id) ?? [],
      importRows: importsByProduct.get(product.id) ?? [], duplicateCount: duplicateCounts.get(String(product.model_no_normalized)) ?? 0,
    });
    const assets = (assetsByProduct.get(product.id) ?? []).map((asset: Row) => Object.assign({}, asset, { url: `/api/images/${String(asset.storage_key).split("/").map(encodeURIComponent).join("/")}` }));
    return Object.assign(record, { assets });
  });
  return { records };
}

function normalizeRow(row: unknown): Row {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return {};
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) result[key] = value;
  for (const field of ["is_active","is_featured","is_primary_variant","is_public","is_primary","was_upscaled","source_was_low_resolution"]) {
    if (field in result) result[field] = result[field] === 1;
  }
  for (const field of ["raw_excel_values","raw_values","normalized_values","warnings","errors","metadata"]) {
    if (typeof result[field] === "string") {
      try { result[field] = JSON.parse(result[field] as string); } catch { /* Retain malformed source text for QA visibility. */ }
    }
  }
  return result;
}

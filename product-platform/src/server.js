import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
} from "./lib/productQaCore.js";

const SRC_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PUBLIC_ROOT = resolve(SRC_ROOT, "public");
const LIB_ROOT = resolve(SRC_ROOT, "lib");
const PROJECT_ROOT = resolve(SRC_ROOT, "..");
const REPO_ROOT = resolve(PROJECT_ROOT, "..");

loadEnvFile(resolve(PROJECT_ROOT, ".env"));
loadEnvFile(resolve(PROJECT_ROOT, ".env.local"), { override: true });
loadEnvFile(resolve(REPO_ROOT, ".env.local"));

const env = process.env;
const PORT = Number(env.PORT || env.LUMINAC_QA_PORT || 3002);
const HOST = env.HOST || env.LUMINAC_QA_HOST || "127.0.0.1";
const SUPABASE_URL = stripTrailingSlash(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "");
const PUBLISHABLE_KEY =
  env.SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_FIXTURE = env.LUMINAC_QA_USE_FIXTURE === "true";
const READ_WITH_SERVICE_ROLE = env.LUMINAC_QA_READ_WITH_SERVICE_ROLE !== "false";
const WRITES_ENABLED =
  env.LUMINAC_QA_ALLOW_WRITES === "true" && Boolean(SERVICE_ROLE_KEY) && !USE_FIXTURE;
const ACTOR_EMAIL = env.LUMINAC_QA_ACTOR_EMAIL || "";
const MAX_ROWS = Number(env.LUMINAC_QA_MAX_ROWS || 5000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Luminac Product QA admin running at http://${HOST}:${PORT}`);
  console.log(`Mode: ${USE_FIXTURE ? "fixture" : "Supabase"}; writes ${WRITES_ENABLED ? "enabled" : "disabled"}`);
});

async function routeApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, buildStatusPayload());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/products") {
    const snapshot = await loadCatalogSnapshot();
    const filters = {
      search: url.searchParams.get("search") ?? "",
      environment: url.searchParams.get("environment") ?? "all",
      status: url.searchParams.get("status") ?? "all",
      category: url.searchParams.get("category") ?? "all",
      light_source: url.searchParams.get("light_source") ?? "",
      cct: url.searchParams.get("cct") ?? "",
      finish: url.searchParams.get("finish") ?? "",
      ip_rating: url.searchParams.get("ip_rating") ?? "",
    };
    const filtered = snapshot.records.filter((record) => matchesProductFilters(record, filters));
    sendJson(response, {
      products: filtered.map(summarizeProductRecord),
      total: filtered.length,
      unfilteredTotal: snapshot.records.length,
      facets: facetSummary(snapshot.records),
      mode: snapshot.mode,
    });
    return;
  }

  const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && request.method === "GET") {
    const record = await loadProductDetail(decodeURIComponent(productMatch[1]));
    sendJson(response, { product: record, editable: editableFromRecord(record), mode: dataMode() });
    return;
  }

  if (productMatch && request.method === "PATCH") {
    const payload = await readJson(request);
    const result = await updateProduct(decodeURIComponent(productMatch[1]), payload);
    sendJson(response, result);
    return;
  }

  const reviewMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/review$/);
  if (reviewMatch && request.method === "POST") {
    const payload = await readJson(request);
    const result = await writeReviewAudit(decodeURIComponent(reviewMatch[1]), payload);
    sendJson(response, result);
    return;
  }

  throw new HttpError(404, "not_found", "Route not found");
}

function buildStatusPayload() {
  const hasReadKey = Boolean(readKey());
  return {
    app: "Luminac Product QA",
    mode: dataMode(),
    supabaseConfigured: Boolean(SUPABASE_URL && hasReadKey),
    supabaseUrlConfigured: Boolean(SUPABASE_URL),
    publishableKeyConfigured: Boolean(PUBLISHABLE_KEY),
    serviceRoleConfigured: Boolean(SERVICE_ROLE_KEY),
    readWithServiceRole: Boolean(SERVICE_ROLE_KEY && READ_WITH_SERVICE_ROLE),
    writesEnabled: WRITES_ENABLED,
    readOnlyReason: readOnlyReason(),
    useFixture: USE_FIXTURE,
    actorEmailConfigured: Boolean(ACTOR_EMAIL),
    staleGeneratedTypes: true,
    reviewStatePersistence: "browser localStorage only; add a product_review_states table for shared review state",
    requiredEnv: [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY for server-side admin writes",
      "LUMINAC_QA_ALLOW_WRITES=true to enable writes",
    ],
  };
}

function readOnlyReason() {
  if (USE_FIXTURE) return "Fixture mode is read-only.";
  if (!SERVICE_ROLE_KEY) return "SUPABASE_SERVICE_ROLE_KEY is missing.";
  if (env.LUMINAC_QA_ALLOW_WRITES !== "true") return "Set LUMINAC_QA_ALLOW_WRITES=true to enable server-side writes.";
  return null;
}

function dataMode() {
  if (USE_FIXTURE) return "fixture";
  if (!SUPABASE_URL || !readKey()) return "missing-env";
  return "supabase";
}

async function loadCatalogSnapshot() {
  if (USE_FIXTURE) return fixtureSnapshot();
  assertReadConfigured();

  const [products, families, categories, indoorRows, outdoorRows, specs, extras] =
    await Promise.all([
      fetchTable("products", {
        select:
          "id,family_id,model_no,model_no_normalized,slug,display_name,variant_label,power_text,power_watts,status,is_primary_variant,sort_order,mrp_inr,raw_excel_values,created_at,updated_at,deleted_at",
        filters: { deleted_at: "is.null" },
        order: "model_no.asc",
      }),
      fetchTable("product_families", {
        select:
          "id,category_id,environment,family_code,family_code_normalized,slug,display_name,series_label,short_description,description,status,sort_order,is_featured,source_file,source_sheet,created_at,updated_at,deleted_at",
        filters: { deleted_at: "is.null" },
        order: "sort_order.asc",
      }),
      fetchTable("catalog_categories", {
        select: "id,parent_id,level,environment,name,slug,full_slug,route_path,sort_order,is_active,created_at,updated_at",
        order: "sort_order.asc",
      }),
      fetchTable("indoor_product_details", { select: "*", order: "product_id.asc" }),
      fetchTable("outdoor_product_details", { select: "*", order: "product_id.asc" }),
      fetchTable("product_spec_values", { select: "*", order: "sort_order.asc" }),
      fetchTable("product_extra_fields", { select: "*", order: "sort_order.asc" }),
    ]);

  return composeSnapshot({
    mode: "supabase",
    products,
    families,
    categories,
    indoorRows,
    outdoorRows,
    specs,
    extras,
    importRows: [],
  });
}

async function loadProductDetail(productId) {
  if (USE_FIXTURE) {
    const record = fixtureSnapshot().records.find((item) => item.product.id === productId);
    if (!record) throw new HttpError(404, "product_not_found", "Product not found in fixture data");
    return record;
  }
  assertReadConfigured();

  const [products, families, categories, indoorRows, outdoorRows, specs, extras, importRows] =
    await Promise.all([
      fetchTable("products", {
        select:
          "id,family_id,model_no,model_no_normalized,slug,display_name,variant_label,power_text,power_watts,status,is_primary_variant,sort_order,mrp_inr,raw_excel_values,created_at,updated_at,deleted_at",
        filters: { id: `eq.${productId}` },
      }),
      fetchTable("product_families", {
        select:
          "id,category_id,environment,family_code,family_code_normalized,slug,display_name,series_label,short_description,description,status,sort_order,is_featured,source_file,source_sheet,created_at,updated_at,deleted_at",
      }),
      fetchTable("catalog_categories", {
        select: "id,parent_id,level,environment,name,slug,full_slug,route_path,sort_order,is_active,created_at,updated_at",
      }),
      fetchTable("indoor_product_details", { select: "*", filters: { product_id: `eq.${productId}` } }),
      fetchTable("outdoor_product_details", { select: "*", filters: { product_id: `eq.${productId}` } }),
      fetchTable("product_spec_values", {
        select: "*",
        filters: { product_id: `eq.${productId}` },
        order: "sort_order.asc",
      }),
      fetchTable("product_extra_fields", {
        select: "*",
        filters: { product_id: `eq.${productId}` },
        order: "sort_order.asc",
      }),
      fetchTable("import_source_rows", {
        select:
          "id,import_batch_id,source_file,source_sheet,source_row_number,pdf_page,source_reference,category_id,family_id,product_id,model_no,raw_values,normalized_values,status,warnings,errors,created_at",
        filters: { product_id: `eq.${productId}` },
        order: "source_row_number.asc",
      }),
    ]);

  if (!products.length) throw new HttpError(404, "product_not_found", "Product not found");

  const duplicateRows = await fetchTable("products", {
    select: "id,model_no_normalized",
    filters: { model_no_normalized: `eq.${products[0].model_no_normalized}`, deleted_at: "is.null" },
  });

  const snapshot = composeSnapshot({
    mode: "supabase",
    products,
    families,
    categories,
    indoorRows,
    outdoorRows,
    specs,
    extras,
    importRows,
    duplicateOverride: new Map([[products[0].model_no_normalized, duplicateRows.length]]),
  });

  return snapshot.records[0];
}

function composeSnapshot(input) {
  const familyMap = indexBy(input.families, (family) => family.id);
  const categoryMap = indexBy(input.categories, (category) => category.id);
  const indoorMap = indexBy(input.indoorRows, (row) => row.product_id);
  const outdoorMap = indexBy(input.outdoorRows, (row) => row.product_id);
  const specsByProduct = groupBy(input.specs, (row) => row.product_id);
  const extrasByProduct = groupBy(input.extras, (row) => row.product_id);
  const importsByProduct = groupBy(input.importRows, (row) => row.product_id);
  const duplicateCounts = input.duplicateOverride ?? countBy(input.products, (product) => product.model_no_normalized);

  const records = input.products.map((product) => {
    const family = familyMap.get(product.family_id) ?? null;
    const category = family?.category_id ? categoryMap.get(family.category_id) ?? null : null;
    return composeProductRecord({
      product,
      family,
      category,
      categoryBreadcrumb: category ? buildCategoryBreadcrumb(category, categoryMap) : [],
      indoorDetail: indoorMap.get(product.id) ?? null,
      outdoorDetail: outdoorMap.get(product.id) ?? null,
      specs: specsByProduct.get(product.id) ?? [],
      extras: extrasByProduct.get(product.id) ?? [],
      importRows: importsByProduct.get(product.id) ?? [],
      duplicateCount: duplicateCounts.get(product.model_no_normalized) ?? 0,
    });
  });

  return { mode: input.mode, records };
}

async function updateProduct(productId, payload) {
  if (!WRITES_ENABLED) {
    throw new HttpError(403, "read_only", readOnlyReason() ?? "Writes are disabled.");
  }
  if (!payload?.confirm) {
    throw new HttpError(400, "confirmation_required", "Explicit save confirmation is required.");
  }
  if (!payload?.draft || typeof payload.draft !== "object") {
    throw new HttpError(400, "invalid_payload", "Missing editable product draft.");
  }

  const beforeRecord = await loadProductDetail(productId);
  const beforeEditable = editableFromRecord(beforeRecord);
  const draft = sanitizeDraft(payload.draft);
  const changes = diffEditable(beforeEditable, draft);
  if (!changes.length) {
    return { product: beforeRecord, changedFields: [], auditLog: { written: false, reason: "No changes" } };
  }

  await applyProductSection(productId, beforeEditable.product, draft.product);
  await applyDetailSection("indoor_product_details", productId, beforeRecord.indoorDetail, draft.indoorDetail, INDOOR_DETAIL_FIELDS);
  await applyDetailSection("outdoor_product_details", productId, beforeRecord.outdoorDetail, draft.outdoorDetail, OUTDOOR_DETAIL_FIELDS);
  await applyChildRows("product_spec_values", productId, beforeEditable.specValues, draft.specValues, SPEC_VALUE_FIELDS);
  await applyChildRows("product_extra_fields", productId, beforeEditable.extraFields, draft.extraFields, EXTRA_FIELD_FIELDS);

  const afterRecord = await loadProductDetail(productId);
  const changedFields = diffEditable(beforeEditable, editableFromRecord(afterRecord));
  const auditLog = await writeAuditLog({
    actor_email: payload.actorEmail || ACTOR_EMAIL || null,
    action: "product_qa_update",
    entity_type: "product",
    entity_id: productId,
    metadata: {
      changed_fields: changedFields,
      before: beforeEditable,
      after: editableFromRecord(afterRecord),
      client_confirmed: true,
    },
  });

  return { product: afterRecord, changedFields, auditLog };
}

async function applyProductSection(productId, before, after) {
  const update = changedFieldsObject(before, after, PRODUCT_EDIT_FIELDS);
  if (!Object.keys(update).length) return;
  update.updated_at = new Date().toISOString();
  await supabaseRequest("products", {
    method: "PATCH",
    write: true,
    query: { id: `eq.${productId}` },
    body: update,
    prefer: "return=representation",
  });
}

async function applyDetailSection(table, productId, existingRow, after, fields) {
  const hasAnyValue = fields.some((field) => !isBlank(after?.[field]));
  if (!existingRow && !hasAnyValue) return;

  if (existingRow) {
    const update = changedFieldsObject(existingRow, after, fields);
    if (!Object.keys(update).length) return;
    update.updated_at = new Date().toISOString();
    await supabaseRequest(table, {
      method: "PATCH",
      write: true,
      query: { product_id: `eq.${productId}` },
      body: update,
      prefer: "return=representation",
    });
    return;
  }

  await supabaseRequest(table, {
    method: "POST",
    write: true,
    body: { product_id: productId, ...pickChanged(after, fields) },
    prefer: "return=representation",
  });
}

async function applyChildRows(table, productId, beforeRows, afterRows, fields) {
  const beforeById = indexBy(beforeRows.filter((row) => row.id), (row) => row.id);

  for (const row of afterRows) {
    const cleaned = pickChanged(row, fields);
    if (table === "product_spec_values") {
      if (isBlank(cleaned.value_normalized)) cleaned.value_normalized = normalizeToken(cleaned.value_text);
      if (isBlank(cleaned.spec_label)) cleaned.spec_label = cleaned.spec_key;
    }
    if (table === "product_extra_fields") {
      if (isBlank(cleaned.field_group)) cleaned.field_group = "general";
      if (isBlank(cleaned.field_label)) cleaned.field_label = cleaned.field_key;
    }

    if (row.id && beforeById.has(row.id)) {
      const update = changedFieldsObject(beforeById.get(row.id), cleaned, fields);
      if (!Object.keys(update).length) continue;
      await supabaseRequest(table, {
        method: "PATCH",
        write: true,
        query: { id: `eq.${row.id}`, product_id: `eq.${productId}` },
        body: update,
        prefer: "return=representation",
      });
      continue;
    }

    if (hasRequiredChildValues(table, cleaned)) {
      await supabaseRequest(table, {
        method: "POST",
        write: true,
        body: { product_id: productId, ...cleaned },
        prefer: "return=representation",
      });
    }
  }
}

function hasRequiredChildValues(table, row) {
  if (table === "product_spec_values") {
    return !isBlank(row.spec_key) && !isBlank(row.value_text);
  }
  if (table === "product_extra_fields") {
    return !isBlank(row.field_key) && !isBlank(row.value_text);
  }
  return false;
}

function changedFieldsObject(before, after, fields) {
  const update = {};
  for (const field of fields) {
    const left = normalizeDbComparable(before?.[field]);
    const right = normalizeDbComparable(after?.[field]);
    if (String(left ?? "") !== String(right ?? "")) update[field] = right;
  }
  return update;
}

function pickChanged(source, fields) {
  const picked = {};
  for (const field of fields) picked[field] = normalizeDbComparable(source?.[field]);
  return picked;
}

function normalizeDbComparable(value) {
  if (value === undefined || value === "") return null;
  return value;
}

function sanitizeDraft(draft) {
  return {
    product: sanitizeFields(draft.product, PRODUCT_EDIT_FIELDS),
    indoorDetail: sanitizeFields(draft.indoorDetail, INDOOR_DETAIL_FIELDS),
    outdoorDetail: sanitizeFields(draft.outdoorDetail, OUTDOOR_DETAIL_FIELDS),
    specValues: sanitizeRows(draft.specValues, SPEC_VALUE_FIELDS),
    extraFields: sanitizeRows(draft.extraFields, EXTRA_FIELD_FIELDS),
  };
}

function sanitizeRows(rows, fields) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({ id: row.id ?? null, ...sanitizeFields(row, fields) }));
}

function sanitizeFields(source = {}, fields) {
  const result = {};
  for (const field of fields) {
    let value = source[field];
    if (value === "") value = null;
    if (["power_watts", "value_number"].includes(field)) value = nullableNumber(value);
    if (["sort_order", "mrp_inr", "cri"].includes(field)) value = nullableInteger(value);
    if (["is_primary_variant", "is_public"].includes(field)) value = Boolean(value);
    if (field === "status" && value && !STATUS_OPTIONS.includes(value)) value = "draft";
    result[field] = value ?? null;
  }
  return result;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value) {
  const number = nullableNumber(value);
  return number === null ? null : Math.trunc(number);
}

async function writeReviewAudit(productId, payload) {
  if (!WRITES_ENABLED) {
    throw new HttpError(403, "read_only", readOnlyReason() ?? "Writes are disabled.");
  }
  if (!payload?.confirm) {
    throw new HttpError(400, "confirmation_required", "Explicit review confirmation is required.");
  }
  const status = payload.status;
  if (!["needs_review", "reviewed_ok", "corrected", "blocked"].includes(status)) {
    throw new HttpError(400, "invalid_review_status", "Invalid review status.");
  }
  const auditLog = await writeAuditLog({
    actor_email: payload.actorEmail || ACTOR_EMAIL || null,
    action: "product_qa_review_status",
    entity_type: "product",
    entity_id: productId,
    metadata: {
      review_status: status,
      notes: payload.notes ?? "",
      persisted_review_state: false,
      persistence_note: "Review status is stored in browser localStorage unless a review table is added.",
    },
  });
  return { auditLog };
}

async function writeAuditLog(row) {
  try {
    const result = await supabaseRequest("audit_logs", {
      method: "POST",
      write: true,
      body: row,
      prefer: "return=representation",
    });
    return { written: true, row: Array.isArray(result) ? result[0] : result };
  } catch (error) {
    return {
      written: false,
      error: {
        code: error.code ?? "audit_log_failed",
        message: error.message,
        details: error.details ?? null,
      },
    };
  }
}

async function fetchTable(table, options = {}) {
  const query = {
    select: options.select ?? "*",
    limit: String(options.limit ?? MAX_ROWS),
    ...options.filters,
  };
  if (options.order) query.order = options.order;
  return supabaseRequest(table, { query });
}

async function supabaseRequest(table, options = {}) {
  const key = options.write ? SERVICE_ROLE_KEY : readKey();
  if (!SUPABASE_URL || !key) {
    throw new HttpError(503, "missing_env", "Supabase URL or key is missing.");
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [keyName, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(keyName, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) {
    throw new HttpError(
      response.status,
      data?.code ?? "supabase_error",
      data?.message ?? `Supabase request failed with ${response.status}`,
      data,
    );
  }
  return data ?? [];
}

function readKey() {
  if (SERVICE_ROLE_KEY && READ_WITH_SERVICE_ROLE) return SERVICE_ROLE_KEY;
  return PUBLISHABLE_KEY;
}

function assertReadConfigured() {
  if (!SUPABASE_URL || !readKey()) {
    throw new HttpError(
      503,
      "missing_env",
      "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or enable fixture mode with LUMINAC_QA_USE_FIXTURE=true.",
    );
  }
}

function fixtureSnapshot() {
  const categories = [
    {
      id: "cat-indoor",
      parent_id: null,
      level: "environment",
      environment: "indoor",
      name: "Indoor Lighting",
      full_slug: "indoor",
      route_path: "/catalogue/indoor",
      sort_order: 1,
      is_active: true,
    },
    {
      id: "cat-recessed",
      parent_id: "cat-indoor",
      level: "subcategory",
      environment: "indoor",
      name: "Recessed",
      full_slug: "indoor/recessed",
      route_path: "/catalogue/indoor/recessed",
      sort_order: 1,
      is_active: true,
    },
    {
      id: "cat-cob",
      parent_id: "cat-recessed",
      level: "product_category",
      environment: "indoor",
      name: "COB Down Lights",
      full_slug: "indoor/recessed/cob-down-lights",
      route_path: "/catalogue/indoor/recessed/cob-down-lights",
      sort_order: 1,
      is_active: true,
    },
  ];

  const families = [
    {
      id: "fam-6254",
      category_id: "cat-cob",
      environment: "indoor",
      family_code: "LF-LL-6254",
      family_code_normalized: "lf-ll-6254",
      display_name: "LF-LL-6254",
      series_label: "COB Down Lights",
      description:
        "Designed on the principle of absolute geometric minimalism, this micro downlight functions as a discrete point-source of light.",
      status: "draft",
      sort_order: 1,
    },
    {
      id: "fam-6255",
      category_id: "cat-cob",
      environment: "indoor",
      family_code: "LF-LL-6255",
      family_code_normalized: "lf-ll-6255",
      display_name: "LF-LL-6255",
      series_label: "COB Down Lights",
      description:
        "Deep-set recessed downlight with a specular internal reflector for comfortable ambient output.",
      status: "draft",
      sort_order: 2,
    },
  ];

  const products = [
    {
      id: "fixture-6254",
      family_id: "fam-6254",
      model_no: "LF-LL-6254",
      model_no_normalized: "lf-ll-6254",
      slug: "lf-ll-6254",
      display_name: "LF-LL-6254",
      variant_label: null,
      power_text: "7W",
      power_watts: 7,
      status: "draft",
      is_primary_variant: true,
      sort_order: 1,
      mrp_inr: null,
      raw_excel_values: {},
    },
    {
      id: "fixture-6255",
      family_id: "fam-6255",
      model_no: "LF-LL-6255",
      model_no_normalized: "lf-ll-6255",
      slug: "lf-ll-6255",
      display_name: "LF-LL-6255",
      variant_label: null,
      power_text: "9W",
      power_watts: 9,
      status: "draft",
      is_primary_variant: true,
      sort_order: 2,
      mrp_inr: null,
      raw_excel_values: {},
    },
  ];

  const indoorRows = [
    {
      product_id: "fixture-6254",
      size_text: "41 x 59",
      cutout_text: "35",
      finish_text: "Black/Antique Brass/White",
      cct_text: "3000K, 4000K",
      beam_angle_text: "36° / 45°",
      light_source: "LUMINIUS SMD",
      ip_rating: "IP20",
      cri: 90,
    },
    {
      product_id: "fixture-6255",
      size_text: "52 x 76",
      cutout_text: "45",
      finish_text: "White/Black/Antique Brass",
      cct_text: "3000K, 4000K",
      beam_angle_text: "24° / 36°",
      light_source: "CREE",
      ip_rating: "IP20",
      cri: 90,
    },
  ];

  const specs = [
    ...["3000K", "4000K"].map((value, index) => ({
      id: `spec-6254-cct-${index}`,
      product_id: "fixture-6254",
      spec_key: "cct",
      spec_label: "CCT",
      value_text: value,
      value_normalized: normalizeToken(value),
      value_number: Number(value.replace(/\D/g, "")),
      unit: "K",
      sort_order: index,
    })),
    {
      id: "spec-6254-finish-black",
      product_id: "fixture-6254",
      spec_key: "finish",
      spec_label: "Finish",
      value_text: "Black",
      value_normalized: "black",
      value_number: null,
      unit: null,
      sort_order: 10,
    },
  ];

  return composeSnapshot({
    mode: "fixture",
    products,
    families,
    categories,
    indoorRows,
    outdoorRows: [],
    specs,
    extras: [
      {
        id: "extra-6254-reflector",
        product_id: "fixture-6254",
        field_group: "technical",
        field_key: "reflector",
        field_label: "Reflector",
        value_text: "White/Matt Black/Titanium",
        value_number: null,
        unit: null,
        is_public: true,
        sort_order: 10,
      },
      {
        id: "extra-6255-reflector",
        product_id: "fixture-6255",
        field_group: "technical",
        field_key: "reflector",
        field_label: "Reflector",
        value_text: "White/Matt Black/Titanium",
        value_number: null,
        unit: null,
        is_public: true,
        sort_order: 10,
      },
    ],
    importRows: [
      {
        id: "fixture-import-6254",
        product_id: "fixture-6254",
        source_file: "Local fixture",
        source_sheet: "PDF visual sample",
        source_row_number: 8,
        model_no: "LF-LL-6254",
        status: "warning",
        warnings: ["Fixture data only; not inserted in Supabase"],
        errors: [],
        raw_values: {},
        normalized_values: {},
      },
    ],
  });
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const root = safePath.startsWith("/lib/") ? LIB_ROOT : PUBLIC_ROOT;
  const relativePath = safePath.startsWith("/lib/")
    ? safePath.replace(/^\/lib\//, "")
    : safePath.replace(/^\//, "");
  const filePath = resolve(root, relativePath);

  if (!isWithin(filePath, root) || !existsSync(filePath)) {
    throw new HttpError(404, "not_found", "File not found");
  }

  const body = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function isWithin(filePath, root) {
  return filePath === root || filePath.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const status = error.status || 500;
  sendJson(
    response,
    {
      error: {
        code: error.code || "internal_error",
        message: error.message || "Unexpected server error",
        details: error.details || null,
      },
    },
    status,
  );
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function loadEnvFile(path, options = {}) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (options.override || !process.env[key]) process.env[key] = value;
  }
}

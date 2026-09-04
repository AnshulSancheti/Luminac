export const STATUS_OPTIONS = ["draft", "published", "archived", "discontinued"];

export const REVIEW_STATUS_OPTIONS = [
  "needs_review",
  "reviewed_ok",
  "corrected",
  "blocked",
];

export const PRODUCT_EDIT_FIELDS = [
  "display_name",
  "variant_label",
  "power_text",
  "power_watts",
  "status",
  "is_primary_variant",
  "sort_order",
  "mrp_inr",
];

export const INDOOR_DETAIL_FIELDS = [
  "size_text",
  "cutout_text",
  "finish_text",
  "cct_text",
  "beam_angle_text",
  "light_source",
  "ip_rating",
  "cri",
];

export const OUTDOOR_DETAIL_FIELDS = [
  "size_text",
  "finish_text",
  "cct_text",
  "light_source",
  "ip_rating",
];

export const SPEC_VALUE_FIELDS = [
  "spec_key",
  "spec_label",
  "value_text",
  "value_normalized",
  "value_number",
  "unit",
  "source_text",
  "sort_order",
];

export const EXTRA_FIELD_FIELDS = [
  "field_group",
  "field_key",
  "field_label",
  "value_text",
  "value_number",
  "unit",
  "is_public",
  "sort_order",
];

export const FIELD_LABELS = {
  display_name: "Display name",
  variant_label: "Variant label",
  power_text: "Power",
  power_watts: "Power watts",
  status: "Status",
  is_primary_variant: "Primary variant",
  sort_order: "Sort order",
  mrp_inr: "MRP INR",
  size_text: "Size",
  cutout_text: "Cutout",
  finish_text: "Finish",
  cct_text: "CCT",
  beam_angle_text: "Beam angle",
  light_source: "Light source",
  ip_rating: "IP rating",
  cri: "CRI",
  spec_key: "Spec key",
  spec_label: "Spec label",
  value_text: "Value",
  value_normalized: "Normalized",
  value_number: "Number",
  unit: "Unit",
  source_text: "Source text",
  field_group: "Group",
  field_key: "Field key",
  field_label: "Field label",
  is_public: "Public",
};

export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function displayValue(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function formatMrp(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `₹${number.toLocaleString("en-IN")}`;
}

export function groupBy(items, keyFn) {
  const grouped = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return grouped;
}

export function indexBy(items, keyFn) {
  const indexed = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key !== null && key !== undefined) indexed.set(key, item);
  }
  return indexed;
}

export function buildCategoryBreadcrumb(category, categoryMap) {
  const nodes = [];
  let current = category;
  const seen = new Set();

  while (current && !seen.has(current.id)) {
    nodes.unshift(current);
    seen.add(current.id);
    current = current.parent_id ? categoryMap.get(current.parent_id) : null;
  }

  return nodes;
}

export function composeProductRecord(input) {
  const record = {
    product: input.product,
    family: input.family ?? null,
    category: input.category ?? null,
    categoryBreadcrumb: input.categoryBreadcrumb ?? [],
    indoorDetail: input.indoorDetail ?? null,
    outdoorDetail: input.outdoorDetail ?? null,
    specs: sortByOrder(input.specs ?? []),
    extras: sortByOrder(input.extras ?? []),
    importRows: sortByOrder(input.importRows ?? [], "source_row_number"),
    duplicateCount: input.duplicateCount ?? 0,
    warnings: [],
  };
  record.warnings = computeProductWarnings(record);
  return record;
}

export function sortByOrder(items, key = "sort_order") {
  return [...items].sort((a, b) => {
    const left = Number(a?.[key] ?? 0);
    const right = Number(b?.[key] ?? 0);
    if (left !== right) return left - right;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  });
}

export function getPrimaryDetail(record) {
  if (record.family?.environment === "outdoor") {
    return record.outdoorDetail ?? record.indoorDetail ?? null;
  }
  return record.indoorDetail ?? record.outdoorDetail ?? null;
}

export function getDetailValue(record, field) {
  return record.indoorDetail?.[field] ?? record.outdoorDetail?.[field] ?? null;
}

export function getExtraFieldValue(record, fieldKey) {
  const normalized = normalizeToken(fieldKey);
  return (record.extras ?? []).find((field) => normalizeToken(field.field_key) === normalized)?.value_text ?? null;
}

export function hasSpecKey(record, candidates) {
  const normalizedCandidates = candidates.map(normalizeText);
  return (record.specs ?? []).some((spec) => {
    const key = normalizeText(spec.spec_key);
    const label = normalizeText(spec.spec_label);
    return normalizedCandidates.some(
      (candidate) => key.includes(candidate) || label.includes(candidate),
    );
  });
}

export function computeProductWarnings(record) {
  const warnings = [];
  const add = (code, label, severity = "warning") => {
    warnings.push({ code, label, severity });
  };

  if (!record.family) add("missing_family", "No product family", "critical");
  if (!record.category) add("missing_category", "No category", "critical");
  if (isBlank(record.product?.power_text) && isBlank(record.product?.power_watts)) {
    add("missing_power", "Missing power");
  }
  if (isBlank(getDetailValue(record, "size_text"))) add("missing_size", "Missing size");
  if (isBlank(getDetailValue(record, "finish_text"))) add("missing_finish", "Missing finish");
  if (isBlank(getDetailValue(record, "cct_text"))) add("missing_cct", "Missing CCT");
  if (isBlank(getDetailValue(record, "ip_rating"))) add("missing_ip", "Missing IP rating");
  if ((record.duplicateCount ?? 0) > 1) {
    add("duplicate_model", `Duplicate model number (${record.duplicateCount} rows)`, "critical");
  }
  if (record.indoorDetail && record.outdoorDetail) {
    add("dual_detail_rows", "Both indoor and outdoor detail rows exist", "critical");
  }
  if (!record.indoorDetail && !record.outdoorDetail) {
    add("missing_detail_row", "No environment detail row", "critical");
  }

  const parsedSpecs = [
    ["missing_spec_cct", "Parsed CCT spec missing", ["cct", "cct kelvin"]],
    ["missing_spec_finish", "Parsed finish spec missing", ["finish"]],
  ];

  for (const [code, label, candidates] of parsedSpecs) {
    if (!hasSpecKey(record, candidates)) add(code, label, "info");
  }

  if (isBlank(record.product?.mrp_inr)) add("missing_mrp", "MRP blank", "info");
  if (record.product?.status !== "published") {
    add("unpublished", `Status is ${record.product?.status ?? "unknown"}`, "info");
  }

  return warnings;
}

export function categoryLabel(record) {
  if (record.categoryBreadcrumb?.length) {
    return record.categoryBreadcrumb.map((category) => category.name).join(" / ");
  }
  if (record.category?.full_slug) return record.category.full_slug.replaceAll("/", " / ");
  return "Uncategorised";
}

export function summarizeProductRecord(record) {
  const detail = getPrimaryDetail(record) ?? {};
  const criticalCount = record.warnings.filter((warning) => warning.severity === "critical").length;
  return {
    id: record.product.id,
    model_no: record.product.model_no,
    model_no_normalized: record.product.model_no_normalized,
    display_name: record.product.display_name,
    variant_label: record.product.variant_label,
    family_code: record.family?.family_code ?? record.family?.display_name ?? "",
    family_name: record.family?.display_name ?? "",
    environment: record.family?.environment ?? record.category?.environment ?? "",
    category: categoryLabel(record),
    category_full_slug: record.category?.full_slug ?? "",
    status: record.product.status,
    power_text: record.product.power_text,
    power_watts: record.product.power_watts,
    cct_text: detail.cct_text ?? null,
    finish_text: detail.finish_text ?? null,
    ip_rating: detail.ip_rating ?? null,
    light_source: detail.light_source ?? null,
    mrp_inr: record.product.mrp_inr,
    duplicateCount: record.duplicateCount,
    warningCount: record.warnings.length,
    criticalCount,
    warnings: record.warnings,
  };
}

export function productSearchText(record) {
  const detail = getPrimaryDetail(record) ?? {};
  return normalizeText(
    [
      record.product?.model_no,
      record.product?.model_no_normalized,
      record.product?.display_name,
      record.product?.variant_label,
      record.product?.power_text,
      record.family?.family_code,
      record.family?.display_name,
      record.family?.series_label,
      categoryLabel(record),
      detail.size_text,
      detail.cutout_text,
      detail.finish_text,
      detail.cct_text,
      detail.beam_angle_text,
      detail.light_source,
      detail.ip_rating,
      ...(record.specs ?? []).flatMap((spec) => [
        spec.spec_key,
        spec.spec_label,
        spec.value_text,
        spec.value_normalized,
      ]),
      ...(record.extras ?? []).flatMap((field) => [
        field.field_key,
        field.field_label,
        field.value_text,
      ]),
    ].join(" "),
  );
}

export function matchesProductFilters(record, filters) {
  const search = normalizeText(filters.search);
  if (search && !productSearchText(record).includes(search)) return false;

  const environment = filters.environment;
  if (environment && environment !== "all") {
    const recordEnvironment = record.family?.environment ?? record.category?.environment ?? "";
    if (recordEnvironment !== environment) return false;
  }

  const status = filters.status;
  if (status && status !== "all" && record.product?.status !== status) return false;

  const category = filters.category;
  if (category && category !== "all") {
    const categoryText = normalizeText(
      [record.category?.full_slug, categoryLabel(record)].join(" "),
    );
    if (!categoryText.includes(normalizeText(category))) return false;
  }

  const detail = getPrimaryDetail(record) ?? {};
  const textFilterPairs = [
    ["light_source", detail.light_source],
    ["cct", detail.cct_text],
    ["finish", detail.finish_text],
    ["ip_rating", detail.ip_rating],
  ];
  for (const [filterKey, value] of textFilterPairs) {
    const filterValue = normalizeText(filters[filterKey]);
    if (filterValue && !normalizeText(value).includes(filterValue)) return false;
  }

  return true;
}

export function editableFromRecord(record) {
  return {
    product: pickFields(record.product ?? {}, PRODUCT_EDIT_FIELDS),
    indoorDetail: pickFields(record.indoorDetail ?? {}, INDOOR_DETAIL_FIELDS),
    outdoorDetail: pickFields(record.outdoorDetail ?? {}, OUTDOOR_DETAIL_FIELDS),
    specValues: (record.specs ?? []).map((spec) => ({
      id: spec.id,
      ...pickFields(spec, SPEC_VALUE_FIELDS),
    })),
    extraFields: (record.extras ?? []).map((field) => ({
      id: field.id,
      ...pickFields(field, EXTRA_FIELD_FIELDS),
    })),
  };
}

export function pickFields(source, fields) {
  const picked = {};
  for (const field of fields) picked[field] = source[field] ?? null;
  return picked;
}

export function cleanComparable(value) {
  if (value === undefined) return null;
  if (value === "") return null;
  return value;
}

export function diffEditable(before, after) {
  const changes = [];
  diffObject("product", before.product ?? {}, after.product ?? {}, PRODUCT_EDIT_FIELDS, changes);
  diffObject(
    "indoorDetail",
    before.indoorDetail ?? {},
    after.indoorDetail ?? {},
    INDOOR_DETAIL_FIELDS,
    changes,
  );
  diffObject(
    "outdoorDetail",
    before.outdoorDetail ?? {},
    after.outdoorDetail ?? {},
    OUTDOOR_DETAIL_FIELDS,
    changes,
  );
  diffRows("specValues", before.specValues ?? [], after.specValues ?? [], SPEC_VALUE_FIELDS, changes);
  diffRows("extraFields", before.extraFields ?? [], after.extraFields ?? [], EXTRA_FIELD_FIELDS, changes);
  return changes;
}

function diffObject(section, before, after, fields, changes) {
  for (const field of fields) {
    const left = cleanComparable(before[field]);
    const right = cleanComparable(after[field]);
    if (String(left ?? "") !== String(right ?? "")) {
      changes.push({
        section,
        field,
        label: FIELD_LABELS[field] ?? field,
        before: left,
        after: right,
      });
    }
  }
}

function diffRows(section, beforeRows, afterRows, fields, changes) {
  const beforeByKey = rowsByStableKey(beforeRows);
  const afterByKey = rowsByStableKey(afterRows);
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);

  for (const key of keys) {
    const before = beforeByKey.get(key);
    const after = afterByKey.get(key);
    if (!before && after) {
      changes.push({
        section,
        field: key,
        label: `${section} row added`,
        before: null,
        after: summarizeRow(after, fields),
      });
      continue;
    }
    if (before && !after) {
      changes.push({
        section,
        field: key,
        label: `${section} row removed`,
        before: summarizeRow(before, fields),
        after: null,
      });
      continue;
    }
    diffObject(`${section}.${key}`, before, after, fields, changes);
  }
}

function rowsByStableKey(rows) {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = row.id || `new:${index}`;
    map.set(key, row);
  });
  return map;
}

function summarizeRow(row, fields) {
  return fields
    .map((field) => `${FIELD_LABELS[field] ?? field}: ${displayValue(row[field], "")}`)
    .filter((part) => !part.endsWith(": "))
    .join(", ");
}

export function facetSummary(records) {
  const categories = new Map();
  const statuses = new Map();
  const environments = new Map();

  for (const record of records) {
    const category = categoryLabel(record);
    categories.set(record.category?.full_slug ?? category, {
      value: record.category?.full_slug ?? category,
      label: category,
    });
    const status = record.product?.status ?? "unknown";
    statuses.set(status, { value: status, label: status });
    const environment = record.family?.environment ?? record.category?.environment ?? "unknown";
    environments.set(environment, { value: environment, label: environment });
  }

  return {
    categories: [...categories.values()].sort((a, b) => a.label.localeCompare(b.label)),
    statuses: [...statuses.values()].sort((a, b) => a.label.localeCompare(b.label)),
    environments: [...environments.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

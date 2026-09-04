import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(await readFile(resolve(projectRoot, "cloudflare/generated/public-catalog-import-manifest.json"), "utf8"));
const config = JSON.parse(await readFile(resolve(projectRoot, "wrangler.public.jsonc"), "utf8"));
const workerSource = await readFile(resolve(projectRoot, "cloudflare/src/public.ts"), "utf8");

const expectedColumns = {
  catalog_categories: ["id","parent_id","level","environment","name","slug","full_slug","route_path","sort_order"],
  product_families: ["id","category_id","environment","slug","display_name","series_label","short_description","description","sort_order","is_featured"],
  products: ["id","family_id","model_no","model_no_normalized","slug","display_name","variant_label","power_text","power_watts","is_primary_variant","sort_order"],
  indoor_product_details: ["product_id","size_text","cutout_text","finish_text","cct_text","beam_angle_text","light_source","ip_rating","cri"],
  outdoor_product_details: ["product_id","size_text","finish_text","cct_text","light_source","ip_rating"],
  product_spec_values: ["id","product_id","spec_key","spec_label","value_text","value_normalized","value_number","unit","sort_order"],
  product_extra_fields: ["id","product_id","field_group","field_key","field_label","value_text","value_number","unit","sort_order"],
  asset_files: ["id","storage_key","mime_type","size_bytes","width","height"],
  product_assets: ["id","product_id","asset_id","asset_role","variant","title","alt_text","caption","sort_order","is_primary","is_public"],
  product_family_assets: ["id","family_id","asset_id","asset_role","title","alt_text","caption","sort_order","is_primary","is_public"],
  tags: ["id","tag_type","name","slug","sort_order"],
  product_tags: ["product_id","tag_id"],
  seo_entries: ["id","category_id","family_id","product_id","route_path","canonical_path","meta_title","meta_description","og_title","og_description","og_image_asset_id","schema_json","noindex"],
  redirects: ["id","source_path","target_path","status_code","reason"],
};

assert(manifest.classification === "public-catalog-only", "Public manifest classification is missing");
assertSameSet(Object.keys(manifest.tables), Object.keys(expectedColumns), "public tables");
for (const [table, columns] of Object.entries(expectedColumns)) {
  assertSameSet(manifest.tables[table].columns, columns, `${table} columns`);
}

assert(config.main === "cloudflare/src/public.ts", "Public config points at the wrong Worker");
assert(config.workers_dev === true && config.preview_urls === false, "Unexpected staging exposure configuration");
assert(config.d1_databases?.length === 1, "Public Worker must have exactly one D1 binding");
assert(config.d1_databases[0].binding === "PUBLIC_DB", "Unexpected public D1 binding");
assert(config.d1_databases[0].database_name === "luminac-public-catalog-staging", "Public Worker is bound to the wrong D1 database");
assert(config.r2_buckets?.length === 1, "Public Worker must have exactly one R2 binding");
assert(config.r2_buckets[0].binding === "PUBLIC_ASSETS", "Unexpected public R2 binding");
assert(config.r2_buckets[0].bucket_name === "luminac-product-images-qa", "Public Worker is bound to the wrong R2 bucket");
assertSameSet(Object.keys(config.vars ?? {}), ["ENVIRONMENT", "ENABLE_HSTS"], "public Worker variables");

assert(!/SUPABASE|SERVICE_ROLE|API_TOKEN|OPENAI|PRIVATE_ASSETS|BACKUPS|QUARANTINE/.test(workerSource), "Public Worker source references a forbidden service or binding");
const environmentBindings = [...workerSource.matchAll(/env\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]);
assertSameSet(environmentBindings, ["PUBLIC_DB", "PUBLIC_ASSETS", "ENVIRONMENT", "ENABLE_HSTS"], "public Worker environment bindings");

console.log(JSON.stringify({
  verified: true,
  classification: manifest.classification,
  tables: Object.keys(expectedColumns).length,
  d1Bindings: 1,
  r2Bindings: 1,
  secretBindings: 0,
}, null, 2));

function assertSameSet(actual, expected, label) {
  const actualSet = [...new Set(actual)].sort();
  const expectedSet = [...new Set(expected)].sort();
  assert(JSON.stringify(actualSet) === JSON.stringify(expectedSet), `${label} do not match the reviewed allowlist`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}


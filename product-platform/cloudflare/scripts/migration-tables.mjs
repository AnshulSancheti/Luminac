import { createHash } from "node:crypto";

export const TABLES = [
  table("import_batches", "id", "select id,source_file,source_url,source_file_checksum,source_kind,status,started_at,finished_at,total_rows,valid_rows,invalid_rows,families_created,products_created,products_updated,assets_linked,warnings,errors from public.import_batches order by id", ["total_rows","valid_rows","invalid_rows","families_created","products_created","products_updated","assets_linked"]),
  table("catalog_categories", "id", "select id,parent_id,level,environment,name,slug,full_slug,route_path,sort_order,is_active,created_at,updated_at from public.catalog_categories order by case level when 'environment' then 0 when 'subcategory' then 1 else 2 end,sort_order,id", ["sort_order","is_active"]),
  table("product_families", "id", "select id,category_id,environment,family_code,family_code_normalized,slug,display_name,series_label,short_description,description,status,sort_order,is_featured,source_file,source_sheet,created_at,updated_at,deleted_at from public.product_families order by sort_order,id", ["sort_order","is_featured"]),
  table("products", "id", "select id,family_id,model_no,model_no_normalized,slug,display_name,variant_label,power_text,power_watts,status,is_primary_variant,sort_order,mrp_inr,raw_excel_values,search_text::text as search_text,created_at,updated_at,deleted_at from public.products order by model_no,id", ["power_watts","is_primary_variant","sort_order","mrp_inr"]),
  table("indoor_product_details", "product_id", "select product_id,size_text,cutout_text,finish_text,cct_text,beam_angle_text,light_source,ip_rating,cri,created_at,updated_at from public.indoor_product_details order by product_id", ["cri"]),
  table("outdoor_product_details", "product_id", "select product_id,size_text,finish_text,cct_text,light_source,ip_rating,created_at,updated_at from public.outdoor_product_details order by product_id"),
  table("product_spec_values", "id", "select id,product_id,spec_key,spec_label,value_text,value_normalized,value_number,unit,source_text,sort_order,created_at from public.product_spec_values order by product_id,sort_order,id", ["value_number","sort_order"]),
  table("product_extra_fields", "id", "select id,product_id,field_group,field_key,field_label,value_text,value_number,unit,is_public,sort_order,created_at from public.product_extra_fields order by product_id,sort_order,id", ["value_number","is_public","sort_order"]),
  table("asset_files", "id", "select id,bucket,storage_key,public_url,original_filename,mime_type,size_bytes,checksum_sha256,width,height,status,created_at,updated_at,deleted_at from public.asset_files order by id", ["size_bytes","width","height","source_width","source_height","source_was_low_resolution","was_upscaled"]),
  table("product_assets", "id", "select id,product_id,asset_id,asset_role,title,alt_text,caption,sort_order,is_primary,is_public,created_at,updated_at from public.product_assets order by product_id,sort_order,id", ["sort_order","is_primary","is_public"]),
  table("product_family_assets", "id", "select id,family_id,asset_id,asset_role,title,alt_text,caption,sort_order,is_primary,is_public,created_at,updated_at from public.product_family_assets order by family_id,sort_order,id", ["sort_order","is_primary","is_public"]),
  table("tags", "id", "select id,tag_type,name,slug,is_active,sort_order,created_at from public.tags order by sort_order,id", ["is_active","sort_order"]),
  table("product_tags", "product_id,tag_id", "select product_id,tag_id,created_at from public.product_tags order by product_id,tag_id"),
  table("seo_entries", "id", "select id,category_id,family_id,product_id,route_path,canonical_path,meta_title,meta_description,og_title,og_description,og_image_asset_id,schema_json,noindex,created_at,updated_at from public.seo_entries order by id", ["noindex"]),
  table("redirects", "id", "select id,source_path,target_path,status_code,reason,is_active,created_at,updated_at from public.redirects order by id", ["status_code","is_active"]),
  table("import_source_rows", "id", "select id,import_batch_id,source_file,source_sheet,source_row_number,category_id,family_id,product_id,model_no,raw_values,normalized_values,status,warnings,errors,created_at,pdf_page,source_reference from public.import_source_rows order by source_sheet,source_row_number,id", ["source_row_number","pdf_page"]),
  table("project_enquiries", "id", "select id,name,email,phone,company,enquiry_type,message,product_id,family_id,category_id,status,source_path,created_at,updated_at from public.project_enquiries order by id"),
  table("technical_asset_requests", "id", "select id,name,email,phone,company,request_type,message,status,source_path,created_at,updated_at from public.technical_asset_requests order by id"),
  table("technical_asset_request_items", "id", "select id,request_id,product_id,asset_id,created_at from public.technical_asset_request_items order by id"),
  table("audit_logs", "id", "select id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,created_at from public.audit_logs order by id"),
];

export const DELETE_ORDER = [...TABLES].reverse().map(({ name }) => name);

export function normalizeForD1(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot migrate non-finite number: ${value}`);
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function tableDigest(columns, rows, key, numericColumns = []) {
  const numericColumnSet = new Set(numericColumns);
  const keyColumns = key.split(",");
  const sortedRows = [...rows].sort((left, right) => {
    const leftKey = JSON.stringify(keyColumns.map((column) => normalizeForD1(left[column])));
    const rightKey = JSON.stringify(keyColumns.map((column) => normalizeForD1(right[column])));
    return leftKey.localeCompare(rightKey);
  });
  const normalized = sortedRows.map((row) => columns.map((column) => {
    const value = normalizeForD1(row[column]);
    return numericColumnSet.has(column) ? canonicalNumber(value) : value;
  }));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function table(name, key, query, numericColumns = []) {
  return { name, key, query, numericColumns };
}

function canonicalNumber(value) {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Cannot hash invalid numeric value: ${value}`);
  return String(numeric);
}

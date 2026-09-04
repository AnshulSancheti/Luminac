export type ProductStatus = "draft" | "published" | "archived" | "discontinued";
export type Environment = "indoor" | "outdoor";
export type ReviewStatus = "needs_review" | "reviewed_ok" | "corrected" | "blocked";

export interface CatalogCategory {
  id: string;
  parent_id: string | null;
  level: "environment" | "subcategory" | "product_category";
  environment: Environment;
  name: string;
  slug: string;
  full_slug: string;
  route_path: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProductFamily {
  id: string;
  category_id: string;
  environment: Environment;
  family_code: string | null;
  family_code_normalized: string | null;
  slug: string;
  display_name: string;
  series_label: string | null;
  short_description: string | null;
  description: string | null;
  status: ProductStatus;
  sort_order: number;
  is_featured: boolean;
}

export interface ProductRow {
  id: string;
  family_id: string;
  model_no: string;
  model_no_normalized: string;
  slug: string;
  display_name: string;
  variant_label: string | null;
  power_text: string | null;
  power_watts: number | null;
  status: ProductStatus;
  is_primary_variant: boolean;
  sort_order: number;
  mrp_inr: number | null;
  raw_excel_values: Record<string, unknown>;
}

export interface IndoorProductDetails {
  product_id: string;
  size_text: string | null;
  cutout_text: string | null;
  finish_text: string | null;
  cct_text: string | null;
  beam_angle_text: string | null;
  light_source: string | null;
  ip_rating: string | null;
  cri: number | null;
}

export interface OutdoorProductDetails {
  product_id: string;
  size_text: string | null;
  finish_text: string | null;
  cct_text: string | null;
  light_source: string | null;
  ip_rating: string | null;
}

export interface ProductSpecValue {
  id: string;
  product_id: string;
  spec_key: string;
  spec_label: string;
  value_text: string;
  value_normalized: string;
  value_number: number | null;
  unit: string | null;
  source_text: string | null;
  sort_order: number;
}

export interface ProductExtraField {
  id: string;
  product_id: string;
  field_group: string;
  field_key: string;
  field_label: string;
  value_text: string;
  value_number: number | null;
  unit: string | null;
  is_public: boolean;
  sort_order: number;
}

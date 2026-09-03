import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_CATALOG_API_BASE_URL =
  "https://luminac-catalog-staging.shivam-a7d.workers.dev";

export const catalogApiBaseUrl = (
  process.env.LUMINAC_CATALOG_API_BASE_URL ?? DEFAULT_CATALOG_API_BASE_URL
).replace(/\/$/, "");

export type CatalogAsset = {
  storage_key: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  asset_role: "product" | "application" | "line_drawing";
  variant: string | null;
  title: string | null;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  is_primary: number;
  url: string | null;
};

export type CatalogProductSummary = {
  id: string;
  modelNo: string;
  slug: string;
  name: string;
  variantLabel: string | null;
  powerText: string | null;
  powerWatts: number | null;
  isPrimaryVariant: boolean;
  environment: "indoor" | "outdoor";
  family?: {
    slug: string;
    name: string;
    seriesLabel: string | null;
  };
  category?: {
    slug: string;
    fullSlug: string;
    name: string;
  };
  primaryImage: { url: string; alt: string | null } | null;
};

export type CatalogProduct = CatalogProductSummary & {
  family: {
    id: string;
    slug: string;
    name: string;
    seriesLabel: string | null;
    shortDescription: string | null;
    description: string | null;
  };
  category: {
    id: string;
    slug: string;
    fullSlug: string;
    name: string;
    routePath: string;
  };
  details: {
    size_text?: string | null;
    cutout_text?: string | null;
    finish_text?: string | null;
    cct_text?: string | null;
    beam_angle_text?: string | null;
    light_source?: string | null;
    ip_rating?: string | null;
    cri?: number | string | null;
  } | null;
  specifications: Array<{
    spec_key: string;
    spec_label: string;
    value_text: string | null;
    value_normalized: string | null;
    value_number: number | null;
    unit: string | null;
    sort_order: number;
  }>;
  extraFields: Array<{
    field_group: string | null;
    field_key: string;
    field_label: string;
    value_text: string | null;
    value_number: number | null;
    unit: string | null;
    sort_order: number;
  }>;
  assets: CatalogAsset[];
  assetGroups: {
    product: CatalogAsset[];
    application: CatalogAsset[];
    lineDrawing: CatalogAsset[];
  };
  tags: Array<{ tag_type: string; name: string; slug: string }>;
  seo: {
    routePath: string | null;
    canonicalPath: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    schemaJson: string | null;
    noindex: boolean;
  } | null;
};

type ProductResponse = { product: CatalogProduct };
type ProductListResponse = {
  products: CatalogProductSummary[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
};

async function fetchCatalogJson<T>(path: string): Promise<T | null> {
  const requestInit = {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  } satisfies RequestInit;

  let catalogService: CloudflareEnv["CATALOG_API"] | undefined;
  try {
    catalogService = getCloudflareContext().env.CATALOG_API;
  } catch {
    // `next dev` runs outside Workers unless Cloudflare dev bindings are initialized.
  }

  const response = catalogService
    ? await catalogService.fetch(
        new Request(`https://luminac-catalog.internal${path}`, requestInit),
      )
    : await fetch(`${catalogApiBaseUrl}${path}`, requestInit);

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Catalog API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export const getCatalogProduct = cache(async (slug: string) => {
  const response = await fetchCatalogJson<ProductResponse>(
    `/api/products/${encodeURIComponent(slug)}`,
  );
  return response?.product ?? null;
});

export const getFamilyVariants = cache(async (familySlug: string, familyName: string) => {
  const response = await fetchCatalogJson<ProductListResponse>(
    `/api/products?q=${encodeURIComponent(familyName)}&pageSize=50`,
  );
  return (response?.products ?? []).filter((product) => product.family?.slug === familySlug);
});

export function catalogAssetUrl(asset: CatalogAsset | { url: string | null } | null) {
  if (!asset?.url) return null;
  return new URL(asset.url, `${catalogApiBaseUrl}/`).toString();
}

export function uniqueSpecValues(product: CatalogProduct, key: string) {
  return [
    ...new Set(
      product.specifications
        .filter((specification) => specification.spec_key === key)
        .map((specification) => specification.value_text?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

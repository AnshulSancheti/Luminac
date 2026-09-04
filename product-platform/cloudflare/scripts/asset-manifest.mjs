export const PUBLIC_ASSET_ROLES = Object.freeze(["product", "application", "line_drawing"]);

const ROLE_SET = new Set(PUBLIC_ASSET_ROLES);
const MODEL = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const VARIANT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function validateAssetManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Asset manifest must be an object");
  }
  if (manifest.formatVersion !== 2) throw new Error(`Unsupported asset manifest format: ${manifest.formatVersion ?? "missing"}`);
  if (!Array.isArray(manifest.products)) throw new Error("Asset manifest products must be an array");

  const seenModels = new Set();
  const seenObjectKeys = new Set();
  let assetCount = 0;

  for (const product of manifest.products) {
    if (!MODEL.test(product.model)) throw new Error(`Invalid manifest model: ${product.model}`);
    if (seenModels.has(product.model)) throw new Error(`Duplicate manifest model: ${product.model}`);
    seenModels.add(product.model);
    if (!Array.isArray(product.assets)) throw new Error(`Manifest assets must be an array: ${product.model}`);

    const seenRoleOrder = new Set();
    let primaryCount = 0;
    for (const asset of product.assets) {
      assetCount += 1;
      if (!ROLE_SET.has(asset.role)) throw new Error(`Unsupported public asset role for ${product.model}: ${asset.role}`);
      if (!VARIANT.test(asset.variant)) throw new Error(`Invalid asset variant for ${product.model}: ${asset.variant}`);
      if (!Number.isSafeInteger(asset.sortOrder) || asset.sortOrder < 0) {
        throw new Error(`Invalid asset sort order for ${product.model}/${asset.role}: ${asset.sortOrder}`);
      }
      const roleOrder = `${asset.role}\u0000${asset.sortOrder}`;
      if (seenRoleOrder.has(roleOrder)) throw new Error(`Duplicate role/sort order for ${product.model}: ${asset.role}/${asset.sortOrder}`);
      seenRoleOrder.add(roleOrder);

      if (asset.reviewStatus !== "approved") throw new Error(`Unapproved asset cannot enter the public manifest: ${asset.sourcePath}`);
      if (asset.isPrimary === true) {
        if (asset.role !== "product") throw new Error(`Only product assets can be primary: ${asset.objectKey}`);
        primaryCount += 1;
      } else if (asset.isPrimary !== false) {
        throw new Error(`Asset isPrimary must be boolean: ${asset.objectKey}`);
      }

      if (!SHA256.test(asset.sha256)) throw new Error(`Invalid SHA-256 for ${product.model}/${asset.variant}`);
      const expectedPrefix = `products/${product.model.toLowerCase()}/${asset.role.replaceAll("_", "-")}/`;
      const expectedSuffix = `.${asset.sha256.slice(0, 12)}.webp`;
      if (typeof asset.objectKey !== "string" || !asset.objectKey.startsWith(expectedPrefix) || !asset.objectKey.endsWith(expectedSuffix)) {
        throw new Error(`Asset key is not content-versioned or role-scoped: ${asset.objectKey}`);
      }
      if (!isSafeObjectKey(asset.objectKey)) throw new Error(`Unsafe asset object key: ${asset.objectKey}`);
      if (seenObjectKeys.has(asset.objectKey)) throw new Error(`Duplicate asset object key: ${asset.objectKey}`);
      seenObjectKeys.add(asset.objectKey);

      for (const [field, value] of Object.entries({
        sourceWidth: asset.sourceWidth,
        sourceHeight: asset.sourceHeight,
        sourceBytes: asset.sourceBytes,
        outputWidth: asset.outputWidth,
        outputHeight: asset.outputHeight,
        outputBytes: asset.outputBytes,
      })) {
        if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${field} for ${asset.objectKey}`);
      }
    }

    const productAssets = product.assets.filter((asset) => asset.role === "product");
    if (productAssets.length > 0 && primaryCount !== 1) {
      throw new Error(`Product ${product.model} must have exactly one primary product asset; found ${primaryCount}`);
    }
  }

  return { productCount: manifest.products.length, assetCount };
}

export function flattenAssetManifest(manifest) {
  validateAssetManifest(manifest);
  return manifest.products.flatMap((product) => product.assets.map((asset) => ({ product, asset })));
}

export function publicAssetAltText(product, asset) {
  const name = product.display_name || product.model_no || product.model;
  if (asset.role === "application") return `${name} application image – ${asset.variant}`;
  if (asset.role === "line_drawing") return `${name} line drawing – ${asset.variant}`;
  return `${name} – ${asset.variant}`;
}

export function isSafeObjectKey(key) {
  return typeof key === "string" &&
    key.length > 0 &&
    !key.startsWith("/") &&
    !key.includes("\\") &&
    key.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

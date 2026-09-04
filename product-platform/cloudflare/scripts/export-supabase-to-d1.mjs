import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DELETE_ORDER, normalizeForD1, tableDigest, TABLES } from "./migration-tables.mjs";
import { publicAssetAltText, validateAssetManifest } from "./asset-manifest.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(projectRoot, "..");
const generatedRoot = resolve(projectRoot, "cloudflare/generated");
const outputPath = resolve(generatedRoot, "catalog-import.sql");
const verificationPath = resolve(generatedRoot, "catalog-import-manifest.json");
const localAssetManifestPath = resolve(repoRoot, "catalogue-data/optimized-r2/manifest.json");
const generatedAt = new Date().toISOString();

const tables = new Map();
const sourceCounts = new Map();
for (const definition of TABLES) {
  const rows = runSupabaseQuery(definition.name, definition.query).map((row) => adaptSourceRow(definition.name, row));
  tables.set(definition.name, rows);
  sourceCounts.set(definition.name, rows.length);
}

const products = tables.get("products");
const productByModel = new Map(products.map((product) => [product.model_no, product]));
const localAssetManifestText = await readFile(localAssetManifestPath, "utf8");
const localAssetManifest = JSON.parse(localAssetManifestText);
validateAssetManifest(localAssetManifest);
const generatedAssetRows = [];
const generatedProductAssetRows = [];

for (const productEntry of localAssetManifest.products) {
  const product = productByModel.get(productEntry.model);
  if (!product) throw new Error(`Local asset manifest model is absent from Supabase: ${productEntry.model}`);
  for (const asset of productEntry.assets) {
    const assetId = stableId("asset", asset.objectKey);
    generatedAssetRows.push({
      id: assetId,
      bucket: "luminac-product-images-qa",
      storage_key: asset.objectKey,
      public_url: null,
      original_filename: basename(asset.sourcePath),
      mime_type: "image/webp",
      size_bytes: asset.outputBytes,
      checksum_sha256: asset.sha256,
      width: asset.outputWidth,
      height: asset.outputHeight,
      source_width: asset.sourceWidth,
      source_height: asset.sourceHeight,
      source_path: asset.sourcePath,
      source_was_low_resolution: asset.lowResolutionSource,
      was_upscaled: asset.upscaled,
      status: "published",
      created_at: generatedAt,
      updated_at: generatedAt,
      deleted_at: null,
    });
    generatedProductAssetRows.push({
      id: stableId("product_asset", `${product.id}:${assetId}`),
      product_id: product.id,
      asset_id: assetId,
      asset_role: asset.role,
      variant: asset.variant,
      title: null,
      alt_text: publicAssetAltText(product, asset),
      caption: null,
      sort_order: asset.sortOrder,
      is_primary: asset.isPrimary,
      is_public: true,
      created_at: generatedAt,
      updated_at: generatedAt,
    });
  }
}

mergeUnique(tables.get("asset_files"), generatedAssetRows, "asset_files", ["id"], ["bucket", "storage_key"]);
mergeUnique(tables.get("product_assets"), generatedProductAssetRows, "product_assets", ["id"], ["product_id", "asset_role", "sort_order"]);

const statements = [
  "PRAGMA foreign_keys = ON;",
  "PRAGMA defer_foreign_keys = TRUE;",
];
for (const table of DELETE_ORDER) {
  if (table !== "audit_logs") statements.push(`DELETE FROM ${identifier(table)};`);
}
for (const definition of TABLES) {
  for (const row of tables.get(definition.name)) {
    statements.push(insert(definition.name, row, definition.name === "audit_logs"));
  }
}
statements.push("PRAGMA foreign_key_check;");
statements.push("PRAGMA optimize;");

const manifest = {
  formatVersion: 2,
  generatedAt,
  source: {
    database: "linked-supabase-public-schema",
    localAssetManifest: "catalogue-data/optimized-r2/manifest.json",
    localAssetManifestSha256: sha256(localAssetManifestText),
  },
  tables: Object.fromEntries(TABLES.map(({ name, key, numericColumns }) => {
    const rows = tables.get(name);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : columnsFromQuery(TABLES.find((item) => item.name === name).query);
    return [name, {
      key,
      columns,
      numericColumns,
      sourceRowCount: sourceCounts.get(name),
      generatedRowCount: rows.length - sourceCounts.get(name),
      rowCount: rows.length,
      sha256: tableDigest(columns, rows, key, numericColumns),
      ...(name === "audit_logs" ? { appendOnly: true, sourceKeys: rows.map((row) => row.id) } : {}),
    }];
  })),
};

await mkdir(generatedRoot, { recursive: true });
await writeFile(outputPath, `${statements.join("\n")}\n`, { mode: 0o600 });
await writeFile(verificationPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
await chmod(outputPath, 0o600);
await chmod(verificationPath, 0o600);

console.log(JSON.stringify({
  output: outputPath,
  verificationManifest: verificationPath,
  tables: Object.fromEntries(Object.entries(manifest.tables).map(([name, details]) => [name, details.rowCount])),
}, null, 2));

function runSupabaseQuery(table, sql) {
  const result = spawnSync("supabase", ["db", "query", "--linked", "--output-format", "json", sql], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Read-only export failed for ${table}: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed.rows)) throw new Error(`Unexpected Supabase response while exporting ${table}`);
  return parsed.rows;
}

function adaptSourceRow(table, row) {
  if (table === "asset_files") {
    return {
      ...row,
      source_width: null,
      source_height: null,
      source_path: null,
      source_was_low_resolution: false,
      was_upscaled: false,
    };
  }
  if (table === "product_assets") return { ...row, variant: null };
  return row;
}

function mergeUnique(target, additions, table, ...uniqueColumnSets) {
  for (const columns of uniqueColumnSets) {
    const seen = new Set(target.map((row) => columns.map((column) => String(row[column])).join("\u0000")));
    for (const row of additions) {
      const key = columns.map((column) => String(row[column])).join("\u0000");
      if (seen.has(key)) throw new Error(`Generated ${table} row conflicts on (${columns.join(", ")})`);
      seen.add(key);
    }
  }
  target.push(...additions);
}

function insert(table, row, orIgnore = false) {
  const entries = Object.entries(row);
  return `INSERT${orIgnore ? " OR IGNORE" : ""} INTO ${identifier(table)} (${entries.map(([key]) => identifier(key)).join(",")}) VALUES (${entries.map(([, value]) => sqlValue(value)).join(",")});`;
}

function sqlValue(value) {
  const normalized = normalizeForD1(value);
  if (normalized === null) return "NULL";
  if (typeof normalized === "number") return String(normalized);
  return `'${normalized.replaceAll("'", "''")}'`;
}

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return `"${value}"`;
}

function stableId(prefix, value) {
  return `${prefix}_${sha256(value).slice(0, 32)}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function columnsFromQuery(query) {
  const selectList = query.match(/^select\s+(.+?)\s+from\s+/i)?.[1];
  if (!selectList) throw new Error(`Cannot derive columns from query: ${query}`);
  return selectList.split(",").map((expression) => {
    const alias = expression.match(/\s+as\s+([a-z_][a-z0-9_]*)$/i)?.[1];
    return alias || expression.trim();
  });
}

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeForD1, PUBLIC_DELETE_ORDER, PUBLIC_TABLES, stableId, tableDigest } from "./public-migration-tables.mjs";
import { publicAssetAltText, validateAssetManifest } from "./asset-manifest.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(projectRoot, "..");
const generatedRoot = resolve(projectRoot, "cloudflare/generated");
const outputPath = resolve(generatedRoot, "public-catalog-import.sql");
const verificationPath = resolve(generatedRoot, "public-catalog-import-manifest.json");
const localAssetManifestPath = resolve(repoRoot, "catalogue-data/optimized-r2/manifest.json");

const tables = new Map();
for (const definition of PUBLIC_TABLES) {
  tables.set(definition.name, runSupabaseQuery(definition.name, definition.query));
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
  if (!product) throw new Error(`Published product is absent for local asset model: ${productEntry.model}`);
  for (const asset of productEntry.assets) {
    const assetId = stableId("asset", asset.objectKey);
    generatedAssetRows.push({
      id: assetId,
      storage_key: asset.objectKey,
      mime_type: "image/webp",
      size_bytes: asset.outputBytes,
      width: asset.outputWidth,
      height: asset.outputHeight,
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
    });
  }
}

mergeUnique(tables.get("asset_files"), generatedAssetRows, "asset_files", ["id"], ["storage_key"]);
mergeUnique(tables.get("product_assets"), generatedProductAssetRows, "product_assets", ["id"], ["product_id", "asset_role", "sort_order"]);

const statements = ["PRAGMA foreign_keys = ON;", "PRAGMA defer_foreign_keys = TRUE;"];
for (const table of PUBLIC_DELETE_ORDER) statements.push(`DELETE FROM ${identifier(table)};`);
for (const definition of PUBLIC_TABLES) {
  for (const row of tables.get(definition.name)) statements.push(insert(definition.name, row));
}
statements.push("PRAGMA foreign_key_check;");
statements.push("PRAGMA optimize;");

const generatedAt = new Date().toISOString();
const manifest = {
  formatVersion: 1,
  generatedAt,
  classification: "public-catalog-only",
  source: {
    database: "linked-supabase-public-schema-published-projection",
    localAssetManifest: "catalogue-data/optimized-r2/manifest.json",
    localAssetManifestSha256: sha256(localAssetManifestText),
  },
  tables: Object.fromEntries(PUBLIC_TABLES.map(({ name, key, numericColumns }) => {
    const rows = tables.get(name);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : columnsFromQuery(PUBLIC_TABLES.find((item) => item.name === name).query);
    return [name, {
      key,
      columns,
      numericColumns,
      rowCount: rows.length,
      sha256: tableDigest(columns, rows, key, numericColumns),
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
  classification: manifest.classification,
  tables: Object.fromEntries(Object.entries(manifest.tables).map(([name, details]) => [name, details.rowCount])),
}, null, 2));

function runSupabaseQuery(table, sql) {
  const result = spawnSync("supabase", ["db", "query", "--linked", "--output-format", "json", sql], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Read-only public export failed for ${table}: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed.rows)) throw new Error(`Unexpected Supabase response while exporting ${table}`);
  return parsed.rows;
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

function insert(table, row) {
  const entries = Object.entries(row);
  return `INSERT INTO ${identifier(table)} (${entries.map(([key]) => identifier(key)).join(",")}) VALUES (${entries.map(([, value]) => sqlValue(value)).join(",")});`;
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function columnsFromQuery(query) {
  const selectList = query.trim().match(/^select\s+(.+?)\s+from\s+/is)?.[1];
  if (!selectList) throw new Error(`Cannot derive columns from query for empty table`);
  return selectList.split(",").map((expression) => {
    const alias = expression.match(/\s+as\s+([a-z_][a-z0-9_]*)$/i)?.[1];
    const qualified = expression.trim().match(/(?:^|\.)([a-z_][a-z0-9_]*)$/i)?.[1];
    return alias || qualified || expression.trim();
  });
}

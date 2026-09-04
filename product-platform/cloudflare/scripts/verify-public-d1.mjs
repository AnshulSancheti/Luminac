import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tableDigest } from "./public-migration-tables.mjs";

const remote = process.argv.includes("--remote");
const projectRoot = resolve(import.meta.dirname, "../..");
const manifestPath = resolve(projectRoot, "cloudflare/generated/public-catalog-import-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];
const verified = {};

if (manifest.formatVersion !== 1 || manifest.classification !== "public-catalog-only") {
  throw new Error("Unsupported or incorrectly classified public verification manifest");
}

for (const [table, expected] of Object.entries(manifest.tables)) {
  const columns = expected.columns.map(identifier).join(",");
  const rows = runD1Query(`SELECT ${columns} FROM ${identifier(table)}`);
  const actualHash = tableDigest(expected.columns, rows, expected.key, expected.numericColumns);
  verified[table] = rows.length;
  if (rows.length !== expected.rowCount || actualHash !== expected.sha256) {
    failures.push({
      table,
      expectedRows: expected.rowCount,
      actualRows: rows.length,
      expectedHash: expected.sha256.slice(0, 12),
      actualHash: actualHash.slice(0, 12),
    });
  }
}

const foreignKeyViolations = runD1Query("PRAGMA foreign_key_check");
if (foreignKeyViolations.length > 0) failures.push({ check: "foreign_keys", violations: foreignKeyViolations.length });

const requiredIndexes = [
  "product_assets_one_primary_idx",
  "product_assets_product_asset_unique_idx",
  "product_families_environment_sort_idx",
];
const indexRows = runD1Query("SELECT name FROM sqlite_schema WHERE type='index'");
const indexNames = new Set(indexRows.map((row) => row.name));
for (const index of requiredIndexes) {
  if (!indexNames.has(index)) failures.push({ check: "required_index", missing: index });
}

const sampleProduct = runD1Query("SELECT id FROM products ORDER BY id LIMIT 1")[0];
let assetQueryPlan = [];
if (sampleProduct?.id) {
  assetQueryPlan = runD1Query(`EXPLAIN QUERY PLAN
    SELECT af.storage_key,pa.asset_role,pa.sort_order
    FROM product_assets pa
    JOIN asset_files af ON af.id=pa.asset_id
    WHERE pa.product_id='${sqlLiteral(sampleProduct.id)}' AND pa.is_public=1
    ORDER BY pa.asset_role,pa.sort_order,pa.id`);
  const planText = assetQueryPlan.map((row) => String(row.detail ?? "")).join("\n");
  if (!planText.includes("SEARCH pa USING") || planText.includes("SCAN pa")) {
    failures.push({ check: "asset_query_plan", expected: "indexed product_assets search", plan: planText });
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ verified: false, remote, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    verified: true,
    remote,
    manifestGeneratedAt: manifest.generatedAt,
    classification: manifest.classification,
    tables: verified,
    foreignKeyViolations: 0,
    requiredIndexes: requiredIndexes.length,
    assetQueryPlan: assetQueryPlan.map((row) => row.detail),
  }, null, 2));
}

function runD1Query(sql) {
  const result = spawnSync("wrangler", [
    "d1", "execute", "luminac-public-catalog-staging",
    remote ? "--remote" : "--local",
    "--config", "wrangler.public.jsonc",
    "--json", "--command", sql,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${remote ? "Remote" : "Local"} public D1 verification failed: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed) || parsed.some((entry) => entry.success !== true)) {
    throw new Error("Unexpected response from public D1 verification query");
  }
  return parsed.flatMap((entry) => entry.results || []);
}

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe identifier in verification manifest: ${value}`);
  return `"${value}"`;
}

function sqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

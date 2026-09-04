import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tableDigest } from "./migration-tables.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const remote = process.argv.includes("--remote");
const database = argumentValue("--database") ?? "luminac-product-qa-db";
const manifestPath = resolve(projectRoot, "cloudflare/generated/catalog-import-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];
const verified = {};

if (![1, 2].includes(manifest.formatVersion)) {
  throw new Error(`Unsupported verification manifest version: ${manifest.formatVersion}`);
}

for (const [table, expected] of Object.entries(manifest.tables)) {
  const columns = expected.columns.map(identifier).join(",");
  const where = expected.appendOnly
    ? ` WHERE ${identifier(expected.key)} IN (${expected.sourceKeys.map(sqlValue).join(",") || "NULL"})`
    : "";
  const rows = runD1Query(`SELECT ${columns} FROM ${identifier(table)}${where}`);
  const actualHash = tableDigest(expected.columns, rows, expected.key, expected.numericColumns);
  const totalRows = expected.appendOnly
    ? Number(runD1Query(`SELECT COUNT(*) AS count FROM ${identifier(table)}`)[0]?.count ?? 0)
    : rows.length;
  verified[table] = expected.appendOnly ? { sourceRows: rows.length, preservedRows: totalRows - rows.length, totalRows } : rows.length;
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
if (foreignKeyViolations.length > 0) {
  failures.push({ check: "foreign_keys", violations: foreignKeyViolations.length });
}

if (failures.length > 0) {
  console.error(JSON.stringify({ verified: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    verified: true,
    manifestGeneratedAt: manifest.generatedAt,
    tables: verified,
    foreignKeyViolations: 0,
  }, null, 2));
}

function runD1Query(sql) {
  const result = spawnSync("wrangler", [
    "d1",
    "execute",
    database,
    remote ? "--remote" : "--local",
    "--json",
    "--command",
    sql,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${remote ? "Remote" : "Local"} D1 verification query failed: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed) || parsed.some((entry) => entry.success !== true)) {
    throw new Error("Unexpected response from local D1 verification query");
  }
  return parsed.flatMap((entry) => entry.results || []);
}

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe identifier in verification manifest: ${value}`);
  return `"${value}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

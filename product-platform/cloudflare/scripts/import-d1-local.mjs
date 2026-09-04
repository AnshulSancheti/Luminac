import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "../..");
const remote = process.argv.includes("--remote");
const result = spawnSync("wrangler", [
  "d1",
  "execute",
  "luminac-product-qa-db",
  remote ? "--remote" : "--local",
  "--json",
  "--file",
  "cloudflare/generated/catalog-import.sql",
], {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});

if (result.status !== 0) {
  const diagnostic = result.stderr || result.stdout || result.error?.message || `signal=${result.signal ?? "none"}`;
  throw new Error(`${remote ? "Remote" : "Local"} D1 import failed: ${diagnostic}`);
}

const operations = parseWranglerJson(result.stdout);
if (!Array.isArray(operations) || operations.some((operation) => operation.success !== true)) {
  throw new Error("Local D1 import returned an unexpected or unsuccessful response");
}

console.log(JSON.stringify({ imported: true, remote, operations: operations.length }, null, 2));

function parseWranglerJson(output) {
  const match = output.match(/(?:^|\n)(\[[\s\S]*)$/);
  if (!match) throw new Error("D1 import did not return a JSON operation array");
  return JSON.parse(match[1]);
}

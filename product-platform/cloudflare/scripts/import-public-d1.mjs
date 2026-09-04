import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const remote = process.argv.includes("--remote");
const projectRoot = resolve(import.meta.dirname, "../..");
const args = [
  "d1", "execute", "luminac-public-catalog-staging",
  remote ? "--remote" : "--local",
  "--config", "wrangler.public.jsonc",
  "--json",
  "--file", "cloudflare/generated/public-catalog-import.sql",
];
const result = spawnSync("wrangler", args, {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});

if (result.status !== 0) {
  throw new Error(`${remote ? "Remote" : "Local"} public D1 import failed: ${result.stderr || "Wrangler exited without an error message"}`);
}

const operations = parseWranglerJson(result.stdout);
if (!Array.isArray(operations) || operations.some((operation) => operation.success !== true)) {
  throw new Error(`${remote ? "Remote" : "Local"} public D1 import returned an unexpected or unsuccessful response`);
}

console.log(JSON.stringify({ imported: true, remote, operations: operations.length }, null, 2));

function parseWranglerJson(output) {
  const match = output.match(/(?:^|\n)(\[[\s\S]*)$/);
  if (!match) throw new Error("Public D1 import did not return a JSON operation array");
  return JSON.parse(match[1]);
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { flattenAssetManifest, isSafeObjectKey } from "./asset-manifest.mjs";

const APPLY = process.argv.includes("--apply");
const VERIFY_REMOTE = process.argv.includes("--verify-remote");
const BUCKET = argumentValue("--bucket") ?? "luminac-product-images-qa";
const PREFIX = argumentValue("--prefix") ?? "";
const CONCURRENCY = 6;
const projectRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(projectRoot, "..");
const optimizedRoot = resolve(repoRoot, "catalogue-data/optimized-r2");
const manifest = JSON.parse(await readFile(resolve(optimizedRoot, "manifest.json"), "utf8"));
const assets = flattenAssetManifest(manifest).map(({ product, asset }) => ({ ...asset, model: product.model }));
const seenKeys = new Set();

for (const asset of assets) {
  if (!isSafeObjectKey(asset.objectKey)) throw new Error(`Unsafe R2 object key: ${asset.objectKey}`);
  if (seenKeys.has(asset.objectKey)) throw new Error(`Duplicate R2 object key: ${asset.objectKey}`);
  seenKeys.add(asset.objectKey);

  const filePath = resolve(optimizedRoot, asset.objectKey);
  if (!filePath.startsWith(`${optimizedRoot}${sep}`)) throw new Error(`Asset escaped optimized root: ${asset.objectKey}`);
  const bytes = await readFile(filePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== asset.outputBytes || digest !== asset.sha256) {
    throw new Error(`Local asset integrity check failed: ${asset.objectKey}`);
  }
  asset.filePath = filePath;
  asset.remoteKey = PREFIX ? `${PREFIX}/${asset.objectKey}` : asset.objectKey;
  if (!isSafeObjectKey(asset.remoteKey)) throw new Error(`Unsafe remote R2 object key: ${asset.remoteKey}`);
}

if (!APPLY && !VERIFY_REMOTE) {
  console.log(JSON.stringify({
    ready: true,
    dryRun: true,
    bucket: BUCKET,
    prefix: PREFIX || null,
    objects: assets.length,
    objectsByRole: roleCounts(assets),
    bytes: assets.reduce((sum, asset) => sum + asset.outputBytes, 0),
  }, null, 2));
  process.exit(0);
}

if (APPLY) {
  let uploadedCount = 0;
  await runPool(assets, async (asset) => {
    await runWrangler([
      "r2", "object", "put", `${BUCKET}/${asset.remoteKey}`,
      "--remote",
      "--file", asset.filePath,
      "--content-type", "image/webp",
      "--cache-control", "public,max-age=31536000,immutable",
      "--force",
    ]);
    uploadedCount += 1;
    reportProgress("upload", uploadedCount, assets.length);
  });
}

if (VERIFY_REMOTE) {
  let verifiedCount = 0;
  await runPool(assets, async (asset) => {
    const downloaded = await runWrangler([
      "r2", "object", "get", `${BUCKET}/${asset.remoteKey}`,
      "--remote",
      "--pipe",
    ], true);
    const digest = createHash("sha256").update(downloaded).digest("hex");
    if (downloaded.length !== asset.outputBytes || digest !== asset.sha256) {
      throw new Error(`Remote R2 integrity check failed: ${asset.objectKey}`);
    }
    verifiedCount += 1;
    reportProgress("verify", verifiedCount, assets.length);
  });
}

console.log(JSON.stringify({
  uploaded: APPLY,
  remoteVerified: VERIFY_REMOTE,
  bucket: BUCKET,
  prefix: PREFIX || null,
  objects: assets.length,
  objectsByRole: roleCounts(assets),
  bytes: assets.reduce((sum, asset) => sum + asset.outputBytes, 0),
}, null, 2));

async function runPool(items, task) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await task(item);
    }
  }));
}

function runWrangler(args, binaryOutput = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("wrangler", args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Wrangler R2 operation failed (${args[2]}): ${Buffer.concat(stderr).toString("utf8")}`));
        return;
      }
      const output = Buffer.concat(stdout);
      resolvePromise(binaryOutput ? output : output.toString("utf8"));
    });
  });
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value.replace(/\/$/, "");
}

function roleCounts(items) {
  return Object.fromEntries(Array.from(Map.groupBy(items, (asset) => asset.role), ([role, rows]) => [role, rows.length]));
}

function reportProgress(phase, completed, total) {
  if (completed % 25 === 0 || completed === total) {
    console.error(JSON.stringify({ phase, completed, total, bucket: BUCKET }));
  }
}

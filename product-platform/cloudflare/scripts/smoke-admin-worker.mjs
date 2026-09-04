#!/usr/bin/env node

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
if (!baseUrl) {
  console.error("Usage: node cloudflare/scripts/smoke-admin-worker.mjs <base-url>");
  process.exit(2);
}

const paths = ["/", "/app.js", "/lib/productQaCore.js", "/api/status", "/api/products"];
const accessHost = "luminac.cloudflareaccess.com";

for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "application/json, text/html;q=0.9, */*;q=0.1" },
  });
  const body = await response.text();
  if (response.status !== 302) {
    throw new Error(`${path}: expected Cloudflare Access 302 challenge, received ${response.status}`);
  }
  if (!response.headers.get("cache-control")?.includes("no-store")) {
    throw new Error(`${path}: missing no-store cache policy`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error(`${path}: Access challenge has no login location`);
  const loginUrl = new URL(location);
  if (loginUrl.hostname !== accessHost || !loginUrl.pathname.startsWith("/cdn-cgi/access/login/")) {
    throw new Error(`${path}: unexpected Access login location`);
  }
  if (/productCount|products|model_no|modelNo|display_name|displayName/i.test(body)) {
    throw new Error(`${path}: Access challenge appears to disclose catalogue data`);
  }
}

const loginResponse = await fetch(baseUrl, { redirect: "follow" });
const loginUrl = new URL(loginResponse.url);
const loginBody = await loginResponse.text();
if (loginResponse.status !== 200 || loginUrl.hostname !== accessHost) {
  throw new Error("Cloudflare Access login page did not load successfully");
}
if (!loginBody.includes("Luminac Cloudflare account")) {
  throw new Error("Admin login is not offering the restricted Cloudflare account provider");
}
if (/Send login code|one[- ]time PIN/i.test(loginBody)) {
  throw new Error("Email one-time PIN is still exposed by the admin login page");
}

console.log(`Cloudflare account login protects all ${paths.length} unauthenticated admin routes: ${baseUrl}`);

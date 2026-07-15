import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

async function read(relativePath) {
  return readFile(path.join(adminRoot, relativePath), "utf8");
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
}

function forbidMatch(text, pattern, message) {
  if (pattern.test(text)) failures.push(message);
}

const [adminPage, vault, adminHtml, adminMain, viteConfig, packageJsonText] = await Promise.all([
  read("client/src/pages/Admin.tsx"),
  read("client/src/lib/private-admin-vault.ts"),
  read("client/admin.html"),
  read("client/src/admin-main.tsx"),
  read("vite.config.ts"),
  read("package.json"),
]);
const packageJson = JSON.parse(packageJsonText);

forbidMatch(adminPage, /VITE_ADMIN_PASSWORD|ADMIN_PASSWORD/, "Owner admin must not use a client-bundled password.");
forbidMatch(adminPage, /Cloudflare Pages\s*→|public on GitHub/i, "Owner admin must not describe itself as a public/cloud page.");
requireMatch(adminPage, /isLoopbackHost\(window\.location\.hostname\)/, "Owner admin must fail closed outside loopback.");
requireMatch(adminPage, /parseOwnerVaultImport/, "Owner admin imports must pass through bounded schema sanitization.");
requireMatch(adminPage, /buildVendorHandoff/, "Owner admin must build vendor-specific minimum-data handoffs.");
requireMatch(adminPage, /routeLabel\(order, vendors\)/, "Order list must show the vendor-routing decision.");
requireMatch(adminPage, /No active route matches this product/, "Order entry must warn when no vendor route exists.");
requireMatch(adminPage, /Customer totals, payment links, internal notes, margins, and other vendors are excluded/, "Vendor handoff UI must state the data-minimization boundary.");

requireMatch(vault, /const VAULT_KEY = "jbh\.owner\.vault\.v2"/, "Owner records must use the private vault storage namespace.");
requireMatch(vault, /MAX_IMPORT_BYTES = 2 \* 1024 \* 1024/, "Owner-vault imports must have a hard size limit.");
requireMatch(vault, /vendor\.needsPhone && order\.phone/, "Phone must be shared only when the assigned vendor requires it.");
requireMatch(vault, /vendor\.needsEmail && order\.email/, "Email must be shared only when the assigned vendor requires it.");
forbidMatch(vault, /buildVendorHandoff[\s\S]*order\.(total|subtotal|paymentLink|notes)/, "Vendor handoff must not include totals, payment links, or private notes.");
requireMatch(vault, /assignedVendorId/, "Orders must persist explicit vendor assignment.");
requireMatch(vault, /suggestRoute/, "Owner admin must include deterministic vendor-route selection.");

requireMatch(adminHtml, /noindex, nofollow, noarchive/, "Owner HTML must be marked non-indexable.");
requireMatch(adminHtml, /referrer" content="no-referrer"/, "Owner HTML must suppress referrers.");
requireMatch(adminHtml, /Content-Security-Policy/, "Owner HTML must include a restrictive CSP.");
requireMatch(adminMain, /import Admin from "@\/pages\/Admin"/, "Dedicated owner entry must load the admin directly.");

requireMatch(viteConfig, /input: path\.resolve\(import\.meta\.dirname, "client", "admin\.html"\)/, "Private build must use only the owner entry.");
requireMatch(viteConfig, /host: "127\.0\.0\.1"/g, "Private dev and preview servers must bind to loopback.");
requireMatch(viteConfig, /"X-Frame-Options": "DENY"/, "Private server must deny framing.");
requireMatch(viteConfig, /"Cache-Control": "no-store"/, "Private server must prevent caching.");

for (const scriptName of ["dev", "dev:owner", "preview"]) {
  const script = String(packageJson.scripts?.[scriptName] ?? "");
  if (!script.includes("127.0.0.1") || !script.includes("/admin.html")) {
    failures.push(`${scriptName} must open the dedicated owner entry on loopback.`);
  }
}
if (packageJson.scripts?.["security:owner-admin"] !== "node scripts/verify-owner-admin-boundary.mjs") {
  failures.push("security:owner-admin script is missing or changed.");
}

if (failures.length) {
  console.error("JBH owner-admin boundary verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("JBH owner admin verified: loopback-only, dedicated entry, deterministic vendor routing, bounded imports, and minimum-data handoffs.");

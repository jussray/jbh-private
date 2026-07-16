import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerRoot = path.join(adminRoot, "payment-worker");
const sourceRoot = path.join(workerRoot, "src");
const failures = [];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await collectFiles(child)));
    if (entry.isFile()) result.push(child);
  }
  return result;
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
}

function forbidMatch(text, pattern, message) {
  if (pattern.test(text)) failures.push(message);
}

const configPath = path.join(workerRoot, "wrangler.toml");
const entryPath = path.join(sourceRoot, "index.ts");
const migrationPath = path.join(adminRoot, "migrations", "add_online_orders.sql");
for (const required of [configPath, entryPath, migrationPath]) {
  if (!(await exists(required))) {
    failures.push(`Required payment-control file missing: ${required}`);
  }
}

if (await exists(configPath)) {
  const config = await readFile(configPath, "utf8");
  requireMatch(
    config,
    /^workers_dev\s*=\s*false\s*$/m,
    "Payment Worker must disable workers.dev.",
  );
  requireMatch(
    config,
    /^preview_urls\s*=\s*false\s*$/m,
    "Payment Worker must disable Preview URLs.",
  );
  requireMatch(
    config,
    /^main\s*=\s*"src\/index\.ts"\s*$/m,
    "Payment Worker entry must remain isolated.",
  );
  forbidMatch(
    config,
    /^\s*\[assets\]\s*$/m,
    "Payment Worker must not publish static assets.",
  );
  forbidMatch(
    config,
    /^\s*\[vars\]\s*$/m,
    "Sensitive runtime configuration must not be committed as Wrangler vars.",
  );
  forbidMatch(
    config,
    /workers\.dev/i,
    "Payment Worker config must not name a workers.dev route.",
  );
  forbidMatch(
    config,
    /^\s*(route|routes)\s*=/m,
    "Production routes must be attached explicitly after review, not committed here.",
  );
}

let source = "";
if (await exists(sourceRoot)) {
  const sourceFiles = (await collectFiles(sourceRoot)).filter((file) =>
    /\.(?:ts|tsx)$/i.test(file),
  );
  source = (
    await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))
  ).join("\n");
}

if (source) {
  for (const [pattern, message] of [
    [/constructEventAsync\(/, "Webhook must verify the exact raw request body with Stripe."],
    [/checkout_attempt_id/, "Checkout and webhook must share a private reconciliation identifier."],
    [/idempotencyKey/, "Checkout Session creation must use a Stripe idempotency key."],
    [/stripe_webhook_receipts/, "Webhook processing must use durable replay receipts."],
    [/amount_or_currency_mismatch/, "Webhook must fail closed on amount or currency mismatch."],
    [/Cf-Access-Jwt-Assertion/, "Owner export must validate the Cloudflare Access assertion."],
    [/CF_ACCESS_ALLOWED_EMAILS/, "Owner export must require an explicit owner allowlist."],
    [/collected_information\?\.shipping_details/, "Webhook must read Acacia shipping details from collected_information."],
    [/Promotion codes remain disabled/, "Discounts must remain disabled until ledger reconciliation supports them."],
    [/Stripe\.LatestApiVersion\s*=\s*"2025-02-24\.acacia"/, "Stripe SDK types and API version must stay aligned."],
    [/unknown key ID/i, "Access signing keys must refresh when Cloudflare rotates the key ID."],
  ]) {
    requireMatch(source, pattern, message);
  }

  for (const [pattern, message] of [
    [/vendor-docs/i, "Payment Worker must not reference vendor documents."],
    [/\.\.\/\.\.\/brand/i, "Payment Worker must not import private brand strategy."],
    [/private-admin-vault/i, "Payment Worker must not import the local owner vault."],
    [/owner-admin/i, "Payment Worker must not import owner UI components."],
    [/VITE_[A-Z0-9_]+/, "Payment Worker must not use browser-exposed environment variables."],
    [/console\.(?:log|error)\([^\n]*(customer|address|phone|email|items_json|shipping_address)/i, "Payment Worker logs must not include customer or order payload fields."],
    [/allow_promotion_codes\s*:\s*true/, "Promotion codes cannot be enabled without discount-aware amount reconciliation."],
    [/interface\s+StripeSessionCompat\s+extends/, "Do not widen Stripe SDK resource types with an incompatible interface."],
  ]) {
    forbidMatch(source, pattern, message);
  }
}

if (await exists(workerRoot)) {
  const files = await collectFiles(workerRoot);
  for (const file of files) {
    const relative = path.relative(workerRoot, file).replaceAll("\\", "/");
    if (/\.(?:env|dev\.vars)$/i.test(relative) || /(^|\/)\.env\./i.test(relative)) {
      failures.push(`Secret-bearing environment file is forbidden: payment-worker/${relative}`);
    }
    if (/\.(?:pdf|csv|xlsx|docx)$/i.test(relative)) {
      failures.push(`Private document type is forbidden in the payment Worker: payment-worker/${relative}`);
    }
  }
}

if (failures.length) {
  console.error("JBH payment Worker boundary verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "JBH payment Worker boundary verified: API-only, production previews disabled, Stripe replay and amount controls present, Access-protected export present, and no owner/vendor assets included.",
);

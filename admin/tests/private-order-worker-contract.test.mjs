import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  wrangler,
  packageJson,
  entry,
  webhook,
  adminOrders,
  access,
] = await Promise.all([
  read("wrangler.toml"),
  read("package.json"),
  read("admin/payment-worker/src/index.ts"),
  read("admin/payment-worker/src/webhook.ts"),
  read("admin/payment-worker/src/admin-orders.ts"),
  read("admin/payment-worker/src/access.ts"),
]);

const packageContract = JSON.parse(packageJson);

test("root Cloudflare deploy resolves the API-only private Worker", () => {
  assert.match(wrangler, /name = "jbh-private-payment-control"/);
  assert.match(wrangler, /main = "admin\/payment-worker\/src\/index\.ts"/);
  assert.match(wrangler, /workers_dev = false/);
  assert.match(wrangler, /preview_urls = false/);
  assert.match(wrangler, /keep_vars = true/);
  assert.doesNotMatch(wrangler, /\[assets\]/);
  assert.doesNotMatch(wrangler, /\[\[routes\]\]/);
  assert.doesNotMatch(wrangler, /directory\s*=/);
});

test("private Worker does not duplicate public checkout authority", () => {
  assert.doesNotMatch(entry, /\/api\/checkout/);
  assert.match(entry, /\/api\/stripe\/webhook/);
  assert.match(entry, /pathname\.startsWith\("\/api\/admin\/"\)/);
  assert.match(entry, /\/health/);
});

test("public Stripe events create one private paid order with routing fields", () => {
  assert.match(webhook, /checkout\.session\.completed/);
  assert.match(webhook, /checkout\.session\.async_payment_succeeded/);
  assert.match(webhook, /line_items\.data\.price\.product/);
  assert.match(webhook, /metadata\.product_id/);
  assert.match(webhook, /metadata\.variant/);
  assert.match(webhook, /getProduct\(productId\)/);
  assert.match(webhook, /ON CONFLICT \(stripe_session_id\) DO NOTHING/);
  assert.match(webhook, /payment_status.*'paid'/s);
  assert.match(webhook, /status.*'processing'/s);
  assert.match(webhook, /assignedVendorId: ""/);
  assert.match(webhook, /vendorStatus: "unassigned"/);
  assert.doesNotMatch(webhook, /SELECT\s+\*/i);
});

test("vendor order routes stay owner-only and mutate existing order items", () => {
  assert.match(adminOrders, /validateAccess\(request, env\)/);
  assert.match(adminOrders, /\/api\/admin\/orders/);
  assert.match(adminOrders, /\/vendor-route/);
  assert.match(adminOrders, /\/api\/admin\/vendor-orders/);
  assert.match(adminOrders, /assignedVendorId/);
  assert.match(adminOrders, /vendorSku/);
  assert.match(adminOrders, /vendorUnitCost/);
  assert.match(adminOrders, /vendorStatus/);
  assert.match(adminOrders, /SET items_json = \$\{mergedJson\}::jsonb/);
  assert.doesNotMatch(adminOrders, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});

test("owner authorization verifies Access signature and allowlist", () => {
  assert.match(access, /Cf-Access-Jwt-Assertion/);
  assert.match(access, /RSASSA-PKCS1-v1_5/);
  assert.match(access, /audiences\.includes\(audience\)/);
  assert.match(access, /allowedEmails\.has\(email\)/);
  assert.match(access, /claims\.exp/);
  assert.match(access, /claims\.iss/);
  assert.doesNotMatch(access, /CF_Authorization/);
});

test("root scripts verify and deploy the exact Worker contract", () => {
  assert.equal(
    packageContract.scripts["typecheck:worker"],
    "tsc -p admin/payment-worker/tsconfig.json",
  );
  assert.equal(
    packageContract.scripts["test:worker"],
    "node --test admin/tests/private-order-worker-contract.test.mjs",
  );
  assert.equal(packageContract.scripts.deploy, "wrangler deploy");
  assert.equal(packageContract.devDependencies.wrangler, "4.118.0");
});

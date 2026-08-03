import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("vendor replies become private quotes and reviewable sample drafts", async () => {
  const [migration, sourcing, index] = await Promise.all([
    read("migrations/007_vendor_sample_readiness.sql"),
    read("payment-worker/src/vendor-sourcing.ts"),
    read("payment-worker/src/index.ts"),
  ]);

  assert.match(migration, /ALTER COLUMN active SET DEFAULT FALSE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS vendor_quotes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS vendor_quote_items/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS vendor_sample_order_requests/);
  assert.match(migration, /unit_cost_cents INTEGER NOT NULL/);
  assert.match(migration, /total_cents = subtotal_cents \+ shipping_cents \+ duties_cents/);
  assert.match(migration, /ready_for_owner_checkout/);
  assert.doesNotMatch(migration, /DELETE FROM|TRUNCATE|DROP TABLE/i);

  assert.match(sourcing, /await validateAccess\(request, env\)/);
  assert.match(sourcing, /sourceMessageId/);
  assert.match(sourcing, /vendorSku/);
  assert.match(sourcing, /unit_cost_cents/);
  assert.match(sourcing, /subtotalCents = items\.reduce/);
  assert.match(sourcing, /ready_for_owner_checkout/);
  assert.match(sourcing, /expectedTotalCents/);
  assert.match(sourcing, /jsonb_to_recordset/);

  for (const forbidden of [
    /fetch\s*\(/,
    /stripeClient/,
    /STRIPE_SECRET_KEY/,
    /vendor_dispatch_jobs/,
    /vendor_product_mappings/,
    /sendMail/,
    /nodemailer/,
    /RESEND_API_KEY/,
    /status\s*=\s*'ordered'/,
  ]) {
    assert.doesNotMatch(sourcing, forbidden);
  }

  const sourcingRoute = index.indexOf(
    'pathname.startsWith("/api/admin/vendor-sourcing")',
  );
  const generalAdminRoute = index.indexOf('pathname.startsWith("/api/admin/")');
  assert.ok(sourcingRoute >= 0);
  assert.ok(generalAdminRoute > sourcingRoute);
});

test("vendor selection stays inactive until a separate verified activation", async () => {
  const [adminApi, migration, selectedStack] = await Promise.all([
    read("api/admin/vendor-routing.ts"),
    read("migrations/006_selected_vendor_stack.sql"),
    read("data/vendor-selection-intent.json"),
  ]);

  assert.match(adminApi, /active: z\.literal\(false\)\.optional\(\)/);
  assert.match(adminApi, /active: false/);
  assert.match(migration, /active\s*\)/i);
  assert.match(migration, /FALSE/);
  assert.match(selectedStack, /"dispatchAuthority": false/);
  assert.doesNotMatch(selectedStack, /"dispatchAuthority": true/);
});

test("sample totals are derived from stored quote rows, not browser prices", async () => {
  const sourcing = await read("payment-worker/src/vendor-sourcing.ts");

  assert.match(sourcing, /JOIN vendor_quote_items qi/);
  assert.match(sourcing, /Number\(row\.unit_cost_cents\) \* row\.quantity/);
  assert.match(
    sourcing,
    /const totalCents = subtotalCents \+ input\.shippingCents \+ input\.dutiesCents/,
  );
  assert.doesNotMatch(sourcing, /unitCostCents:\s*z\.number/);
});

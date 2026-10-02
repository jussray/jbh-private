import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preflight = await readFile(
  new URL("../scripts/preflight-shopify-physical-order-schema.mjs", import.meta.url),
  "utf8",
);
const productionWorkflow = await readFile(
  new URL("../../.github/workflows/paid-order-production-preflight.yml", import.meta.url),
  "utf8",
);

test("Shopify physical schema preflight is read-only and bounded", () => {
  assert.match(preflight, /to_regclass/);
  assert.match(preflight, /information_schema\.columns/);
  assert.match(preflight, /pg_indexes/);
  assert.match(preflight, /pg_constraint/);
  assert.match(preflight, /shopify_physical_orders/);
  assert.match(preflight, /processed_shopify_physical_events/);
  assert.match(preflight, /failed_shopify_physical_events/);
  assert.doesNotMatch(preflight, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/);
  assert.doesNotMatch(preflight, /console\.log\([^)]*DATABASE_URL/);
});

test("Shopify physical schema preflight preserves storage type invariants", () => {
  assert.match(preflight, /shipping_address_json[\s\S]*?udt_name = 'jsonb'/);
  assert.match(preflight, /items_json[\s\S]*?udt_name = 'jsonb'/);
  assert.match(preflight, /subtotal_cents[\s\S]*?udt_name = 'int4'/);
  assert.match(preflight, /total_cents[\s\S]*?udt_name = 'int4'/);
  assert.match(preflight, /shopify-physical-column-types-mismatch/);
});

test("Shopify physical schema preflight preserves idempotency invariants", () => {
  assert.match(preflight, /shopify_order_id/);
  assert.match(preflight, /first_webhook_id/);
  assert.match(preflight, /processedWebhookIdUnique/);
  assert.match(preflight, /failedWebhookIdUnique/);
  assert.match(preflight, /shopify-idempotency-constraints-missing/);
});

test("Shopify physical schema preflight preserves order CHECK constraints", () => {
  assert.match(preflight, /pg_get_constraintdef/);
  assert.match(preflight, /topic%orders\/paid/);
  assert.match(preflight, /currency%USD/);
  assert.match(preflight, /payment_status%paid/);
  for (const status of [
    "procurement_needed",
    "supplier_ordered",
    "supplier_confirmed",
    "shipped",
    "delivered",
    "cancelled",
  ]) {
    assert.match(preflight, new RegExp(status));
  }
  assert.match(preflight, /shopify-order-check-constraints-missing/);
});

test("Shopify physical schema preflight proves email-or-phone contact invariant", () => {
  assert.match(preflight, /column_name = 'customer_email'/);
  assert.match(preflight, /is_nullable = 'YES'/);
  assert.match(preflight, /shopify_physical_orders_customer_contact_present/);
  assert.match(preflight, /customer_email/);
  assert.match(preflight, /customer_phone/);
  assert.match(preflight, /shopify-customer-contact-invariant-missing/);
});

test("Shopify physical schema preflight publishes distinct bounded receipts", () => {
  for (const result of [
    "missing-database-url",
    "shopify-physical-tables-missing",
    "shopify-physical-columns-missing",
    "shopify-physical-column-types-mismatch",
    "shopify-idempotency-constraints-missing",
    "shopify-order-check-constraints-missing",
    "shopify-customer-contact-invariant-missing",
    "passed-shopify-physical-schema",
    "query-failed",
  ]) {
    assert.equal(preflight.includes(`"${result}"`), true);
  }
  for (const exitCode of [2, 3, 4, 5, 6, 7, 8, 9]) {
    assert.match(preflight, new RegExp(`process\\.exit\\(${exitCode}\\)`));
  }
});

test("production preflight uses the Shopify schema verifier with exact-head shell bootstrap and without applying SQL", () => {
  assert.match(productionWorkflow, /preflight:shopify-physical-schema/);
  assert.match(productionWorkflow, /paid-order-production-preflight\/shopify-/);
  assert.match(productionWorkflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(productionWorkflow, /EXPECTED_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(productionWorkflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(productionWorkflow, /https:\/\/x-access-token:\$\{GH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git/);
  assert.match(productionWorkflow, /git fetch --depth=1 origin "\$EXPECTED_HEAD_SHA"/);
  assert.match(productionWorkflow, /git checkout --detach FETCH_HEAD/);
  assert.match(productionWorkflow, /test "\$actual" = "\$EXPECTED_HEAD_SHA"/);
  assert.doesNotMatch(productionWorkflow, /actions\/checkout|actions\/setup-node/);
  assert.doesNotMatch(productionWorkflow, /psql\s+"\$DATABASE_URL"/);
  assert.doesNotMatch(productionWorkflow, /approval_phrase:/);
});

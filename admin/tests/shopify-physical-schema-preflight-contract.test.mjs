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
  assert.match(preflight, /shopify_physical_orders/);
  assert.match(preflight, /processed_shopify_physical_events/);
  assert.match(preflight, /failed_shopify_physical_events/);
  assert.doesNotMatch(preflight, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/);
  assert.doesNotMatch(preflight, /console\.log\([^)]*DATABASE_URL/);
});

test("Shopify physical schema preflight preserves idempotency invariants", () => {
  assert.match(preflight, /shopify_order_id/);
  assert.match(preflight, /first_webhook_id/);
  assert.match(preflight, /processedWebhookIdUnique/);
  assert.match(preflight, /failedWebhookIdUnique/);
  assert.match(preflight, /shopify-idempotency-constraints-missing/);
});

test("Shopify physical schema preflight publishes distinct bounded receipts", () => {
  for (const result of [
    "missing-database-url",
    "shopify-physical-tables-missing",
    "shopify-physical-columns-missing",
    "shopify-idempotency-constraints-missing",
    "passed-shopify-physical-schema",
    "query-failed",
  ]) {
    assert.equal(preflight.includes(`"${result}"`), true);
  }
  for (const exitCode of [2, 3, 4, 5, 6]) {
    assert.match(preflight, new RegExp(`process\\.exit\\(${exitCode}\\)`));
  }
});

test("production preflight uses the Shopify schema verifier without applying SQL", () => {
  assert.match(productionWorkflow, /preflight:shopify-physical-schema/);
  assert.match(productionWorkflow, /paid-order-production-preflight\/shopify-/);
  assert.match(productionWorkflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(productionWorkflow, /ref: \$\{\{ env\.EXPECTED_HEAD_SHA \}\}/);
  assert.doesNotMatch(productionWorkflow, /psql\s+"\$DATABASE_URL"/);
  assert.doesNotMatch(productionWorkflow, /approval_phrase:/);
});

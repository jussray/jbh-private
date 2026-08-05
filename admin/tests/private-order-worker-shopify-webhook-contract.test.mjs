import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhook = await readFile(
  new URL("../payment-worker/src/shopify-webhook.ts", import.meta.url),
  "utf8",
);

test("Shopify webhook deduplication binds each webhook id to one order", () => {
  assert.match(webhook, /SELECT shopify_order_id\s+FROM processed_shopify_events/s);
  assert.match(webhook, /existingOrderId !== shopifyOrderId/);
  assert.match(webhook, /existing_shopify_webhook_mismatch/);
  assert.match(webhook, /ON CONFLICT \(webhook_id\) DO NOTHING/);
  assert.match(webhook, /RETURNING shopify_order_id/);
});

test("existing Shopify order ids require an exact immutable receipt match", () => {
  for (const required of [
    "shopify_order_gid IS NOT DISTINCT FROM",
    "shop_domain =",
    "topic =",
    "service_code =",
    "customer_email =",
    "customer_name IS NOT DISTINCT FROM",
    "customer_phone IS NOT DISTINCT FROM",
    "items_json =",
    "subtotal =",
    "total =",
    "currency =",
    "payment_status = 'paid'",
    "fulfillment_status = 'service_pending'",
    "vendor_routing_status = 'not_applicable'",
    "existing_shopify_order_mismatch",
  ]) {
    assert.ok(webhook.includes(required), `missing exact receipt check: ${required}`);
  }
  assert.doesNotMatch(webhook, /SELECT\s+\*/i);
});

test("successful Shopify retries resolve their dead-letter receipt", () => {
  assert.match(webhook, /UPDATE failed_shopify_events/);
  assert.match(webhook, /SET resolved = true/);
  assert.match(webhook, /resolved_at = COALESCE\(resolved_at, NOW\(\)\)/);
  assert.match(webhook, /await resolveFailure\(sql, webhookId\)/);
  assert.match(webhook, /resolved = false/);
});

test("Shopify webhook errors never log payload or customer fields", () => {
  assert.doesNotMatch(webhook, /console\.(?:log|error)\([^\n]*(?:rawBody|payload|customerEmail|customerPhone)/);
  assert.match(webhook, /webhookId\.slice\(-8\)/);
  assert.match(webhook, /shopifyErrorCode\(error\)/);
});

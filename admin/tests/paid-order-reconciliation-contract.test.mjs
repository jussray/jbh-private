import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhook = await readFile(
  new URL("../api/stripe/webhook.ts", import.meta.url),
  "utf8",
);
const storage = await readFile(
  new URL("../api/_lib/storage.ts", import.meta.url),
  "utf8",
);
const schema = await readFile(
  new URL("../shared/schema.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../migrations/002_unique_stripe_session.sql", import.meta.url),
  "utf8",
);

test("hosted Checkout sessions are expanded and reconciled from canonical metadata", () => {
  assert.match(webhook, /checkout_attempt_id/);
  assert.match(webhook, /line_items\.data\.price\.product/);
  assert.match(webhook, /metadata\.product_id/);
  assert.match(webhook, /metadata\.variant/);
  assert.match(webhook, /getProduct\(productId\)/);
  assert.match(webhook, /catalog_price_mismatch/);
  assert.match(webhook, /shipping_mismatch/);
  assert.match(webhook, /total_mismatch/);
});

test("paid order creation uses Stripe-collected customer and delivery details", () => {
  assert.match(webhook, /collected_information\?\.shipping_details/);
  assert.match(webhook, /customer_details/);
  assert.match(webhook, /address\?\.country !== "US"/);
  assert.match(webhook, /createPaidCheckoutOrder/);
  assert.match(webhook, /paymentStatus: "paid"/);
  assert.match(webhook, /status: "processing"/);
});

test("one Stripe Checkout Session can create at most one order", () => {
  assert.match(schema, /stripe_session_id"\)\.unique\(\)/);
  assert.match(storage, /onConflictDoNothing\(\)/);
  assert.match(storage, /getOrderByStripeSessionId/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.match(migration, /WHERE stripe_session_id IS NOT NULL/);
});

test("legacy private checkout order IDs remain supported", () => {
  assert.match(webhook, /session\.metadata\?\.order_id/);
  assert.match(webhook, /markLegacyCheckoutPaid/);
});

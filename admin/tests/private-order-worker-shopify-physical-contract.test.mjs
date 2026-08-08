import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const indexSource = read("payment-worker/src/index.ts");
const sharedSource = read("payment-worker/src/shared.ts");
const modelSource = read("payment-worker/src/shopify-physical-order-model.ts");
const webhookSource = read("payment-worker/src/shopify-physical-webhook.ts");
const adminSource = read("payment-worker/src/shopify-procurement-admin.ts");
const migrationSource = read("migrations/008_shopify_physical_procurement.sql");

test("Worker exposes a dedicated Shopify paid-order webhook and owner queue", () => {
  assert.match(indexSource, /\/webhooks\/shopify\/orders-paid/);
  assert.match(indexSource, /handleShopifyPhysicalWebhook/);
  assert.match(indexSource, /\/api\/admin\/procurement-orders/);
  assert.match(indexSource, /handleShopifyProcurementAdminRequest/);
});

test("Shopify webhook bindings are provider-held environment values", () => {
  assert.match(sharedSource, /SHOPIFY_WEBHOOK_SECRET: string/);
  assert.match(sharedSource, /SHOPIFY_SHOP_DOMAIN: string/);
  assert.doesNotMatch(sharedSource, /shpss_|shpat_|shopify.*secret.*=/i);
});

test("physical catalog is exact-SKU and exact-price authoritative", () => {
  assert.match(modelSource, /PHYSICAL_CATALOG_BY_SKU/);
  assert.match(modelSource, /shopify_line_price_mismatch/);
  assert.match(modelSource, /unsupported_physical_sku/);
  assert.match(modelSource, /mixed_service_and_physical_cart/);
  assert.match(modelSource, /missing_shipping_address/);
});

test("webhook verifies raw-body HMAC, shop, topic, and delivery identity", () => {
  assert.match(webhookSource, /verifyShopifyWebhookHmac/);
  assert.match(webhookSource, /X-Shopify-Hmac-SHA256/);
  assert.match(webhookSource, /X-Shopify-Shop-Domain/);
  assert.match(webhookSource, /X-Shopify-Topic/);
  assert.match(webhookSource, /X-Shopify-Webhook-Id/);
  assert.match(webhookSource, /processed_shopify_physical_events/);
  assert.match(webhookSource, /failed_shopify_physical_events/);
});

test("manual procurement ledger defaults to procurement_needed and is additive", () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS shopify_physical_orders/);
  assert.match(migrationSource, /DEFAULT 'procurement_needed'/);
  assert.match(migrationSource, /supplier_ordered/);
  assert.match(migrationSource, /supplier_confirmed/);
  assert.match(migrationSource, /tracking_number/);
  assert.doesNotMatch(migrationSource, /DELETE FROM|DROP TABLE|TRUNCATE/i);
});

test("procurement lane cannot activate routing or dispatch suppliers", () => {
  const combined = `${webhookSource}\n${adminSource}\n${migrationSource}`;
  assert.doesNotMatch(combined, /INSERT INTO vendor_product_mappings/i);
  assert.doesNotMatch(combined, /INSERT INTO vendor_dispatch_jobs/i);
  assert.doesNotMatch(combined, /queueFulfillmentDispatch|upsertVendorMapping/);
  assert.doesNotMatch(combined, /stripeClient|PaymentIntent|checkout\.sessions/i);
  assert.doesNotMatch(adminSource, /\bfetch\s*\(/);
});

test("owner procurement mutations require Cloudflare Access", () => {
  assert.match(adminSource, /validateAccess/);
  assert.match(adminSource, /Unauthorized/);
  assert.match(adminSource, /allowedTransitions/);
  assert.match(adminSource, /supplier order reference are required/i);
  assert.match(adminSource, /Tracking number is required/);
});

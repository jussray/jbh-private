import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wrangler = await readFile(new URL("../../wrangler.toml", import.meta.url), "utf8");
const index = await readFile(
  new URL("../payment-worker/src/index.ts", import.meta.url),
  "utf8",
);
const webhook = await readFile(
  new URL("../payment-worker/src/shopify-webhook.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../migrations/007_shopify_paid_services.sql", import.meta.url),
  "utf8",
);

test("private Worker pins the canonical Shopify webhook shop domain", () => {
  assert.match(
    wrangler,
    /SHOPIFY_SHOP_DOMAIN\s*=\s*"8qp1z2-az\.myshopify\.com"/,
  );
  assert.doesNotMatch(wrangler, /SHOPIFY_WEBHOOK_SECRET\s*=/);
  assert.match(index, /pathname === "\/api\/shopify\/webhook"/);
  assert.match(webhook, /X-Shopify-Shop-Domain/);
  assert.match(webhook, /shopDomain !== expectedShop/);
});

test("paid Hair Match storage remains an isolated non-vendor service", () => {
  assert.match(migration, /service_code = 'jbh-hair-match-v1'/);
  assert.match(migration, /topic = 'orders\/paid'/);
  assert.match(migration, /subtotal = 25\.00/);
  assert.match(migration, /vendor_routing_status = 'not_applicable'/);
  assert.match(migration, /fulfillment_status = 'service_pending'/);
  assert.doesNotMatch(migration, /assigned_vendor_id|vendor_order_id|vendor_sku/);
});

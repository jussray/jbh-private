import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminRoot = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, adminRoot), "utf8");

const model = read("payment-worker/src/shopify-physical-order-model.ts");
const webhook = read("payment-worker/src/shopify-physical-webhook.ts");
const migration = read("migrations/011_shopify_customer_contact.sql");

test("paid-order model accepts Shopify email or phone without synthesizing contact", () => {
  assert.match(model, /customerEmail: string \| null/);
  assert.match(model, /order\.email \?\? order\.contact_email \?\? order\.customer\?\.email/);
  assert.match(model, /order\.phone \?\? order\.customer\?\.phone \?\? address\.phone/);
  assert.match(model, /if \(!customerEmail && !customerPhone\)/);
  assert.match(model, /missing_customer_contact/);
  assert.doesNotMatch(model, /missing_customer_email/);
  assert.doesNotMatch(model, /placeholder|example\.com|unknown@/i);
});

test("storage idempotency compares nullable email safely", () => {
  assert.match(
    webhook,
    /customer_email IS NOT DISTINCT FROM \$\{order\.customerEmail\}/,
  );
  assert.match(
    webhook,
    /customer_phone IS NOT DISTINCT FROM \$\{order\.customerPhone\}/,
  );
});

test("migration 011 makes email optional but requires at least one real contact", () => {
  assert.match(migration, /ALTER COLUMN customer_email DROP NOT NULL/);
  assert.match(migration, /shopify_physical_orders_customer_contact_present/);
  assert.match(migration, /NULLIF\(BTRIM\(customer_email\), ''\) IS NOT NULL/);
  assert.match(migration, /NULLIF\(BTRIM\(customer_phone\), ''\) IS NOT NULL/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

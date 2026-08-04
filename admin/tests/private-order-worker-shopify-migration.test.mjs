import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const contactMigration = new URL(
  "../migrations/007_contact_ingress_safety.sql",
  import.meta.url,
);
const canonicalShopifyMigration = new URL(
  "../migrations/008_shopify_paid_services.sql",
  import.meta.url,
);
const retiredDuplicateMigration = new URL(
  "../migrations/007_shopify_paid_services.sql",
  import.meta.url,
);

test("Shopify paid-service migration is sequenced once after contact ingress", async () => {
  await access(contactMigration);
  await access(canonicalShopifyMigration);
  await assert.rejects(
    access(retiredDuplicateMigration),
    (error) => error?.code === "ENOENT",
    "retired duplicate 007 Shopify migration must not exist",
  );
});

test("canonical Shopify migration remains additive and service-isolated", async () => {
  const sql = await readFile(canonicalShopifyMigration, "utf8");

  for (const required of [
    "CREATE TABLE IF NOT EXISTS shopify_paid_services",
    "CREATE TABLE IF NOT EXISTS processed_shopify_events",
    "CREATE TABLE IF NOT EXISTS failed_shopify_events",
    "service_code = 'jbh-hair-match-v1'",
    "topic = 'orders/paid'",
    "payment_status = 'paid'",
    "fulfillment_status = 'service_pending'",
    "vendor_routing_status = 'not_applicable'",
    "subtotal = 25.00",
  ]) {
    assert.ok(sql.includes(required), `missing migration contract: ${required}`);
  }

  assert.doesNotMatch(
    sql,
    /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX)|DELETE\s+FROM|TRUNCATE\s+TABLE)\b/i,
  );
  assert.doesNotMatch(
    sql,
    /assigned_vendor_id|vendor_order_id|vendor_sku/i,
  );
});

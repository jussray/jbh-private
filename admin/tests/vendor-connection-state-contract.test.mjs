import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/009_vendor_connection_state.sql", import.meta.url),
  "utf8",
);

test("Faire is registered privately as an observed manual wholesale account", () => {
  assert.match(migration, /\('faire', 'Faire', NULL, FALSE\)/);
  assert.match(migration, /'faire',[\s\S]*?'manual_wholesale',[\s\S]*?'account_observed'/);
  assert.match(migration, /Faire retailer buying emails are present in the owner inbox/);
  assert.match(migration, /no Faire API or Shopify fulfillment connection is proven/);
});

test("Dropship Beauty is catalog-connected from live Shopify inventory evidence", () => {
  assert.match(
    migration,
    /'dropship-beauty',[\s\S]*?'shopify_supplier_feed',[\s\S]*?'catalog_observed'/,
  );
  assert.match(migration, /gid:\/\/shopify\/Location\/94408442099/);
  assert.match(migration, /Body Wave, Deep Wave, Loose Wave, and Kinky Straight/);
});

test("supplier-backed Shopify hair orders receive only a private procurement hint", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION hint_shopify_supplier_lane/);
  assert.match(migration, /\^BRAZ-SEW-/);
  assert.match(migration, /NEW\.supplier_code := 'dropship-beauty'/);
  assert.match(migration, /procurement_status = 'procurement_needed'/);
});

test("connection migration cannot silently activate routing or dispatch", () => {
  assert.match(migration, /dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /state = 'dispatch_active' OR dispatch_authority = FALSE/);
  assert.doesNotMatch(migration, /INSERT INTO vendor_product_mappings/);
  assert.doesNotMatch(migration, /INSERT INTO vendor_dispatch_jobs/);
  assert.doesNotMatch(migration, /active\)\s*VALUES\s*\([^)]*TRUE/i);
});

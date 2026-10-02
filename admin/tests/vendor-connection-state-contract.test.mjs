import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration009 = readFileSync(
  new URL("../migrations/009_vendor_connection_state.sql", import.meta.url),
  "utf8",
);
const migration012 = readFileSync(
  new URL("../migrations/012_dropship_beauty_sku_families.sql", import.meta.url),
  "utf8",
);

test("Faire is registered privately as an observed manual wholesale account", () => {
  assert.match(migration009, /\('faire', 'Faire', NULL, FALSE\)/);
  assert.match(migration009, /'faire',[\s\S]*?'manual_wholesale',[\s\S]*?'account_observed'/);
  assert.match(migration009, /Faire retailer buying emails are present in the owner inbox/);
  assert.match(migration009, /no Faire API or Shopify fulfillment connection is proven/);
});

test("Dropship Beauty remains catalog-connected without dispatch authority", () => {
  assert.match(
    migration009,
    /'dropship-beauty',[\s\S]*?'shopify_supplier_feed',[\s\S]*?'catalog_observed'/,
  );
  assert.match(migration009, /gid:\/\/shopify\/Location\/94408442099/);
  assert.match(migration012, /2026-09-25 Shopify readback/);
  assert.match(migration012, /DSers location has no inventory levels/);
});

test("migration 012 supersedes the historical BRAZ-SEW-only supplier hint", () => {
  assert.match(migration009, /\^BRAZ-SEW-/);
  assert.match(migration012, /CREATE OR REPLACE FUNCTION hint_shopify_supplier_lane/);
  assert.match(migration012, /BRAZ-SEW-\(BW\|DW\|LW\|ST\|KS\|KC\|AK\|SW\)-/);
  assert.match(migration012, /BRAZ-TRANS-\(CLO-\(DW\|ST\|LW\|BW\)\|FRO-\(ST\|LW\)\)-/);
  assert.match(migration012, /613-BRAZ-SEW-BW-/);
  assert.match(migration012, /NEW\.supplier_code := 'dropship-beauty'/);
  assert.match(migration012, /procurement_status = 'procurement_needed'/);
});

test("supplier hints cannot silently activate exact routing or dispatch", () => {
  assert.match(migration009, /dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration009, /state = 'dispatch_active' OR dispatch_authority = FALSE/);
  assert.match(migration012, /dispatch_authority remains FALSE/);
  assert.doesNotMatch(migration012, /INSERT INTO vendor_product_mappings/);
  assert.doesNotMatch(migration012, /INSERT INTO vendor_dispatch_jobs/);
  assert.doesNotMatch(migration012, /queueFulfillmentDispatch/);
});

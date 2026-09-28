import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../migrations/014_shopify_physical_dispatch_gate.sql", import.meta.url),
  "utf8",
);

test("Shopify physical orders are bound to current supplier catalog authority", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS shopify_supplier_catalog_authorities/);
  assert.match(migration, /'dropship-beauty'/);
  assert.match(migration, /gid:\/\/shopify\/Location\/94408442099/);
  assert.match(migration, /'mapping_verified'/);
  assert.match(migration, /dispatch_authority,[\s\S]*?FALSE/);
});

test("supplier_ordered cannot bypass vendor dispatch authority", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION assert_shopify_physical_supplier_order_authority/);
  assert.match(migration, /target_vendor\.active IS DISTINCT FROM TRUE/);
  assert.match(migration, /vendor_connection_states state/);
  assert.match(migration, /state\.state = 'dispatch_active'/);
  assert.match(migration, /state\.dispatch_authority = TRUE/);
  assert.match(migration, /shopify_dispatch_vendor_authority_missing/);
});

test("Dropship Beauty SKU families are checked independently from dispatch proof", () => {
  assert.match(migration, /BRAZ-SEW-\(BW\|DW\|LW\|ST\|KS\|KC\|AK\|SW\)/);
  assert.match(migration, /BRAZ-TRANS-/);
  assert.match(migration, /613-BRAZ-SEW-BW/);
  assert.match(migration, /catalog_authority\.state <> 'dispatch_active'/);
  assert.match(migration, /shopify_dispatch_catalog_authority_missing/);
  assert.match(migration, /shopify_dispatch_supplier_sku_mismatch/);
});

test("future DSers products require exact variant, binding, and orchestrator authority", () => {
  assert.match(migration, /item\.value ->> 'productCode'/);
  assert.match(migration, /item\.value ->> 'canonicalVariant'/);
  assert.match(migration, /mapping\.supplier_sku = item\.value ->> 'sku'/);
  assert.match(migration, /vendor_dispatch_bindings binding/);
  assert.match(migration, /mapping\.orchestrator_code = 'dsers'/);
  assert.match(migration, /fulfillment_orchestrator_states orchestrator/);
  assert.match(migration, /shopify_dispatch_dsers_authority_missing/);
});

test("real Shopify procurement transition is trigger-gated", () => {
  assert.match(migration, /shopify_physical_supplier_order_authority_gate/);
  assert.match(migration, /BEFORE UPDATE OF procurement_status, supplier_code, supplier_order_reference/);
  assert.match(migration, /NEW\.procurement_status = 'supplier_ordered'/);
  assert.match(migration, /shopify_dispatch_supplier_order_reference_missing/);
});

test("stale Dropship Beauty role is corrected without activating dispatch", () => {
  assert.match(migration, /current-shopify-catalog-supplier/);
  assert.match(migration, /operating_role = 'primary-beauty-essentials'/);
  assert.match(migration, /dispatch remains blocked/);
});

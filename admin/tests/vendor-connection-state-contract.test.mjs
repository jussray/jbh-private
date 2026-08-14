import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/009_vendor_connection_state.sql", import.meta.url),
  "utf8",
);

test("Faire is registered privately without dispatch authority", () => {
  assert.match(migration, /\('faire', 'Faire', NULL, FALSE\)/);
  assert.match(migration, /'faire',[\s\S]*?'manual_wholesale',[\s\S]*?'pending_account'/);
  assert.match(migration, /retailer account or API connection is not yet proven/);
});

test("Dropship Beauty stays selected while app installation proof is pending", () => {
  assert.match(
    migration,
    /'dropship-beauty',[\s\S]*?'shopify_app_pending_verification',[\s\S]*?'selected_contacted'/,
  );
  assert.match(migration, /Shopify installed-app visibility is not proven/);
});

test("supplier-backed Shopify hair orders receive only a private procurement hint", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION hint_shopify_supplier_lane/);
  assert.match(migration, /\^BRAZ-SEW-/);
  assert.match(migration, /NEW\.supplier_code := 'dropship-bundles'/);
  assert.match(migration, /procurement_status = 'procurement_needed'/);
});

test("connection migration cannot silently activate routing or dispatch", () => {
  assert.match(migration, /dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /state = 'dispatch_active' OR dispatch_authority = FALSE/);
  assert.doesNotMatch(migration, /INSERT INTO vendor_product_mappings/);
  assert.doesNotMatch(migration, /INSERT INTO vendor_dispatch_jobs/);
  assert.doesNotMatch(migration, /active\)\s*VALUES\s*\([^)]*TRUE/i);
});

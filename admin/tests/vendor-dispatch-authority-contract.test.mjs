import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../migrations/013_dispatch_authority_gate.sql", import.meta.url),
  "utf8",
);

test("exact product mappings carry explicit dispatch authority evidence", () => {
  assert.match(migration, /ALTER TABLE vendor_product_mappings/);
  assert.match(migration, /supplier_sku TEXT/);
  assert.match(migration, /orchestrator_code TEXT/);
  assert.match(migration, /supplier_platform TEXT/);
  assert.match(migration, /dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /mapping_verified_at TIMESTAMPTZ/);
  assert.match(migration, /vendor_product_mapping_dispatch_authority_check/);
});

test("dispatch requires active vendor and exact product+variant authority", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION assert_vendor_group_dispatch_authority/);
  assert.match(migration, /target_vendor\.active IS DISTINCT FROM TRUE/);
  assert.match(migration, /vendor_connection_states state/);
  assert.match(migration, /state\.state = 'dispatch_active'/);
  assert.match(migration, /state\.dispatch_authority = TRUE/);
  assert.match(migration, /mapping\.product_id = item\.value ->> 'id'/);
  assert.match(migration, /mapping\.variant = item\.value ->> 'variant'/);
  assert.match(migration, /mapping\.vendor_id = target_group\.vendor_id/);
  assert.match(migration, /mapping\.dispatch_authority = TRUE/);
  assert.match(migration, /dispatch_exact_mapping_missing/);
});

test("vendor to orchestrator binding must be dispatch-active", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS vendor_dispatch_bindings/);
  assert.match(migration, /binding\.orchestrator_code = mapping\.orchestrator_code/);
  assert.match(migration, /binding\.supplier_platform = mapping\.supplier_platform/);
  assert.match(migration, /binding\.state = 'dispatch_active'/);
  assert.match(migration, /binding\.dispatch_authority = TRUE/);
  assert.match(migration, /dispatch_binding_authority_missing/);
});

test("DSers is middleware and cannot dispatch from installation evidence alone", () => {
  assert.match(migration, /mapping\.orchestrator_code = 'dsers'/);
  assert.match(migration, /fulfillment_orchestrator_states orchestrator/);
  assert.match(migration, /orchestrator\.code = 'dsers'/);
  assert.match(migration, /orchestrator\.state = 'dispatch_active'/);
  assert.match(migration, /orchestrator\.dispatch_authority = TRUE/);
  assert.match(migration, /dispatch_dsers_authority_missing/);
});

test("group queue and dispatch-job insert are both fail-closed", () => {
  assert.match(migration, /vendor_fulfillment_dispatch_authority_gate/);
  assert.match(migration, /BEFORE UPDATE OF status ON vendor_fulfillment_groups/);
  assert.match(migration, /vendor_dispatch_job_authority_gate/);
  assert.match(migration, /BEFORE INSERT ON vendor_dispatch_jobs/);
});

test("current Dropship Beauty and Faire observations remain non-authorizing", () => {
  assert.match(
    migration,
    /'shopify_supplier_feed',[\s\S]*?'dropship-beauty',[\s\S]*?'observed',[\s\S]*?FALSE/,
  );
  assert.match(
    migration,
    /'manual',[\s\S]*?'faire',[\s\S]*?'observed',[\s\S]*?FALSE/,
  );
  assert.match(migration, /grants ZERO new dispatch authority/);
});

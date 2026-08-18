import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/010_wig_assortment_candidates.sql", import.meta.url),
  "utf8",
);

test("wig candidates stay private and non-authoritative", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS vendor_assortment_candidates/);
  assert.match(migration, /'variant_proof_required'/);
  assert.doesNotMatch(migration, /INSERT INTO vendor_product_mappings/);
  assert.doesNotMatch(migration, /INSERT INTO vendor_dispatch_jobs/);
  assert.doesNotMatch(migration, /UPDATE vendors\s+SET active\s*=\s*TRUE/i);
});

test("ready-for-mapping requires exact supplier variant evidence", () => {
  assert.match(migration, /state <> 'ready_for_exact_mapping'/);
  assert.match(migration, /supplier_product_id IS NOT NULL/);
  assert.match(migration, /supplier_variant_id IS NOT NULL/);
  assert.match(migration, /supplier_sku IS NOT NULL/);
  assert.match(migration, /jsonb_array_length\(verified_options_json\) > 0/);
  assert.match(migration, /verified_at IS NOT NULL/);
});

test("curated wig matrix covers core JBH textures without touching public UI", () => {
  for (const expected of [
    "Body Wave Front Lace Wig",
    "HD Body Wave Lace Front Wig",
    "Brazilian Body Wave U-Part Wig",
    "Deep Wave Front Lace Wig",
    "HD Deep Wave Lace Front Wig",
    "Brazilian Deep Wave U-Part Wig",
    "Straight Front Lace Wig",
    "HD Straight Lace Front Wig",
    "Brazilian Straight U-Part Wig",
    "Kinky Straight Transparent Closure Wig",
    "Brazilian Kinky Straight U-Part Wig",
    "Brazilian Loose Wave Front Lace Wig",
  ]) {
    assert.match(migration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(migration, /jussbeautifulhair-site|client\/src|Shopify product mutation/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../migrations/012_az_hair_sell_readiness.sql", import.meta.url),
  "utf8",
);

test("AZ Hair catalog evidence is recorded without activating fulfillment", () => {
  assert.match(source, /'az-hair-vietnam'/);
  assert.match(source, /'manual_wholesale'/);
  assert.match(source, /'catalog_observed'/);
  assert.match(source, /A\+\+ Double Drawn/);
  assert.match(source, /A\+\+\+ Super Double Drawn/);
  assert.match(source, /6-32 inches/);
  assert.match(source, /Natural, Light Brown, and Light Blonde/);
  assert.doesNotMatch(source, /UPDATE\s+vendors\s+SET\s+active\s*=\s*TRUE/i);
  assert.doesNotMatch(source, /INSERT INTO\s+(vendor_product_mappings|vendor_dispatch_jobs)/i);
});

test("AZ launch candidate is narrow and sell authority stays fail-closed", () => {
  assert.match(source, /"quality":"A\+\+\+ Super Double Drawn"/);
  assert.match(source, /"color":"Natural"/);
  assert.match(source, /"weight_grams":100/);
  assert.match(source, /"lengths_inches":\[14,16,18,20,22,24,26,28,30\]/);
  assert.match(source, /'evidence_needed'/);
  assert.match(source, /sell_authority BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /owner_sell_approved BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /stock_confirmed BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /moq_confirmed BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /fulfillment_sla_confirmed BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /return_policy_confirmed BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /sample_approved BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /landed_cost_confirmed BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(source, /exact_shopify_mapping_confirmed BOOLEAN NOT NULL DEFAULT FALSE/);
});

test("AZ does not inherit DSers authority", () => {
  assert.doesNotMatch(source, /'dsers'/);
  assert.doesNotMatch(source, /shopify_app_installation_gid/);
  assert.match(source, /neither sell authority nor purchase authority/);
});

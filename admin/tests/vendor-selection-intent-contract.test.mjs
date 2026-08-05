import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

const expectedVendors = new Set([
  "dropship-bundles",
  "dropship-beauty",
  "apohair",
  "5s-hair",
  "az-hair-vietnam",
  "jaipur-hair",
  "indique",
]);

const expectedProducts = new Set([
  "bundle-bodywave",
  "bundle-bonestraight",
  "bundle-deepwave",
  "bundle-loosewave",
  "bundle-kinkystraight",
  "bundle-royal-indian",
  "closure-4x4",
  "closure-5x5",
  "frontal-13x4",
  "wig-glueless-bodywave",
  "wig-13x4-straight",
  "wig-upart-deepwave",
  "wig-13x6-bob",
  "edge-control",
  "lace-melt-spray",
  "hair-oil",
]);

test("owner-selected stack covers the catalog without dispatch authority", async () => {
  const [rawIntent, catalog] = await Promise.all([
    read("data/vendor-selection-intent.json"),
    read("client/src/lib/catalog.ts"),
  ]);
  const intent = JSON.parse(rawIntent);

  assert.equal(intent.dispatchAuthority, false);
  assert.equal(intent.selectionAuthority, "owner");
  assert.equal(intent.vendors.length, 7);
  assert.deepEqual(new Set(intent.vendors.map((vendor) => vendor.code)), expectedVendors);
  assert.ok(intent.vendors.every((vendor) => vendor.state === "selected-contacted"));

  const primaryProducts = new Set(
    intent.vendors.flatMap((vendor) =>
      vendor.productAssignments
        .filter((assignment) => assignment.role === "primary")
        .map((assignment) => assignment.productId),
    ),
  );
  assert.deepEqual(primaryProducts, expectedProducts);

  for (const productId of expectedProducts) {
    assert.match(catalog, new RegExp(`id: ["']${productId}["']`));
  }
});

test("selected vendors are registered inactive and intent cannot route orders", async () => {
  const [migration, routingApi] = await Promise.all([
    read("migrations/006_selected_vendor_stack.sql"),
    read("api/admin/vendor-routing.ts"),
  ]);

  assert.match(migration, /INSERT INTO vendors \(code, display_name, fulfillment_email, active\)/);
  assert.match(migration, /FALSE\)/);
  assert.match(migration, /active = vendors\.active/);
  assert.match(migration, /vendor_selection_intents/);
  assert.match(migration, /vendor_intent_product_assignments/);
  assert.match(migration, /selected_contacted/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'provisional'/);

  assert.doesNotMatch(migration, /INSERT INTO vendor_product_mappings/i);
  assert.doesNotMatch(migration, /INSERT INTO vendor_fulfillment_groups/i);
  assert.doesNotMatch(migration, /INSERT INTO vendor_dispatch_jobs/i);
  assert.doesNotMatch(migration, /UPDATE vendors[\s\S]*active\s*=\s*TRUE/i);

  assert.match(routingApi, /active: z\.literal\(false\)\.optional\(\)/);
  assert.match(routingApi, /active: false/);
  assert.match(routingApi, /getActiveVendor\(parsed\.data\.vendorId\)/);
  assert.match(routingApi, /Vendor is not active/);
});

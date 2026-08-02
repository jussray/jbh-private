import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const EXPECTED_CODES = [
  "5s-hair",
  "apohair",
  "az-hair-vietnam",
  "dropship-beauty",
  "dropship-bundles",
  "indique",
  "jaipur-hair",
];

const PRODUCT_IDS = new Set([
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

test("uploaded vendor evidence remains a private inactive prospect quarantine", async () => {
  const [rawManifest, migration] = await Promise.all([
    readFile("data/vendor-prospects.json", "utf8"),
    readFile("migrations/004_vendor_prospects_seed.sql", "utf8"),
  ]);
  const manifest = JSON.parse(rawManifest);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.dispatchAuthority, false);
  assert.equal(manifest.prospects.length, EXPECTED_CODES.length);

  const codes = manifest.prospects.map((prospect) => prospect.code).sort();
  assert.deepEqual(codes, EXPECTED_CODES);
  assert.equal(new Set(codes).size, codes.length);

  for (const prospect of manifest.prospects) {
    assert.equal(prospect.status, "prospect");
    assert.match(prospect.contactEmail, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    assert.match(prospect.websiteUrl, /^https:\/\//);
    assert.equal(prospect.contactVerifiedAt, "2026-08-02");
    assert.ok(prospect.productCandidates.length > 0);
    for (const productId of prospect.productCandidates) {
      assert.ok(PRODUCT_IDS.has(productId), `Unknown product candidate: ${productId}`);
    }
  }

  const azHair = manifest.prospects.find((entry) => entry.code === "az-hair-vietnam");
  assert.equal(azHair.contactEmail, "sale@azhairvietnam.com");
  assert.doesNotMatch(rawManifest, /contact@azhairvietnam\.com/i);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS vendor_prospects/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'prospect'/);
  assert.match(migration, /INSERT INTO vendor_prospects/);
  assert.doesNotMatch(migration, /INSERT INTO\s+vendors\b/i);
  assert.doesNotMatch(migration, /INSERT INTO\s+vendor_product_mappings\b/i);
  assert.doesNotMatch(migration, /INSERT INTO\s+vendor_fulfillment_groups\b/i);
  assert.doesNotMatch(migration, /INSERT INTO\s+vendor_dispatch_jobs\b/i);
  assert.doesNotMatch(migration, /DELETE FROM|TRUNCATE|DROP TABLE/i);
});

test("prospect artifacts contain no credentials or live activation fields", async () => {
  const joined = `${await readFile("data/vendor-prospects.json", "utf8")}\n${await readFile(
    "migrations/004_vendor_prospects_seed.sql",
    "utf8",
  )}`;

  for (const forbidden of [
    "STRIPE_SECRET_KEY",
    "DATABASE_URL=",
    "PRIVATE_KEY",
    "API_TOKEN",
    "access_token",
    "password",
    "routingEnabled\": true",
    "dispatchAuthority\": true",
  ]) {
    assert.doesNotMatch(joined, new RegExp(forbidden, "i"));
  }
});

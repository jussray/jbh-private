import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("owner-selected vendors remain private, contacted, and dispatch-disabled", async () => {
  const [rawManifest, migration] = await Promise.all([
    readFile("data/vendor-prospects.json", "utf8"),
    readFile("migrations/004_vendor_prospects_seed.sql", "utf8"),
  ]);
  const manifest = JSON.parse(rawManifest);

  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.dispatchAuthority, false);
  assert.match(manifest.selectionDecision, /owner selected all seven vendors/i);
  assert.equal(manifest.prospects.length, EXPECTED_CODES.length);

  const codes = manifest.prospects.map((prospect) => prospect.code).sort();
  assert.deepEqual(codes, EXPECTED_CODES);
  assert.equal(new Set(codes).size, codes.length);

  for (const prospect of manifest.prospects) {
    assert.equal(prospect.status, "selected-contacted");
    assert.equal(prospect.contactedAt, "2026-08-02T22:15:00Z");
    assert.match(prospect.contactEmail, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    assert.match(prospect.websiteUrl, /^https:\/\//);
    assert.equal(prospect.contactVerifiedAt, "2026-08-02");
    assert.match(prospect.operatingRole, /primary|secondary|backup/);
    assert.ok(prospect.evidence.includes("Gmail sent receipt"));
    assert.ok(prospect.productCandidates.length > 0);
    for (const productId of prospect.productCandidates) {
      assert.ok(PRODUCT_IDS.has(productId), `Unknown product candidate: ${productId}`);
    }
  }

  const azHair = manifest.prospects.find((entry) => entry.code === "az-hair-vietnam");
  assert.equal(azHair.contactEmail, "sale@azhairvietnam.com");
  assert.doesNotMatch(rawManifest, /contact@azhairvietnam\.com/i);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS vendor_prospects/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'selected_contacted'/);
  assert.match(migration, /INSERT INTO vendor_prospects/);
  assert.match(migration, /TIMESTAMPTZ '2026-08-02 22:15:00\+00'/);
  assert.doesNotMatch(migration, /INSERT INTO\s+vendor_product_mappings\b/i);
  assert.doesNotMatch(migration, /INSERT INTO\s+vendor_fulfillment_groups\b/i);
  assert.doesNotMatch(migration, /INSERT INTO\s+vendor_dispatch_jobs\b/i);
  assert.doesNotMatch(migration, /DELETE FROM|TRUNCATE|DROP TABLE/i);
});

test("selected-vendor artifacts contain no credentials or live dispatch activation", async () => {
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
    "INSERT INTO vendor_product_mappings",
    "INSERT INTO vendor_dispatch_jobs",
  ]) {
    assert.doesNotMatch(joined, new RegExp(forbidden, "i"));
  }
});

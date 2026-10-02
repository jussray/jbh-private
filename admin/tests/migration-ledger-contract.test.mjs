import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

const migrationDir = new URL("../migrations/", import.meta.url);
const filenames = (await readdir(migrationDir))
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort();

const byNumber = new Map();
for (const filename of filenames) {
  const number = filename.slice(0, 3);
  const entries = byNumber.get(number) ?? [];
  entries.push(filename);
  byNumber.set(number, entries);
}

const historicalDuplicate010 = [
  "010_fulfillment_orchestrator_state.sql",
  "010_wig_assortment_candidates.sql",
];

test("migration ledger preserves the known historical 010 collision without creating another duplicate", () => {
  assert.deepEqual(byNumber.get("010"), historicalDuplicate010);

  for (const [number, entries] of byNumber) {
    if (number === "010") continue;
    assert.equal(
      entries.length,
      1,
      `migration number ${number} must be unique: ${entries.join(", ")}`,
    );
  }
});

test("all post-010 migrations use unique monotonically available identifiers", () => {
  const post010 = [...byNumber.entries()]
    .filter(([number]) => Number(number) >= 11)
    .sort(([left], [right]) => Number(left) - Number(right));

  for (const [number, entries] of post010) {
    assert.equal(entries.length, 1, `post-010 migration ${number} must be unique`);
  }

  assert.equal(
    filenames.includes("011_shopify_customer_contact.sql"),
    true,
    "migration 011 must remain the customer-contact compatibility migration",
  );
});

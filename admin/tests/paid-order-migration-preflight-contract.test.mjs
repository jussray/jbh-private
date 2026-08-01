import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preflight = await readFile(
  new URL("../scripts/preflight-paid-order-migration.mjs", import.meta.url),
  "utf8",
);

test("migration preflight is read-only and reports aggregate risk only", () => {
  assert.match(preflight, /to_regclass/);
  assert.match(preflight, /HAVING COUNT\(\*\) > 1/);
  assert.match(preflight, /pg_indexes/);
  assert.match(preflight, /duplicateSessionGroups/);
  assert.match(preflight, /excessDuplicateRows/);
  assert.doesNotMatch(preflight, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/);
  assert.doesNotMatch(preflight, /console\.log\([^)]*DATABASE_URL/);
  assert.doesNotMatch(preflight, /SELECT\s+stripe_session_id/i);
});

test("migration preflight fails closed when duplicate session references exist", () => {
  assert.match(preflight, /report\.duplicateSessionGroups > 0/);
  assert.match(preflight, /report\.excessDuplicateRows > 0/);
  assert.match(preflight, /process\.exit\(1\)/);
  assert.match(preflight, /operator reconciliation/);
});

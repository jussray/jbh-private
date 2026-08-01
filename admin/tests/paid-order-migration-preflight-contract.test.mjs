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

test("migration preflight publishes bounded non-sensitive result classes", () => {
  for (const result of [
    "missing-database-url",
    "orders-table-missing",
    "duplicate-session-references",
    "passed-index-present",
    "passed-index-missing",
    "query-failed",
  ]) {
    assert.match(preflight, new RegExp(`publishResult\\(\\s*\"${result}\"`));
  }
  assert.match(preflight, /appendFileSync\(process\.env\.GITHUB_OUTPUT/);
  assert.doesNotMatch(preflight, /publishResult\([^)]*databaseUrl/);
});

test("migration preflight fails closed with distinct exit codes", () => {
  assert.match(preflight, /process\.exit\(2\)/);
  assert.match(preflight, /process\.exit\(3\)/);
  assert.match(preflight, /process\.exit\(4\)/);
  assert.match(preflight, /process\.exit\(5\)/);
  assert.match(preflight, /operator reconciliation/);
});

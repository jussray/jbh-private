import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preflight = await readFile(
  new URL("../scripts/preflight-paid-order-migration.mjs", import.meta.url),
  "utf8",
);
const migrationWorkflow = await readFile(
  new URL("../../.github/workflows/apply-paid-order-migration.yml", import.meta.url),
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
  for (const directResult of [
    "missing-database-url",
    "orders-table-missing",
    "duplicate-session-references",
    "query-failed",
  ]) {
    assert.match(preflight, new RegExp(`publishResult\\(\\s*\"${directResult}\"`));
  }
  for (const passingResult of ["passed-index-present", "passed-index-missing"]) {
    assert.equal(preflight.includes(`"${passingResult}"`), true);
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

test("production migration is manual, environment-gated, and main-only", () => {
  assert.match(migrationWorkflow, /workflow_dispatch:/);
  assert.match(migrationWorkflow, /APPLY_UNIQUE_STRIPE_SESSION_INDEX/);
  assert.match(migrationWorkflow, /environment: production-payments/);
  assert.match(migrationWorkflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(migrationWorkflow, /refs\/heads\/main/);
  assert.match(migrationWorkflow, /ref: \$\{\{ env\.EXPECTED_HEAD_SHA \}\}/);
  assert.doesNotMatch(migrationWorkflow, /^\s*push:/m);
});

test("production migration fails closed before and after additive SQL", () => {
  const preflightCalls = migrationWorkflow.match(/preflight:paid-order-migration/g) ?? [];
  assert.equal(preflightCalls.length, 2);
  assert.match(migrationWorkflow, /psql "\$DATABASE_URL" --set=ON_ERROR_STOP=1/);
  assert.match(migrationWorkflow, /migrations\/002_unique_stripe_session\.sql/);
  assert.match(migrationWorkflow, /passed-index-present/);
  assert.match(migrationWorkflow, /paid-order-production-migration\/\$\{result\}/);
  assert.doesNotMatch(migrationWorkflow, /DROP\s+INDEX/i);
  assert.doesNotMatch(migrationWorkflow, /\b(?:DELETE|TRUNCATE)\b/i);
});

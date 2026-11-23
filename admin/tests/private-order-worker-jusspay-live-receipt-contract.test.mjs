import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../payment-worker/src/index.ts", import.meta.url), "utf8");
const live = readFileSync(new URL("../payment-worker/src/jusspay-live-receipt.ts", import.meta.url), "utf8");
const sandbox = readFileSync(new URL("../payment-worker/src/jusspay-sandbox-receipt.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/019_jusspay_live_receipts.sql", import.meta.url), "utf8");

test("live JussPay receipts use a separate route and isolated live tables", () => {
  assert.match(index, /pathname === "\/internal\/jusspay\/live\/paid-receipt"/);
  assert.match(live, /b\.livemode !== true/);
  assert.match(live, /jusspay_live_receipts/);
  assert.match(live, /jusspay_live_holds/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS jusspay_live_receipts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS jusspay_live_holds/);
});

test("sandbox receipt handler remains sandbox-only and unchanged", () => {
  assert.match(index, /pathname === "\/internal\/jusspay\/sandbox\/paid-receipt"/);
  assert.match(sandbox, /b\.livemode !== false/);
  assert.match(sandbox, /jusspay_sandbox_receipts/);
});

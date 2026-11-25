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

test("live receipt writes and authoritative readback stay inside serialized transactions", () => {
  assert.doesNotMatch(live, /await sql\x60/);
  assert.equal((live.match(/await sql\.transaction\(\[/g) || []).length, 2);
  assert.equal((live.match(/LOCK TABLE jusspay_live_receipts, jusspay_live_holds IN SHARE ROW EXCLUSIVE MODE/g) || []).length, 2);
  assert.equal((live.match(/isolationLevel: "ReadCommitted"/g) || []).length, 2);
  assert.equal((live.match(/SET LOCAL lock_timeout = '5s'/g) || []).length, 2);
  const hold = live.slice(live.indexOf("if (b.state !=="), live.indexOf("const [, , rows, held, existing]"));
  assert.ok(hold.indexOf("LOCK TABLE") < hold.indexOf("INSERT INTO jusspay_live_holds"));
  assert.ok(hold.indexOf("INSERT INTO jusspay_live_holds") < hold.indexOf("UPDATE jusspay_live_receipts"));
  assert.ok(hold.includes("h.event_id = ${b.eventId}"));
  assert.ok(hold.includes("h.payment_intent_id = ${b.paymentIntentId}"));
  assert.ok(hold.includes('if (holds.length !== 1)'));
  const paid = live.slice(live.indexOf("const [, , rows, held, existing]"));
  assert.ok(paid.indexOf("LOCK TABLE") < paid.indexOf("INSERT INTO jusspay_live_receipts"));
  assert.ok(paid.includes("WHERE order_id = ${b.orderId} OR event_id = ${b.eventId}"));
  assert.ok(paid.includes('held[0].order_id !== b.orderId'));
  assert.ok(paid.includes('held[0].event_id === b.eventId'));
  assert.ok(live.includes('return json({ error: "receipt_storage_unavailable" }, 503)'));
});

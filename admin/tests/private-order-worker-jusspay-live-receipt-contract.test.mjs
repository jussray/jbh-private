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

test("sandbox receipt handler retains its separate mode, route and signature boundary", () => {
  assert.match(index, /pathname === "\/internal\/jusspay\/sandbox\/paid-receipt"/);
  assert.match(sandbox, /b\.livemode !== false/);
  assert.match(sandbox, /jusspay_sandbox_receipts/);
  assert.match(sandbox, /JBH_JUSSPAY_RECEIPTS_ENABLED !== "true"/);
  assert.match(sandbox, /crypto\.subtle\.verify\(/);
});

test("live receipt writes and authoritative readback stay inside serialized transactions", () => {
  assert.doesNotMatch(live, /await sql\x60/);
  assert.equal((live.match(/await sql\.transaction\(\[/g) || []).length, 2);
  assert.equal((live.match(/LOCK TABLE jusspay_live_receipts, jusspay_live_holds IN SHARE ROW EXCLUSIVE MODE/g) || []).length, 2);
  assert.equal((live.match(/isolationLevel: "ReadCommitted"/g) || []).length, 2);
  assert.equal((live.match(/SET LOCAL lock_timeout = '5s'/g) || []).length, 2);
  const hold = live.slice(live.indexOf("if (b.state !=="), live.indexOf("const [, , rows, , held, existing]"));
  assert.ok(hold.indexOf("LOCK TABLE") < hold.indexOf("INSERT INTO jusspay_live_holds"));
  assert.ok(hold.indexOf("INSERT INTO jusspay_live_holds") < hold.indexOf("UPDATE jusspay_live_receipts"));
  assert.ok(hold.includes("h.event_id = ${b.eventId}"));
  assert.ok(hold.includes("h.payment_intent_id = ${b.paymentIntentId}"));
  assert.ok(hold.includes('if (holds.length !== 1)'));
  const paid = live.slice(live.indexOf("const [, , rows, , held, existing]"));
  assert.ok(paid.indexOf("LOCK TABLE") < paid.indexOf("INSERT INTO jusspay_live_receipts"));
  assert.ok(paid.includes("WHERE order_id = ${b.orderId} OR event_id = ${b.eventId}"));
  assert.ok(paid.includes('held[0].order_id !== b.orderId'));
  assert.ok(paid.includes('held[0].event_id === b.eventId'));
  assert.ok(live.includes('return json({ error: "receipt_storage_unavailable" }, 503)'));
});

test("live receipts require the explicit gate and HMAC verification", () => {
  assert.match(live, /JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED !== "true"/);
  assert.match(live, /JBH_JUSSPAY_RECEIPT_SECRET\.length < 32/);
  assert.match(live, /crypto\.subtle\.verify\(/);
});
test("paid evidence arriving after a matching hold is stored and read back as held", () => {
  assert.match(live, /INSERT INTO jusspay_live_receipts \(order_id, event_id, payment_intent_id, receipt_sha256, state\)/);
  assert.ok(live.includes("THEN 'hold' ELSE 'awaiting_owner_review' END"));
  assert.ok(live.includes("h.event_id = ${b.eventId} OR (h.order_id = ${b.orderId} AND h.payment_intent_id <> ${b.paymentIntentId})"));
  assert.ok(live.includes('existing.length !== 1 || existing[0].state !== "hold"'));
  assert.ok(live.includes('state: "hold", duplicate: !rows.length'));
});
test("migration postflight checks constraints on their actual public relations", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/apply-jusspay-live-receipts-migration.yml", import.meta.url), "utf8");
  for (const [relation, suffixes] of [["jusspay_live_receipts", ["pkey", "state_check", "event_id_key"]], ["jusspay_live_holds", ["pkey", "reason_check", "event_id_key"]]]) {
    for (const suffix of suffixes) assert.ok(workflow.includes("conname='" + relation + "_" + suffix + "' AND conrelid='public." + relation + "'::regclass"));
  }
});

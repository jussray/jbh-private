import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../payment-worker/src/index.ts", import.meta.url), "utf8");
const shared = readFileSync(new URL("../payment-worker/src/shared.ts", import.meta.url), "utf8");
const receipt = readFileSync(new URL("../payment-worker/src/jusspay-sandbox-receipt.ts", import.meta.url), "utf8");

test("sandbox JussPay receipt integration preserves the existing private routes", () => {
  assert.match(index, /from "\.\/release-identity"/);
  assert.match(index, /pathname === "\/version"/);
  assert.match(index, /from "\.\/vendor-adapters"/);
  assert.match(index, /pathname === "\/api\/admin\/vendor-adapters"/);
  assert.match(index, /pathname === "\/webhooks\/shopify\/orders-paid"/);
  assert.match(index, /pathname === "\/internal\/jusspay\/sandbox\/paid-receipt"/);
});

test("private JussPay receipt is sandbox-only and fail-closed", () => {
  assert.match(shared, /JBH_JUSSPAY_RECEIPTS_ENABLED\?: string/);
  assert.match(shared, /JBH_JUSSPAY_RECEIPT_SECRET\?: string/);
  assert.match(receipt, /env\.JBH_JUSSPAY_RECEIPTS_ENABLED !== "true"/);
  assert.match(receipt, /b\.livemode !== false/);
  assert.match(receipt, /crypto\.subtle\.verify\(/);
});

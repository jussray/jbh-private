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

test("live receipt migration is manual, exact-main, additive, and separately gated", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/apply-jusspay-live-receipts-migration.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /APPLY_JUSSPAY_LIVE_RECEIPTS/);
  assert.match(workflow, /refs\\/heads\\/main/);
  assert.match(workflow, /secrets\\.DATABASE_URL/);
  assert.match(workflow, /admin\\/migrations\\/019_jusspay_live_receipts\\.sql/);
  assert.match(workflow, /jusspay_live_receipts/);
  assert.match(workflow, /jusspay_live_holds/);
  assert.doesNotMatch(workflow, /wrangler deploy|JBH_LIVE_CHARGES_APPROVED/);
});

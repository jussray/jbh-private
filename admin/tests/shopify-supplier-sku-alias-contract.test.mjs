import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../payment-worker/src/shopify-physical-order-model.ts", import.meta.url),
  "utf8",
);

const approved = [
  ["BRAZ-SEW-BW-14", "bundle-bodywave", "7500"],
  ["BRAZ-SEW-BW-16", "bundle-bodywave", "8500"],
  ["BRAZ-SEW-BW-18", "bundle-bodywave", "9000"],
  ["BRAZ-SEW-BW-20", "bundle-bodywave", "10000"],
  ["BRAZ-SEW-BW-22", "bundle-bodywave", "11000"],
  ["BRAZ-SEW-BW-24", "bundle-bodywave", "12500"],
  ["BRAZ-SEW-BW-26", "bundle-bodywave", "14000"],
  ["BRAZ-SEW-DW-14", "bundle-deepwave", "8000"],
  ["BRAZ-SEW-DW-18", "bundle-deepwave", "9500"],
  ["BRAZ-SEW-DW-22", "bundle-deepwave", "11500"],
  ["BRAZ-SEW-DW-26", "bundle-deepwave", "14500"],
  ["BRAZ-SEW-LW-14", "bundle-loosewave", "8000"],
  ["BRAZ-SEW-LW-18", "bundle-loosewave", "9500"],
  ["BRAZ-SEW-LW-22", "bundle-loosewave", "11500"],
  ["BRAZ-SEW-LW-26", "bundle-loosewave", "14500"],
  ["BRAZ-SEW-KS-14", "bundle-kinkystraight", "8500"],
  ["BRAZ-SEW-KS-18", "bundle-kinkystraight", "10000"],
  ["BRAZ-SEW-KS-22", "bundle-kinkystraight", "12000"],
  ["BRAZ-SEW-KS-26", "bundle-kinkystraight", "15500"],
];

test("live supplier SKUs normalize to canonical JBH products and prices", () => {
  for (const [sku, productCode, cents] of approved) {
    const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `"${escapedSku}"\\s*:\\s*\\{[^}]*productCode:\\s*"${productCode}"[^}]*unitPriceCents:\\s*${cents}`,
    );
    assert.match(source, pattern, `${sku} must map to ${productCode} at ${cents} cents`);
  }
});

test("unapproved supplier lengths stay fail-closed", () => {
  for (const sku of [
    "BRAZ-SEW-BW-10",
    "BRAZ-SEW-BW-12",
    "BRAZ-SEW-BW-28",
    "BRAZ-SEW-DW-16",
    "BRAZ-SEW-DW-20",
    "BRAZ-SEW-LW-24",
    "BRAZ-SEW-KS-28",
  ]) {
    assert.doesNotMatch(source, new RegExp(`"${sku}"`), `${sku} must remain unsupported`);
  }
});

test("supplier aliases do not inflate routing authority", () => {
  assert.match(source, /unsupported_physical_sku/);
  assert.match(source, /shopify_line_price_mismatch/);
  assert.doesNotMatch(source, /queueFulfillmentDispatch|vendor_dispatch_jobs|supplier_order_reference/);
});

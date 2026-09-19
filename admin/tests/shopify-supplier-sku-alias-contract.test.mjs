import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../payment-worker/src/shopify-physical-order-model.ts", import.meta.url),
  "utf8",
);

const observed = [
  ["BRAZ-SEW-BW-10", "bundle-bodywave", "6000"],
  ["BRAZ-SEW-BW-12", "bundle-bodywave", "7000"],
  ["BRAZ-SEW-BW-14", "bundle-bodywave", "7500"],
  ["BRAZ-SEW-BW-16", "bundle-bodywave", "8500"],
  ["BRAZ-SEW-BW-18", "bundle-bodywave", "9000"],
  ["BRAZ-SEW-BW-20", "bundle-bodywave", "10500"],
  ["BRAZ-SEW-BW-22", "bundle-bodywave", "11500"],
  ["BRAZ-SEW-BW-24", "bundle-bodywave", "12500"],
  ["BRAZ-SEW-BW-26", "bundle-bodywave", "14500"],
  ["BRAZ-SEW-BW-28", "bundle-bodywave", "15000"],
  ["BRAZ-SEW-BW-30", "bundle-bodywave", "17000"],
  ["BRAZ-SEW-BW-32", "bundle-bodywave", "18000"],
  ["BRAZ-SEW-DW-10", "bundle-deepwave", "6500"],
  ["BRAZ-SEW-DW-12", "bundle-deepwave", "7000"],
  ["BRAZ-SEW-DW-14", "bundle-deepwave", "8000"],
  ["BRAZ-SEW-DW-16", "bundle-deepwave", "8500"],
  ["BRAZ-SEW-DW-18", "bundle-deepwave", "9500"],
  ["BRAZ-SEW-DW-20", "bundle-deepwave", "11000"],
  ["BRAZ-SEW-DW-22", "bundle-deepwave", "11500"],
  ["BRAZ-SEW-DW-24", "bundle-deepwave", "12500"],
  ["BRAZ-SEW-DW-26", "bundle-deepwave", "14500"],
  ["BRAZ-SEW-DW-28", "bundle-deepwave", "15500"],
  ["BRAZ-SEW-DW-30", "bundle-deepwave", "17000"],
  ["BRAZ-SEW-DW-32", "bundle-deepwave", "18500"],
  ["BRAZ-SEW-LW-10", "bundle-loosewave", "6500"],
  ["BRAZ-SEW-LW-12", "bundle-loosewave", "7000"],
  ["BRAZ-SEW-LW-14", "bundle-loosewave", "8000"],
  ["BRAZ-SEW-LW-16", "bundle-loosewave", "8500"],
  ["BRAZ-SEW-LW-18", "bundle-loosewave", "9500"],
  ["BRAZ-SEW-LW-20", "bundle-loosewave", "11000"],
  ["BRAZ-SEW-LW-22", "bundle-loosewave", "11500"],
  ["BRAZ-SEW-LW-24", "bundle-loosewave", "12500"],
  ["BRAZ-SEW-LW-26", "bundle-loosewave", "14500"],
  ["BRAZ-SEW-LW-28", "bundle-loosewave", "15500"],
  ["BRAZ-SEW-LW-30", "bundle-loosewave", "17000"],
  ["BRAZ-SEW-LW-32", "bundle-loosewave", "18500"],
  ["BRAZ-SEW-KS-14", "bundle-kinkystraight", "8500"],
  ["BRAZ-SEW-KS-16", "bundle-kinkystraight", "9500"],
  ["BRAZ-SEW-KS-18", "bundle-kinkystraight", "10500"],
  ["BRAZ-SEW-KS-20", "bundle-kinkystraight", "11000"],
  ["BRAZ-SEW-KS-22", "bundle-kinkystraight", "12000"],
  ["BRAZ-SEW-KS-24", "bundle-kinkystraight", "14000"],
  ["BRAZ-SEW-KS-26", "bundle-kinkystraight", "15500"],
  ["BRAZ-SEW-KS-28", "bundle-kinkystraight", "16500"],
];

test("all live supplier SKUs retain canonical JBH routing plus current continuity prices", () => {
  assert.equal(observed.length, 44);
  assert.equal(new Set(observed.map(([sku]) => sku)).size, observed.length);

  for (const [sku, productCode, cents] of observed) {
    const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `"${escapedSku}"\\s*:\\s*\\{[^}]*productCode:\\s*"${productCode}"[^}]*unitPriceCents:\\s*${cents}`,
    );
    assert.match(source, pattern, `${sku} must map to ${productCode} with the current non-authorizing reference price ${cents}`);
  }
});

test("unknown supplier variants stay fail-closed", () => {
  for (const sku of [
    "BRAZ-SEW-BW-34",
    "BRAZ-SEW-DW-34",
    "BRAZ-SEW-LW-34",
    "BRAZ-SEW-KS-30",
    "BRAZ-SEW-ST-18",
  ]) {
    assert.doesNotMatch(source, new RegExp(`"${sku}"`), `${sku} must remain unsupported`);
  }
});

test("supplier aliases do not inflate routing authority or override signed Shopify payment truth", () => {
  assert.match(source, /unsupported_physical_sku/);
  assert.match(source, /unitPriceCents: linePriceCents/);
  assert.doesNotMatch(source, /shopify_line_price_mismatch/);
  assert.doesNotMatch(source, /queueFulfillmentDispatch|vendor_dispatch_jobs|supplier_order_reference/);
});

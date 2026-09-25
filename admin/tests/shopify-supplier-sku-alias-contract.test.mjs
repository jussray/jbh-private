import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../payment-worker/src/shopify-physical-order-model.ts", import.meta.url),
  "utf8",
);

const even = (start, end) => {
  const values = [];
  for (let value = start; value <= end; value += 2) values.push(value);
  return values;
};

const lengthSkus = (prefix, lengths) => lengths.map((length) => `${prefix}-${length}`);
const dealSkus = (prefix, starts) =>
  starts.map((start) => `${prefix}-${start}-${start + 2}-${start + 4}`);

const expectedDropshipBeautySkus = [
  ...lengthSkus("BRAZ-SEW-BW", even(10, 32)),
  ...lengthSkus("BRAZ-SEW-DW", even(10, 32)),
  ...lengthSkus("BRAZ-SEW-LW", even(10, 32)),
  ...lengthSkus("BRAZ-SEW-ST", even(10, 32)),
  ...lengthSkus("BRAZ-SEW-KS", even(14, 28)),
  ...lengthSkus("BRAZ-SEW-KC", even(10, 32)),
  ...lengthSkus("BRAZ-SEW-AK", even(12, 22)),
  ...lengthSkus("BRAZ-SEW-SW", even(12, 30)),
  ...lengthSkus("613-BRAZ-SEW-BW", even(12, 26)),
  ...dealSkus("BRAZ-SEW-BW", even(10, 28)),
  ...dealSkus("BRAZ-SEW-DW", even(10, 28)),
  ...dealSkus("BRAZ-SEW-LW", even(10, 28)),
  ...dealSkus("BRAZ-SEW-ST", even(10, 28)),
  ...dealSkus("BRAZ-SEW-AK", [12, 14, 16]),
  ...lengthSkus("BRAZ-TRANS-CLO-DW", [12, 14, 16, 18]),
  ...lengthSkus("BRAZ-TRANS-CLO-ST", [12, 14, 16, 18]),
  ...lengthSkus("BRAZ-TRANS-CLO-LW", [14, 16, 18]),
  ...lengthSkus("BRAZ-TRANS-CLO-BW", [12, 14, 16, 18]),
  ...lengthSkus("BRAZ-TRANS-FRO-ST", [14, 16, 18, 20]),
  ...lengthSkus("BRAZ-TRANS-FRO-LW", [14, 16, 18, 20]),
];

test("current Dropship Beauty Shopify SKU surface is exact and duplicate-free", () => {
  assert.equal(expectedDropshipBeautySkus.length, 158);
  assert.equal(new Set(expectedDropshipBeautySkus).size, 158);

  assert.match(source, /EVEN_LENGTHS_10_32\s*=\s*\[10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32\]/);
  assert.match(source, /EVEN_LENGTHS_12_30\s*=\s*\[12, 14, 16, 18, 20, 22, 24, 26, 28, 30\]/);
  assert.match(source, /EVEN_LENGTHS_12_26\s*=\s*\[12, 14, 16, 18, 20, 22, 24, 26\]/);
  assert.match(source, /KINKY_STRAIGHT_LENGTHS\s*=\s*\[14, 16, 18, 20, 22, 24, 26, 28\]/);
  assert.match(source, /AFRO_KINKY_LENGTHS\s*=\s*\[12, 14, 16, 18, 20, 22\]/);
  assert.match(source, /DEAL_STARTS_10_28\s*=\s*\[10, 12, 14, 16, 18, 20, 22, 24, 26, 28\]/);

  for (const prefix of [
    "BRAZ-SEW-ST",
    "BRAZ-SEW-KC",
    "BRAZ-SEW-AK",
    "BRAZ-SEW-SW",
    "613-BRAZ-SEW-BW",
    "BRAZ-TRANS-CLO-DW",
    "BRAZ-TRANS-CLO-ST",
    "BRAZ-TRANS-CLO-LW",
    "BRAZ-TRANS-CLO-BW",
    "BRAZ-TRANS-FRO-ST",
    "BRAZ-TRANS-FRO-LW",
  ]) {
    assert.match(source, new RegExp(`addSupplierLengthAliases\\(\\"${prefix}\\"`));
  }

  for (const prefix of ["BRAZ-SEW-BW", "BRAZ-SEW-DW", "BRAZ-SEW-LW", "BRAZ-SEW-ST", "BRAZ-SEW-AK"]) {
    assert.match(source, new RegExp(`addSupplierDealAliases\\(\\"${prefix}\\"`));
  }
});

test("unknown supplier variants remain fail-closed", () => {
  for (const unsupportedLength of [34, 36]) {
    assert.ok(!even(10, 32).includes(unsupportedLength));
  }
  assert.ok(!even(14, 28).includes(30));
  assert.ok(!even(12, 26).includes(28));

  assert.match(source, /if \(!catalog\) \{\s*throw new ShopifyPhysicalOrderModelError\("unsupported_physical_sku"\);/s);
});

test("signed Shopify paid line price is payment truth without inflating dispatch authority", () => {
  assert.match(source, /unitPriceCents:\s*linePriceCents/);
  assert.doesNotMatch(source, /shopify_line_price_mismatch/);
  assert.doesNotMatch(source, /queueFulfillmentDispatch|vendor_dispatch_jobs|supplier_order_reference/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ASSUMPTIONS,
  VERDICT,
  buildLedger,
  netPerUnit,
  priceVariant,
  renderReport,
  wholesaleFor,
} from "../scripts/faire-wholesale-math.mjs";

const snapshot = JSON.parse(
  readFileSync(new URL("../data/faire-pricing-snapshot-2026-09-28.json", import.meta.url), "utf8"),
);
const ledger = buildLedger(snapshot);
const costed = (rows) => rows.filter((row) => row.unitCost != null);

// Every channel at the floor, including the worst marketplace case: a new
// retailer's first order at the minimum size carrying the flat fee.
function assertFloorNeverLoses(rows, a) {
  const feePerUnit = a.newRetailerFee / a.firstOrderMinUnits;
  for (const row of costed(rows)) {
    const label = `${row.handle} ${row.option}`;
    const first = netPerUnit(row.floorWholesale, row.unitCost, a.marketplaceCommission, a, feePerUnit);
    const reorder = netPerUnit(row.floorWholesale, row.unitCost, a.marketplaceCommission, a);
    const direct = netPerUnit(row.floorWholesale, row.unitCost, a.directCommission, a);
    assert.ok(first >= -1e-9, `${label} first order`);
    assert.ok(reorder >= first, `${label} reorder`);
    assert.ok(direct >= row.floorWholesale * a.targetProfitShare - 1e-9, `${label} direct`);
  }
}

test("net per unit subtracts commission, processing, cost, shipping and per-order fees", () => {
  // $40 wholesale, 15% + 3.5% fees, $27 cost -> 40 * 0.815 - 27
  assert.equal(Math.round(netPerUnit(40, 27, 0.15) * 100) / 100, 5.6);
  assert.equal(Math.round(netPerUnit(40, 27, 0) * 100) / 100, 11.6);
  assert.equal(Math.round(netPerUnit(40, 27, 0.15, ASSUMPTIONS, 10 / 3) * 100) / 100, 2.27);
  const shipped = { ...ASSUMPTIONS, shippingPerUnit: 4 };
  assert.equal(Math.round(netPerUnit(40, 27, 0.15, shipped) * 100) / 100, 1.6);
});

test("wholesaleFor leaves exactly the requested profit share after fees", () => {
  const w = wholesaleFor(27, ASSUMPTIONS.marketplaceCommission, ASSUMPTIONS.targetProfitShare, ASSUMPTIONS, 2);
  const profit = netPerUnit(w, 27, ASSUMPTIONS.marketplaceCommission, ASSUMPTIONS, 2);
  assert.ok(Math.abs(profit - w * ASSUMPTIONS.targetProfitShare) < 1e-9);
});

test("snapshot matches the Shopify capture: 30 products, 174 variants", () => {
  assert.equal(snapshot.products.length, 30);
  assert.equal(ledger.length, 174);
});

test("Faire's default 50% wholesale loses money on every costed variant today", () => {
  assert.ok(costed(ledger).length > 0);
  for (const row of costed(ledger)) assert.ok(row.netAtDefault < 0, `${row.handle} ${row.option}`);
  assert.equal(ledger.filter((row) => row.verdict === VERDICT.keystone).length, 0);
});

test("the floor never loses money on any channel, first-order fee included", () => {
  assertFloorNeverLoses(ledger, ASSUMPTIONS);
});

test("the no-loss floor holds under other fee, target, shipping and minimum settings", () => {
  const variants = [
    { targetProfitShare: 0.1 },
    { targetProfitShare: 0 },
    { marketplaceCommission: 0.25 },
    { shippingPerUnit: 6 },
    { firstOrderMinUnits: 1 },
    { firstOrderMinUnits: 12, processingFee: 0.019 },
  ];
  for (const overrides of variants) {
    const a = { ...ASSUMPTIONS, ...overrides };
    assertFloorNeverLoses(buildLedger(snapshot, a), a);
  }
});

test("the old body-wave 10-inch $34 price loses on a minimum first order; the floor does not", () => {
  const feePerUnit = ASSUMPTIONS.newRetailerFee / ASSUMPTIONS.firstOrderMinUnits;
  assert.ok(netPerUnit(34, 27, ASSUMPTIONS.marketplaceCommission, ASSUMPTIONS, feePerUnit) < 0);
  const row = ledger.find((r) => r.handle === "body-wave-human-hair-bundles" && r.option === '10"');
  assert.ok(row.floorWholesale > 34);
  assert.ok(row.netFirstOrderAtFloor >= 0);
});

test("unknown cost and service products are held, never priced", () => {
  const credit = ledger.find((row) => row.handle === "juss-hair-match-session-25-purchase-credit");
  assert.equal(credit.verdict, VERDICT.service);
  for (const row of ledger.filter((r) => r.unitCost == null && r.verdict !== VERDICT.service)) {
    assert.equal(row.verdict, VERDICT.unknown);
    assert.equal(row.floorWholesale, undefined);
  }
});

test("keystone-ready only when half of retail clears every channel", () => {
  // $100 retail / $30 cost misses: half of retail ($50) is under the $50.13
  // a minimum first order needs for the target profit.
  assert.equal(priceVariant({ retail: 100, unitCost: 30 }).verdict, VERDICT.floor);
  const ready = priceVariant({ retail: 110, unitCost: 30 });
  assert.equal(ready.verdict, VERDICT.keystone);
  assert.equal(ready.wholesale, 55);
  assert.equal(priceVariant({ retail: 37.99, unitCost: 27 }).verdict, VERDICT.loss);
});

test("report prints clean percentages and signed money", () => {
  const report = renderReport(snapshot, ledger);
  assert.match(report, /processing 3\.5% \(worst case\)/);
  assert.doesNotMatch(report, /\d\.\d{5,}%/);
  assert.doesNotMatch(report, /\$-/);
  assert.match(report, /-\$1\.48/);
});

test("CLI runs when invoked through a symlink or a path with a space", () => {
  const script = fileURLToPath(new URL("../scripts/faire-wholesale-math.mjs", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "faire math "));
  try {
    cpSync(fileURLToPath(new URL("../scripts", import.meta.url)), join(root, "scripts"), { recursive: true });
    cpSync(fileURLToPath(new URL("../data", import.meta.url)), join(root, "data"), { recursive: true });
    const spaced = execFileSync(process.execPath, [join(root, "scripts", "faire-wholesale-math.mjs")], { encoding: "utf8" });
    const link = join(root, "link.mjs");
    symlinkSync(script, link);
    const linked = execFileSync(process.execPath, [link], { encoding: "utf8" });
    for (const out of [spaced, linked]) assert.match(out, /"LIST_AT_FLOOR":\d+/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ASSUMPTIONS,
  VERDICT,
  buildLedger,
  minimumWholesale,
  netPerUnit,
  priceVariant,
} from "../scripts/faire-wholesale-math.mjs";

const snapshot = JSON.parse(
  readFileSync(new URL("../data/faire-pricing-snapshot-2026-09-28.json", import.meta.url), "utf8"),
);
const ledger = buildLedger(snapshot);
const costed = ledger.filter((row) => row.unitCost != null);

test("net per unit subtracts commission, processing, cost and shipping", () => {
  // $40 wholesale, 15% + 3.5% fees, $27 cost -> 40 * 0.815 - 27
  assert.equal(Math.round(netPerUnit(40, 27, 0.15) * 100) / 100, 5.6);
  assert.equal(Math.round(netPerUnit(40, 27, 0) * 100) / 100, 11.6);
});

test("minimum wholesale leaves exactly the target profit after fees", () => {
  const cost = 27;
  const w = minimumWholesale(cost, ASSUMPTIONS.marketplaceCommission);
  const profit = netPerUnit(w, cost, ASSUMPTIONS.marketplaceCommission);
  assert.ok(Math.abs(profit - w * ASSUMPTIONS.targetProfitShare) < 1e-9);
});

test("snapshot matches the Shopify capture: 30 products, 174 variants", () => {
  assert.equal(snapshot.products.length, 30);
  assert.equal(ledger.length, 174);
});

test("Faire's default 50% wholesale loses money on every costed variant today", () => {
  assert.ok(costed.length > 0);
  for (const row of costed) assert.ok(row.netAtDefault < 0, `${row.handle} ${row.option}`);
  assert.equal(ledger.filter((row) => row.verdict === VERDICT.keystone).length, 0);
});

test("the floor wholesale never loses money on any Faire channel", () => {
  for (const row of costed) {
    assert.ok(row.netMarketplaceAtFloor >= 0, `${row.handle} ${row.option} marketplace`);
    assert.ok(
      row.netDirectAtFloor >= row.floorWholesale * ASSUMPTIONS.targetProfitShare - 0.01,
      `${row.handle} ${row.option} direct`,
    );
  }
});

test("unknown cost and service products are held, never priced", () => {
  const credit = ledger.find((row) => row.handle === "juss-hair-match-session-25-purchase-credit");
  assert.equal(credit.verdict, VERDICT.service);
  for (const row of ledger.filter((r) => r.unitCost == null && r.verdict !== VERDICT.service)) {
    assert.equal(row.verdict, VERDICT.unknown);
    assert.equal(row.floorWholesale, undefined);
  }
});

test("a variant is keystone-ready only when half of retail clears the marketplace minimum", () => {
  const ready = priceVariant({ retail: 100, unitCost: 30 });
  assert.equal(ready.verdict, VERDICT.keystone);
  assert.equal(ready.wholesale, 50);
  assert.equal(priceVariant({ retail: 37.99, unitCost: 27 }).verdict, VERDICT.loss);
});

#!/usr/bin/env node
// Faire wholesale math for JBH: which variants make money on Faire, and at
// what wholesale price. Reads the Shopify price/cost snapshot and prints a
// per-variant ledger plus a markdown report. Pure math; no network, no writes
// to Shopify or Faire.
//
// Fee assumptions (North America, 2026) must be confirmed in the Faire brand
// dashboard before any wholesale price is set:
//   - 15% commission on Faire-sourced first orders and reorders
//   - $10 flat fee on a new retailer's first order (not modelled per unit)
//   - 0% commission on Faire Direct (retailers the brand invites)
//   - 1.9%-3.5% payment processing; the worst case (3.5%) is used
//   - shipping per unit is unknown for dropshipped goods; set SHIPPING_PER_UNIT
import { readFileSync, writeFileSync } from "node:fs";

export const ASSUMPTIONS = Object.freeze({
  marketplaceCommission: 0.15,
  directCommission: 0,
  processingFee: 0.035,
  // Profit JBH keeps per unit, as a share of the wholesale price, after fees.
  targetProfitShare: 0.15,
  // Keystone: retailers expect to sell at 2x wholesale.
  keystoneMarkup: 2,
  // Lowest retailer markup (retail / wholesale) still worth listing.
  minRetailerMarkup: 1.6,
  shippingPerUnit: 0,
});

export const VERDICT = Object.freeze({
  keystone: "KEYSTONE_READY",
  custom: "LIST_WITH_CUSTOM_WHOLESALE",
  direct: "FAIRE_DIRECT_ONLY",
  loss: "NOT_PROFITABLE_ON_FAIRE",
  unknown: "HOLD_UNKNOWN_COST",
  service: "NOT_A_WHOLESALE_PRODUCT",
});

const cents = (value) => Math.round(value * 100) / 100;
const ceilDollar = (value) => Math.ceil(value - 1e-9);

/** Net JBH keeps on one unit sold at wholesale price `w`. */
export function netPerUnit(w, cost, commission, a = ASSUMPTIONS) {
  return w * (1 - commission - a.processingFee) - cost - a.shippingPerUnit;
}

/** Lowest wholesale price that still leaves the target profit after fees. */
export function minimumWholesale(cost, commission, a = ASSUMPTIONS) {
  const keep = 1 - commission - a.processingFee - a.targetProfitShare;
  if (keep <= 0) throw new Error("fees and target profit exceed 100% of wholesale");
  return (cost + a.shippingPerUnit) / keep;
}

export function priceVariant({ retail, unitCost }, kind = "physical", a = ASSUMPTIONS) {
  if (kind !== "physical") return { verdict: VERDICT.service };
  if (unitCost == null) return { verdict: VERDICT.unknown };

  const defaultWholesale = cents(retail / a.keystoneMarkup);
  const minMarket = minimumWholesale(unitCost, a.marketplaceCommission, a);
  const minDirect = minimumWholesale(unitCost, a.directCommission, a);
  const base = {
    defaultWholesale,
    netAtDefault: cents(netPerUnit(defaultWholesale, unitCost, a.marketplaceCommission, a)),
    minMarketplaceWholesale: cents(minMarket),
    // Never list below this: Faire Direct keeps the target profit, and a
    // marketplace order at the same price does not lose money.
    floorWholesale: ceilDollar(minDirect),
    netDirectAtFloor: cents(netPerUnit(ceilDollar(minDirect), unitCost, a.directCommission, a)),
    netMarketplaceAtFloor: cents(netPerUnit(ceilDollar(minDirect), unitCost, a.marketplaceCommission, a)),
    // Retail price at which Faire's default 50% wholesale meets the target.
    keystoneRetailNeeded: cents(minMarket * a.keystoneMarkup),
  };

  if (defaultWholesale >= minMarket) {
    return { ...base, verdict: VERDICT.keystone, wholesale: defaultWholesale,
      netMarketplace: base.netAtDefault };
  }
  const custom = ceilDollar(minMarket);
  if (retail / custom >= a.minRetailerMarkup) {
    return { ...base, verdict: VERDICT.custom, wholesale: custom,
      netMarketplace: cents(netPerUnit(custom, unitCost, a.marketplaceCommission, a)),
      retailerMarkup: cents(retail / custom) };
  }
  const direct = ceilDollar(minDirect);
  if (retail / direct >= a.minRetailerMarkup) {
    // One wholesale price serves both channels: Direct hits the target,
    // a marketplace order at the same price is reported honestly.
    return { ...base, verdict: VERDICT.direct, wholesale: direct,
      netDirect: cents(netPerUnit(direct, unitCost, a.directCommission, a)),
      netMarketplace: cents(netPerUnit(direct, unitCost, a.marketplaceCommission, a)),
      retailerMarkup: cents(retail / direct) };
  }
  return { ...base, verdict: VERDICT.loss };
}

export function buildLedger(snapshot, a = ASSUMPTIONS) {
  return snapshot.products.flatMap((product) =>
    product.variants.map((variant) => ({
      handle: product.handle,
      option: variant.option,
      retail: variant.retail,
      unitCost: variant.unitCost,
      ...priceVariant(variant, product.kind, a),
    })),
  );
}

export function summarize(ledger) {
  const byVerdict = {};
  for (const row of ledger) byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) + 1;
  return byVerdict;
}

const money = (value) => (value == null ? "—" : `$${value.toFixed(2)}`);

export function renderReport(snapshot, ledger, a = ASSUMPTIONS) {
  const lines = [
    "# Faire wholesale math — JBH",
    "",
    `Source: ${snapshot.source}, captured ${snapshot.capturedAt}. Generated by \`admin/scripts/faire-wholesale-math.mjs\`.`,
    "",
    "## Formula",
    "",
    "- Net per unit = wholesale × (1 − commission − processing) − unit cost − shipping per unit",
    "- Minimum wholesale = (unit cost + shipping) ÷ (1 − commission − processing − target profit share)",
    "- Faire default wholesale = retail ÷ 2 (keystone)",
    "- Keystone retail needed = 2 × minimum marketplace wholesale",
    "- Floor wholesale = ceil(minimum Faire Direct wholesale); at the floor a marketplace order is break-even or better",
    "",
    "## Assumptions (confirm in the Faire brand dashboard)",
    "",
    `- Marketplace commission ${a.marketplaceCommission * 100}%, Faire Direct ${a.directCommission * 100}%, processing ${a.processingFee * 100}% (worst case)`,
    "- $10 new-retailer first-order fee is per order and not included per unit",
    `- Target profit ${a.targetProfitShare * 100}% of wholesale; retailer markup floor ${a.minRetailerMarkup}×; shipping per unit $${a.shippingPerUnit.toFixed(2)} (unknown for dropshipped goods)`,
    "",
    "## Summary",
    "",
    "| Verdict | Variants |",
    "|---|---|",
    ...Object.entries(summarize(ledger)).map(([verdict, count]) => `| ${verdict} | ${count} |`),
    "",
    "## Ledger",
    "",
    "| Product | Option | Retail | Cost | Faire default wholesale | Net at default | Floor wholesale | Net at floor (Direct / marketplace) | Retail needed for keystone | Verdict |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...ledger.map((r) =>
      `| ${r.handle} | ${r.option} | ${money(r.retail)} | ${money(r.unitCost)} | ${money(r.defaultWholesale)} | ${money(r.netAtDefault)} | ${money(r.floorWholesale)} | ${r.floorWholesale == null ? "—" : `${money(r.netDirectAtFloor)} / ${money(r.netMarketplaceAtFloor)}`} | ${money(r.keystoneRetailNeeded)} | ${r.verdict} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshotPath = process.argv[2] ?? new URL("../data/faire-pricing-snapshot-2026-09-28.json", import.meta.url);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const ledger = buildLedger(snapshot);
  const out = process.argv[3];
  const report = renderReport(snapshot, ledger);
  if (out) writeFileSync(out, report);
  console.log(JSON.stringify(summarize(ledger)));
}

#!/usr/bin/env node
// Faire wholesale math for JBH: which variants make money on Faire, and at
// what wholesale price. Reads the Shopify price/cost snapshot and prints a
// per-variant ledger plus a markdown report. Pure math; no network, no writes
// to Shopify or Faire.
//
// Fee assumptions (North America, 2026) must be confirmed in the Faire brand
// dashboard before any wholesale price is set:
//   - 15% commission on Faire-sourced first orders and reorders
//   - $10 flat fee on a new retailer's first order, spread over the brand's
//     first-order minimum (FIRST_ORDER_MIN_UNITS, set the same minimum in Faire)
//   - 0% commission on Faire Direct (retailers the brand invites)
//   - 1.9%-3.5% payment processing; the worst case (3.5%) is used
//   - shipping per unit is unknown for dropshipped goods; set SHIPPING_PER_UNIT
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const ASSUMPTIONS = Object.freeze({
  marketplaceCommission: 0.15,
  directCommission: 0,
  processingFee: 0.035,
  newRetailerFee: 10,
  // Smallest first order a new Faire retailer may place (set in Faire).
  firstOrderMinUnits: 3,
  // Profit JBH keeps per unit on Faire Direct, as a share of wholesale.
  targetProfitShare: 0.15,
  // Keystone: retailers expect to sell at 2x wholesale.
  keystoneMarkup: 2,
  // Lowest retailer markup (retail / wholesale) still worth listing.
  minRetailerMarkup: 1.6,
  shippingPerUnit: 0,
});

export const VERDICT = Object.freeze({
  keystone: "KEYSTONE_READY",
  floor: "LIST_AT_FLOOR",
  loss: "NOT_PROFITABLE_ON_FAIRE",
  unknown: "HOLD_UNKNOWN_COST",
  service: "NOT_A_WHOLESALE_PRODUCT",
});

const cents = (value) => Math.round(value * 100) / 100;
const ceilDollar = (value) => Math.ceil(value - 1e-9);
const pct = (share) => `${Number((share * 100).toFixed(2))}%`;

/** Net JBH keeps on one unit at wholesale `w`; `perUnitFee` spreads a per-order fee. */
export function netPerUnit(w, cost, commission, a = ASSUMPTIONS, perUnitFee = 0) {
  return w * (1 - commission - a.processingFee) - cost - a.shippingPerUnit - perUnitFee;
}

/** Wholesale price at which a sale nets exactly `profitShare` of wholesale. */
export function wholesaleFor(cost, commission, profitShare, a = ASSUMPTIONS, perUnitFee = 0) {
  const keep = 1 - commission - a.processingFee - profitShare;
  if (keep <= 0) throw new Error("fees and target profit exceed 100% of wholesale");
  return (cost + a.shippingPerUnit + perUnitFee) / keep;
}

export function priceVariant({ retail, unitCost }, kind = "physical", a = ASSUMPTIONS) {
  if (kind !== "physical") return { verdict: VERDICT.service };
  if (unitCost == null) return { verdict: VERDICT.unknown };

  const firstOrderFeePerUnit = a.newRetailerFee / a.firstOrderMinUnits;
  const market = a.marketplaceCommission;
  const direct = a.directCommission;

  // Floor: the lowest whole-dollar price at which every channel is safe on its
  // own terms. Direct keeps the target profit; a marketplace first order at the
  // minimum size (the worst marketplace case) does not lose money.
  const floor = ceilDollar(Math.max(
    wholesaleFor(unitCost, direct, a.targetProfitShare, a),
    wholesaleFor(unitCost, market, 0, a, firstOrderFeePerUnit),
  ));
  // Marketplace at the target profit, including the first-order fee.
  const targetMarket = wholesaleFor(unitCost, market, a.targetProfitShare, a, firstOrderFeePerUnit);
  const defaultWholesale = cents(retail / a.keystoneMarkup);

  const base = {
    defaultWholesale,
    netAtDefault: cents(netPerUnit(defaultWholesale, unitCost, market, a)),
    floorWholesale: floor,
    netDirectAtFloor: cents(netPerUnit(floor, unitCost, direct, a)),
    netReorderAtFloor: cents(netPerUnit(floor, unitCost, market, a)),
    netFirstOrderAtFloor: cents(netPerUnit(floor, unitCost, market, a, firstOrderFeePerUnit)),
    // Retail price at which Faire's default 50% wholesale hits the target on
    // every channel, the marketplace first order included.
    keystoneRetailNeeded: cents(Math.max(floor, targetMarket) * a.keystoneMarkup),
  };

  if (defaultWholesale >= Math.max(floor, targetMarket)) {
    return { ...base, verdict: VERDICT.keystone, wholesale: defaultWholesale };
  }
  if (retail / floor >= a.minRetailerMarkup) {
    return { ...base, verdict: VERDICT.floor, wholesale: floor, retailerMarkup: cents(retail / floor) };
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

const money = (value) => (value == null ? "—" : `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`);

function founderAnswer(snapshot, ledger, a) {
  const costed = ledger.filter((r) => r.unitCost != null);
  const listable = ledger.filter((r) => r.verdict === VERDICT.floor || r.verdict === VERDICT.keystone);
  const losses = costed.map((r) => r.netAtDefault);
  const counts = summarize(ledger);
  const sensitivity = [3, 6, 10].map((units) => {
    const n = buildLedger(snapshot, { ...a, firstOrderMinUnits: units })
      .filter((r) => r.verdict === VERDICT.floor || r.verdict === VERDICT.keystone).length;
    return `| ${units} | ${n} |`;
  });
  return [
    "## Founder answer",
    "",
    `- Faire's default price (retail ÷ 2) nets between ${money(Math.min(...losses))} and ${money(Math.max(...losses))} per unit on the ${costed.length} costed variants. Never publish to Faire before setting wholesale prices.`,
    `- Setting a variant at or above its **Floor wholesale** means no Faire channel loses money: Faire Direct keeps ${pct(a.targetProfitShare)}, reorders stay positive, and a new retailer's first order at the ${a.firstOrderMinUnits}-unit minimum breaks even or better. This holds only if the Faire first-order minimum is set to ${a.firstOrderMinUnits} units or more and shipping is covered as stated below.`,
    `- **Worth listing at the floor (${listable.length}):** ${listable.map((r) => `${r.handle} ${r.option} → ${money(r.wholesale)}`).join("; ") || "none"}.`,
    `- **Not viable at current retail (${counts[VERDICT.loss] ?? 0}):** the floor leaves retailers less than ${a.minRetailerMarkup}× markup. Making them work means raising retail to the "Retail needed for keystone" column, a founder decision that also changes jussbeautifulhair.com prices.`,
    `- **Hold (${counts[VERDICT.unknown] ?? 0}):** no unit cost in Shopify. Add the cost, then rerun this script.`,
    "- **Remove from Faire:** the Hair Match Session + $25 credit is a retail consultation, not a wholesale product.",
    "",
    "Listable variants by first-order minimum:",
    "",
    "| First-order minimum (units) | Listable variants |",
    "|---|---|",
    ...sensitivity,
    "",
  ];
}

export function renderReport(snapshot, ledger, a = ASSUMPTIONS) {
  const lines = [
    "# Faire wholesale math — JBH",
    "",
    `Source: ${snapshot.source}, captured ${snapshot.capturedAt}. Generated by \`admin/scripts/faire-wholesale-math.mjs\`.`,
    "",
    ...founderAnswer(snapshot, ledger, a),
    "## Formula",
    "",
    "- Net per unit = wholesale × (1 − commission − processing) − unit cost − shipping per unit − per-order fee ÷ units",
    "- Wholesale for a profit share s = (unit cost + shipping + per-order fee ÷ units) ÷ (1 − commission − processing − s)",
    "- Floor wholesale = ceil(max(Faire Direct at the target profit, marketplace first order at break-even)); at the floor no Faire channel loses money",
    "- Faire default wholesale = retail ÷ 2 (keystone)",
    "- Keystone retail needed = 2 × max(floor, marketplace first order at the target profit)",
    "",
    "## Assumptions (confirm in the Faire brand dashboard)",
    "",
    `- Marketplace commission ${pct(a.marketplaceCommission)}, Faire Direct ${pct(a.directCommission)}, processing ${pct(a.processingFee)} (worst case)`,
    `- $${a.newRetailerFee} new-retailer fee spread over a ${a.firstOrderMinUnits}-unit first-order minimum; **set that minimum in Faire** or the floor no longer covers the fee`,
    `- Target profit ${pct(a.targetProfitShare)} of wholesale; retailer markup floor ${a.minRetailerMarkup}×`,
    `- Shipping per unit $${a.shippingPerUnit.toFixed(2)}. Unknown for dropshipped goods; if JBH pays shipping on Faire orders, rerun with SHIPPING_PER_UNIT or the floor does not cover it`,
    "",
    "## Summary",
    "",
    "| Verdict | Variants |",
    "|---|---|",
    ...Object.entries(summarize(ledger)).map(([verdict, count]) => `| ${verdict} | ${count} |`),
    "",
    "## Ledger",
    "",
    "| Product | Option | Retail | Cost | Faire default wholesale | Net at default | Floor wholesale | Net at floor: Direct / reorder / first order | Retail needed for keystone | Verdict |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...ledger.map((r) =>
      `| ${r.handle} | ${r.option} | ${money(r.retail)} | ${money(r.unitCost)} | ${money(r.defaultWholesale)} | ${money(r.netAtDefault)} | ${money(r.floorWholesale)} | ${r.floorWholesale == null ? "—" : `${money(r.netDirectAtFloor)} / ${money(r.netReorderAtFloor)} / ${money(r.netFirstOrderAtFloor)}`} | ${money(r.keystoneRetailNeeded)} | ${r.verdict} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

function assumptionsFromEnv(env = process.env) {
  const overrides = {};
  if (env.SHIPPING_PER_UNIT) overrides.shippingPerUnit = Number(env.SHIPPING_PER_UNIT);
  if (env.FIRST_ORDER_MIN_UNITS) overrides.firstOrderMinUnits = Number(env.FIRST_ORDER_MIN_UNITS);
  for (const [key, value] of Object.entries(overrides)) {
    if (!Number.isFinite(value) || value < 0 || (key === "firstOrderMinUnits" && value < 1)) {
      throw new Error(`invalid ${key}: ${value}`);
    }
  }
  return Object.freeze({ ...ASSUMPTIONS, ...overrides });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const a = assumptionsFromEnv();
  const snapshotPath = process.argv[2] ?? new URL("../data/faire-pricing-snapshot-2026-09-28.json", import.meta.url);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const ledger = buildLedger(snapshot, a);
  const out = process.argv[3];
  if (out) writeFileSync(out, renderReport(snapshot, ledger, a));
  console.log(JSON.stringify(summarize(ledger)));
}

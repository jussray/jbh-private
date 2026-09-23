# Dropship Beauty image repair — continuity receipt

- Timestamp: 2026-09-23 (UTC)
- Agent session: https://claude.ai/code/session_013zvvpW2dxmJ5UxNJyLdK3r
- Storefront repo: `jussray/jussbeautifulhair-site`, branch `claude/dropship-beauty-images-qqlu53`
  - base `a2166f686b19e082ddb5033d1e38eb62c01e4e00` → fix commit `ff55a13`
- Private repo: `jussray/jbh-private`, branch `claude/dropship-beauty-images-qqlu53`, base `3bd480437dc40ea700717d58b6112be6beeb8ad6`
- Shopify authority: `8qp1z2-az.myshopify.com` (Storefront API `2026-07`, vendor filter `JBH`) per `worker/index.ts`
- Dropship Beauty integration: none in code. The supplier lane is recorded in
  `admin/data/vendor-selection-intent.json` (`dropship-beauty` → `edge-control`,
  `lace-melt-spray`, `hair-oil`, role `primary`) and `admin/migrations/006_selected_vendor_stack.sql:105-107`.
  Its status is `selected-contacted`. Catalog, branding, and fulfillment are still unconfirmed
  (`admin/data/vendor-prospects.json`).

## Audit scope
Every storefront-visible product maps through `JBH_PRESENTATION_BY_HANDLE`
(`client/src/lib/shopifyCatalog.ts`). All 17 entries were inspected, and the three
Dropship Beauty handles were audited in detail:

| Handle | Storefront name | Prior image (Shopify Files) | Local copy | Label printed in image |
|---|---|---|---|---|
| lawless-edge-control-4-oz | Lawless Edge Control — 4 oz | `edge-control_18dc1db5-….jpg?v=1786301802` | 800×533, 26 KB | "Luxe · Edge Control Hair Gel · 4 oz" |
| lawless-lace-melt-spray | Lawless Lace Melt Spray | `lace-melt-spray_082f9766-….jpg?v=1786301882` | 800×1200, 61 KB | crest "L" · "Lace Melt Spray · 2 oz" |
| lawless-hair-oil-rosemary-mint | Lawless Hair Oil — Rosemary Mint | `hair-oil_66810ed7-….jpg?v=1786301875` | 800×1200, 74 KB | "LUXÉLUNE Hair · Rosemary Mint Hair Oil · 2 fl oz" |

The other 13 entries use bundle, wig, and closure assets from other supplier lanes and were not changed.
`kinky-curly-human-hair-bundles` already used the placeholder (commit `0045602`).

## Ledger
VERIFIED
- The storefront ignores Shopify `featuredImage`. `applyJbhPresentation` overwrites `image`
  from the allowlist, so supplier or Shopify media sync cannot be the cause.
- The three images show brand names that differ from the product names sold, and differ from each other.
- `vendor-docs/jbh_vendor_sourcing.md:127,363` says this lane ships **unbranded**
  containers and the merchant adds a 2"/2.5" circle sticker label. The images show full
  printed wrap labels instead.
- `edge-control.jpg` is landscape 800×533, the lowest-resolution asset in the set.
- The fix renders the placeholder on card, PDP, and cart rows (Playwright, desktop and mobile), and the withheld assets are never requested.
- The connected Shopify MCP store is `show-appreciation-acceptance-deication.myshopify.com`, NOT JBH.
  It holds no JBH-vendor products. No Shopify record was read from or written to JBH.

INFERRED
- The three images are staged concept or mockup renders, not photos of stocked goods.
  No provenance record exists in either repo, and the vendor sourcing doc lists hair oil
  and lace melt under other suppliers (Blanka / Alibaba), which suggests the product
  identity itself is not settled.
- The live CDN files match the local copies. The filenames match; the bytes were not compared.

UNKNOWN
- What the Shopify admin media on the three JBH products currently shows. That media drives
  Shopify-hosted checkout line-item thumbnails, which this repo does not control.
- Whether the founder personally approved these renders as representative imagery.

BLOCKED
- Live `jussbeautifulhair.com`, `cdn.shopify.com`, `8qp1z2-az.myshopify.com`, and
  `hello.dropshipbeauty.app`: the agent environment's egress policy returns 403, so no live Playwright run was possible.
- JBH Shopify admin: no connector to shop `8qp1z2-az`.
- Deploy: a merge to `main` requires exact founder approval (repo policy `20088f8`).

## Root cause
The presentation allowlist bound concept imagery with mismatched brand text to three
live products. No approval or provenance gate existed for per-handle image assets.

## Changes
- `client/src/lib/shopifyCatalog.ts`: `image: ""` for the three handles.
- `tests/shopify-brand-firewall.test.mjs`: new guard (fails on base, passes on fix). The three
  handles were removed from the "approved assets" table.
- `scripts/beauty-essentials-image-playwright.mjs`: browser proof harness.
- `artifacts/beauty-essentials-images/`: 10 screenshots and `evidence.json`.
- `reports/catalog/beauty-essentials-image-repair-20260923.md`: supplier-neutral public receipt.
- Shopify records changed: **none**.

## Tests and commands
```
node --test tests/shopify-brand-firewall.test.mjs   # 6/6 pass; new test fails on base source
npm run lint                                        # tsc + storefront lint pass
npm test                                            # 90/91; #17 "browser history is authoritative…" fails identically on base a2166f6
node scripts/beauty-essentials-image-playwright.mjs # needs `npm i --no-save playwright` (repo does not pin it)
```
The Playwright run was local: Vite dev server with `/api/shopify/catalog` mocked in the Worker
payload shape and off-host requests aborted. It is not live proof.

## Remaining risks
- Three essentials now show "Product image updating", which likely lowers conversion on those SKUs.
- Shopify checkout thumbnails may still show whatever media is attached in Shopify admin.
- A cart built in the same browser tab before deploy keeps the old image until the item is re-added (sessionStorage).
- `shared/catalog.ts` (legacy, rollback-only static catalog) still references `img("edge-control")` etc. It is not rendered on customer surfaces (guarded by `shopify-physical-contract.test.mjs`).

## Rollback
`git revert ff55a13` on the site repo restores the three prior CDN URLs. No data was deleted,
and the Shopify Files and `client/public/products/*.jpg` remain.

## Next founder gate
Decide the imagery for the three essentials. The options are: (a) approve the placeholder and merge
the site branch, or (b) supply real photos of the sticker-labelled products (or explicitly
authorize the existing renders as representative), then restore `image` and update the guard test.
After merge, run a live Playwright check once the environment allows `jussbeautifulhair.com`.

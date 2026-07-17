# 🔒 Juss Beautiful Hair — PRIVATE

**Owner:** Raylene | jussbeautifulhair.com  
⛔ **Keep this repository private.** It contains vendor sourcing, owner controls, order operations, and private business strategy.

## Security boundary

This repository has two deliberately separate execution zones:

1. `admin/` is the owner-only local control layer. Its UI, vault, vendor data, routing rules, fulfillment handoffs, and private documents must never be hosted.
2. `admin/payment-worker/` is the only cloud-deployable directory. It is an API-only Cloudflare Worker for Checkout, signed Stripe webhooks, and an Access-protected paid-order export. It must never bundle the owner UI or vendor material.

Controls:

- generic `npm run deploy` intentionally fails;
- Vite development and preview bind only to `127.0.0.1`;
- the private owner build contains only `admin.html` and writes to `dist/private-local-only`;
- `workers_dev` and Worker Preview URLs are disabled for the isolated payment Worker;
- no Vercel API or deployment manifest is allowed;
- GitHub Actions fails if another deployment manifest, automated deploy action, client-bundled admin password, unbounded import, missing vendor decision, overbroad vendor handoff, or payment-worker boundary violation is introduced.

## Structure

| Folder | Contents |
|---|---|
| `admin/client/` | Owner-only loopback order controls, vendor management, deterministic routing, and private operational UI. |
| `admin/payment-worker/` | Isolated API-only Cloudflare Checkout, signed webhook, replay protection, and Access-protected paid-order export. |
| `admin/migrations/` | Private database migrations for order and webhook reliability. |
| `vendor-docs/` | Private vendor sourcing documents, product intake material, factory research, and outreach scripts. |
| `brand/` | Private launch planning, execution material, audits, strategy, and brand assets. |

## Owner workflow

The local admin decides which approved vendor should fulfill every item. Product routing rules map private product/variant patterns to a vendor, vendor SKU, unit cost, priority, and verification date. An order shows one vendor, a split order, or an explicit vendor-needed warning.

Vendor handoff text is generated separately for each vendor. It excludes customer totals, payment links, internal notes, margins, and other vendors. Phone and email are included only when that vendor is marked as requiring them.

Paid website orders are not fetched directly into the local browser. The owner authenticates to the Access-protected export endpoint, downloads the bounded JSON file, and imports it locally. The importer ignores vendor assignments and costs from the file, blocks malformed or oversized data, skips duplicates, and re-runs routing against the private local vendor rules.

## Public storefront

Build and deploy customer-facing assets only from `jussbeautifulhair-site`.

Never copy the following into the public repository or a public build:

- the local admin or private owner vault;
- vendor documents, identities, sourcing, costs, routes, or handoff records;
- customer/order exports;
- environment files or owner-access configuration;
- private strategy or proprietary operational records.

## Run the owner admin locally

```bash
cd admin
npm ci
npm run quality
npm run dev:owner
# Vite opens http://127.0.0.1:5173/admin.html
```

Do not use `--host 0.0.0.0`, a tunnel, a temporary Worker, a Preview URL, or a cloud deployment service for the owner UI.

## Payment Worker

Read `admin/payment-worker/README.md` before any migration or deployment. The Worker must stay API-only, use an approved custom hostname, keep previews disabled, validate Stripe signatures against the unmodified raw body, use durable replay receipts, reconcile exact amount/currency/session values, and validate Cloudflare Access JWTs for owner exports.

The payment Worker is the only deployable exception in this repository. Generic deployment remains blocked so the local owner UI and private documents cannot be published by mistake.

No repository change authorizes production credentials, database migration, custom-domain attachment, Stripe endpoint activation, public storefront cutover, refunds, vendor contact, or autonomous purchasing.

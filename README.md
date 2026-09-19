# 🔒 Juss Beautiful Hair — PRIVATE

⛔ **DO NOT make this repo public.** It contains private admin, order, procurement, vendor, sourcing, and brand-control material.

## Repository authority

The canonical JBH split is:

- Public storefront, Shopify catalog/cart bridge, and customer checkout entry: `jussray/jussbeautifulhair-site`.
- Private paid-order intake, customer/order persistence, procurement, vendor routing, sourcing, and owner controls: `jussray/jbh-private`.

The shared machine-readable contract is `.control-room/commerce-seam.json` with ID `jbh-shopify-private-orders@v1`.

That contract binds both repositories to:

```text
Shopify shop: 8qp1z2-az.myshopify.com
public vendor boundary: JBH
public catalog route: /api/shopify/catalog
public cart route: /api/shopify/cart
Shopify paid topic: orders/paid
private paid webhook: /webhooks/shopify/orders-paid
private Worker service: jbh-private-payment-control
```

Run `npm run verify:commerce-seam` from the repository root to fail closed if the private implementation drifts from this contract.

## Structure

| Folder | Contents |
|---|---|
| `admin/` | Private admin source, order/customer persistence, migrations, and owner controls. |
| `admin/payment-worker/` | API-only private order Worker, signed Stripe rollback intake, signed Shopify paid-order intake, procurement queue, and owner APIs. |
| `vendor-docs/` | Vendor sourcing master material, product intake data, factory research, and outreach assets. |
| `brand/` | Launch plan, execution kit, audits, strategy, and brand assets. |
| `automation/` | Private automation definitions and contracts. |

## Public deployment boundary

The customer-facing storefront must deploy from `jussray/jussbeautifulhair-site`, not from this repository.

This private repository must never become a second public storefront authority and must never publish vendor/customer/order data into the public build.

## Private paid-order Worker

The root `wrangler.toml` identifies the API-only Worker as `jbh-private-payment-control`, with `workers_dev = false` and Preview URLs disabled. No custom production hostname is committed in source.

The Worker exposes:

- `/health` for private service identity;
- `/webhooks/shopify/orders-paid` for signed Shopify `orders/paid` intake;
- `/api/stripe/webhook` only for the retained legacy Stripe rollback path;
- `/api/admin/*` for owner-only operational controls protected by Cloudflare Access.

Shopify paid-order intake requires provider-held `SHOPIFY_WEBHOOK_SECRET`, the canonical `SHOPIFY_SHOP_DOMAIN`, and the intended private `DATABASE_URL`. Those values must never be committed or placed in browser/Vite variables.

## Production truth boundary

A merged private Worker implementation is **not** proof that Shopify is delivering paid orders here.

Calling the public/private seam active requires external provider evidence that:

1. one approved custom hostname is attached to `jbh-private-payment-control`;
2. `/health` returns the expected service identity on that hostname;
3. `SHOPIFY_SHOP_DOMAIN` matches `8qp1z2-az.myshopify.com` and the webhook secret is installed outside source;
4. Shopify has an `orders/paid` subscription targeting the exact private `/webhooks/shopify/orders-paid` endpoint;
5. the read-only Shopify physical-order schema preflight passes against the intended private database, proving the required migration-008 tables, critical types, idempotency constraints, and order CHECK constraints are present at runtime;
6. a signed synthetic paid-order delivery is accepted once, duplicate delivery is idempotent, and invalid signature/shop/topic cases fail closed.

Do not infer any of those facts from a successful merge, a migration filename, a provider badge, a repository secret name, or a deployment config file.

## Local verification

```bash
npm install
npm run verify:commerce-seam
npm run verify:worker

cd admin
npm install
npm run check
npm run build
```

If GitHub Actions cannot provision jobs, classify that separately as infrastructure evidence. Do not call zero-job/startup failure a code pass.

## Backup purpose

This repo is the private recovery source for JBH owner operations. If a local environment is lost, re-clone from here and re-establish provider-held runtime configuration through the approved deployment gates. Never restore production secrets from source because they do not belong here.
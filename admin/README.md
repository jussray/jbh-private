# Juss Beautiful Hair — Private Control Layer

This directory is the private owner-control source for Juss Beautiful Hair. It contains admin, paid-order, procurement, database, and vendor-routing code and must not be used as the public storefront deployment source.

## Repository boundary

- Public storefront and Cloudflare Shopify catalog/cart bridge: `jussray/jussbeautifulhair-site`.
- Private owner/admin source, paid-order intake, database code, migrations, procurement, and vendor material: `jussray/jbh-private`.
- Shared commerce contract: `jbh-shopify-private-orders@v1` in `.control-room/commerce-seam.json`.
- Never copy `vendor-docs/`, admin pages, database exports, `.env` files, customer/order records, supplier details, or private build artifacts into the public repository.

The storefront router intentionally does not register private admin routes. Browser admin code is not an internet authentication boundary. Do not use a `VITE_*` variable for an admin password or secret because Vite variables are bundled into browser JavaScript.

## Current Shopify physical-order seam

The active public physical checkout is Shopify-backed.

```text
canonical shop domain: 8qp1z2-az.myshopify.com
paid topic: orders/paid
private webhook path: /webhooks/shopify/orders-paid
private Worker service: jbh-private
initial physical procurement state: procurement_needed
```

The public storefront reads/sends only public Shopify commerce data. After Shopify creates a paid order, the private Worker is responsible for signed paid-order intake and private procurement state.

The private handler:

- accepts only `POST` on `/webhooks/shopify/orders-paid`;
- requires the exact `orders/paid` topic;
- requires the exact configured canonical Shopify shop domain;
- verifies `X-Shopify-Hmac-SHA256` against the unmodified raw request body;
- validates bounded payloads and supported physical SKUs while treating signed Shopify paid-order line prices as payment truth;
- accepts a genuine Shopify email or phone contact and fails closed if both are absent;
- rejects mixed/unsupported carts fail-closed;
- deduplicates by Shopify webhook ID and order identity with NULL-safe contact comparison;
- stores private order/customer/shipping/item evidence in Neon;
- initializes physical orders as `procurement_needed`;
- records bounded failure codes without logging customer payloads.

Service-only Hair Match orders are not treated as physical procurement orders.

## Owner-only API protection

All `/api/admin/*` routes require a valid Cloudflare Access assertion and fail closed when Access is not configured.

Configure these values only in the server/runtime environment:

| Variable | Purpose |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team slug or full team URL |
| `CF_ACCESS_AUD` | Audience tag for the JBH admin Access application |
| `CF_ACCESS_ALLOWED_EMAILS` | Comma-separated owner email allowlist |
| `DATABASE_URL` | Private order database connection |
| `SHOPIFY_SHOP_DOMAIN` | Canonical Shopify shop identity, expected to be `8qp1z2-az.myshopify.com` |
| `SHOPIFY_WEBHOOK_SECRET` | Signing secret for the exact Shopify paid-order webhook endpoint |
| `STRIPE_SECRET_KEY` | Legacy rollback Stripe server key |
| `STRIPE_WEBHOOK_SECRET` | Legacy rollback Stripe webhook signing secret |
| `WORKER_HOST` | Exact approved custom hostname for the private API Worker |

Do not place any of these values in source code, screenshots, issues, logs, frontend environment variables, or vendor documents.

## Cloudflare Access policy

The Access application protecting owner APIs should:

1. cover the private admin hostname and `/api/admin/*` routes;
2. allow only the owner identity;
3. require MFA through the identity provider;
4. use a short session duration appropriate for an admin console;
5. deny all other identities by default.

Provider webhooks must not be placed behind an interactive Cloudflare Access login. Shopify and Stripe webhook routes authenticate signed raw request bodies instead.

## Production activation truth

Code presence is not production proof. Before calling the Shopify paid-order seam active, separately verify:

1. `jbh-private` is deployed on one approved custom hostname;
2. `/health` returns `jbh-private-order-control` on that hostname;
3. `SHOPIFY_SHOP_DOMAIN` and `SHOPIFY_WEBHOOK_SECRET` are installed in that runtime without exposing values;
4. Shopify has an `orders/paid` webhook subscription targeting the exact `/webhooks/shopify/orders-paid` URL on that host;
5. the read-only Shopify physical-order schema preflight passes against the intended database, proving the required tables, critical types, idempotency constraints, order CHECK constraints, and customer email-or-phone invariant exist at runtime;
6. a signed synthetic paid-order event produces exactly one expected private order receipt;
7. replaying the same webhook is idempotent;
8. invalid signature, wrong shop, wrong topic, unsupported SKU, and impossible signed-price/subtotal cases fail closed.

A merge, migration filename, config file, secret name, or deployment badge alone is not enough.

## Legacy Stripe reliability

The Stripe webhook path remains a reversible rollback surface. Its handler verifies `Stripe-Signature`, rejects oversized payloads, reconciles the stored session/amount/currency, protects against duplicate events, and keeps customer payloads out of logs.

Do not re-promote Stripe as the active physical checkout without a separate rollback/cutover decision and matching public storefront change.

## Local admin precautions

The local admin tool can display private order details. Use it only on a dedicated, password-protected device and browser account.

- Do not run it on a public or shared computer.
- Do not publish exported order files.
- Remove old exports when they are no longer needed under the approved retention policy.
- Keep device encryption and automatic screen locking enabled.
- Treat browser storage and exports as customer data.

## Local development and verification

From the repository root:

```bash
npm install
npm run verify:commerce-seam
npm run verify:worker
```

For the private admin:

```bash
cd admin
npm install
npm run check
npm run build
npm run dev
```

The public site must deploy only from `jussbeautifulhair-site`. This private repository is the private control source, not the public storefront build source.

## License

Private and proprietary. Do not redistribute source code, vendor material, customer information, branding, product assets, credentials, or operational records.

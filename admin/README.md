# Juss Beautiful Hair — Private Owner Control

This directory is the owner-only recovery and operations source for Juss Beautiful Hair. It contains private vendor routing, order-management code, database/migration references, and operational material. It is not a Cloudflare, Vercel, Pages, Workers, or preview deployment source.

## System boundary

- Public storefront, product catalog, Stripe Checkout creation, and Stripe webhook runtime: `jussbeautifulhair-site`
- Private owner vendor/order controls and proprietary records: `jbh-private`
- Never copy the owner entry, vendor documents, local vault exports, environment files, sourcing data, vendor pricing, or private build artifacts into the public repository.

The public storefront router does not register `Admin.tsx`. The owner dashboard has its own `admin.html` entry and the private build contains only that entry.

## Run the owner control locally

```bash
cd admin
npm install
npm run dev:owner
```

Use the loopback address opened by Vite. The UI refuses non-loopback hosts. Development and preview bind to `127.0.0.1`, and the deployment scripts intentionally fail.

The owner-open screen is not an internet authentication system. The security boundary is the owner-controlled device and operating-system account. Use a dedicated browser profile, disk encryption, automatic screen locking, and a non-shared device.

## Vendor decision workflow

The local owner dashboard is designed to answer one operational question clearly: **which approved vendor should fulfill each item?**

1. Add an approved vendor with a private label, ordering method, lead time, shipping estimate, service scores, and the minimum customer fields that vendor truly requires.
2. Add product routing rules with product/variant match text, vendor, vendor SKU, unit cost, priority, and last-verified date.
3. Log or edit an order. The dashboard deterministically selects the highest-priority active matching rule unless the owner manually overrides the vendor.
4. Open the order. The fulfillment decision shows one vendor, a split order, or an explicit “vendor needed” block.
5. Copy the vendor-specific handoff. It excludes customer totals, Stripe links, internal notes, margins, and every other vendor. Phone and email are included only when the assigned vendor is marked as requiring them.
6. Track each vendor group through ready, ordered, confirmed, and shipped.

No vendor discovery, supplier contact, autonomous purchasing, or automatic external order submission occurs. The owner remains the decision-maker and places each vendor order.

## Local data and exports

The dashboard stores a versioned owner vault in the current browser profile and migrates legacy local orders when possible. Imports are size-bounded and sanitized before replacing local data.

Treat browser storage and every export as sensitive business and customer data:

- do not run on public or shared computers;
- do not upload exports to issues, pull requests, chat prompts, public drives, or deployment artifacts;
- keep exports only in an encrypted owner-controlled location;
- remove stale copies when no longer needed;
- never use real records in Playwright, MCP, model, or CI fixtures.

## Payment runtime boundary

Private repository visibility is not permission to expose payment or customer data. Runtime secrets remain server-side only in the deployable public/payment system:

- `[STRIPE_SERVER_KEY]`
- `[STRIPE_WEBHOOK_SIGNING_SECRET]`
- `[PRIVATE_DATABASE_URL]`
- `[CLOUDFLARE_ACCESS_CONFIGURATION]`

Never place server secrets in Vite variables, source code, screenshots, logs, issues, pull requests, vendor documents, or browser storage. Checkout must remain server-authoritative for price, shipping, currency, and product validation. Webhook processing must verify the unmodified raw body, enforce idempotency, return failures for retry, and avoid logging raw events or private records.

The Stripe webhook must not be placed behind interactive Cloudflare Access. Any future remote owner API must be separately protected with owner-only identity, MFA, deny-by-default policy, and short sessions. This private repository itself remains non-deployable.

## Verification

```bash
npm ci
npm run security:owner-admin
npm run check
npm run build
node ../scripts/verify-private-deployment-boundary.mjs
```

The checks fail when the owner entry loses its loopback restriction, a client-bundled admin password returns, vendor handoffs expand beyond required fulfillment data, imports lose their hard limit, or a cloud deployment path is introduced.

## License

Private and proprietary. Do not redistribute source code, vendor material, customer information, pricing, sourcing documents, branding, or product assets.

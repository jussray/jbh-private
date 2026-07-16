# Juss Beautiful Hair — Private Owner Control

This directory contains two intentionally separated systems:

- `client/` is the owner-only loopback UI, local vault, vendor management, routing, and fulfillment workflow. It must never be hosted.
- `payment-worker/` is the isolated API-only Cloudflare Worker for Stripe Checkout, signed webhooks, durable replay receipts, and an Access-protected paid-order export.

No vendor document, local vault, private route/cost record, or owner UI module may enter the payment Worker bundle.

## Run the owner control locally

```bash
cd admin
npm ci
npm run quality
npm run dev:owner
```

Use the loopback address opened by Vite. The UI refuses non-loopback hosts. Development and preview bind to `127.0.0.1`; generic deployment commands intentionally fail.

The owner-open screen is not internet authentication. The security boundary is the owner-controlled device and operating-system account. Use a dedicated browser profile, disk encryption, automatic screen locking, and a non-shared device.

## Paid website order intake

Paid orders remain in the private online-order ledger until the owner imports them:

1. authenticate to the Cloudflare Access-protected `/api/admin/orders/export` endpoint;
2. download the JSON export to an encrypted owner-controlled location;
3. open the loopback admin and choose **Import paid orders**;
4. the importer validates the export type/version, enforces a 2 MB and 5,000-order limit, recomputes totals, ignores any vendor assignment or cost fields, skips duplicate IDs, and re-runs local vendor routing;
5. delete stale export copies after the controlled import and backup process.

Do not fetch the remote order API directly from the local browser, store service credentials in the browser, or bypass Access with a long-lived token.

## Vendor decision workflow

The local owner dashboard answers one operational question: **which approved vendor should fulfill each item?**

1. Add an approved vendor with a private label, ordering method, lead time, shipping estimate, service scores, and the minimum customer fields that vendor truly requires.
2. Add product routing rules with product/variant match text, vendor, vendor SKU, unit cost, priority, and last-verified date.
3. Log, edit, or import an order. The dashboard deterministically selects the highest-priority active matching rule unless the owner manually overrides it.
4. Open the order. The fulfillment decision shows one vendor, a split order, or an explicit vendor-needed block.
5. Copy the vendor-specific handoff. It excludes customer totals, payment links, internal notes, margins, and every other vendor. Phone and email appear only when the assigned vendor requires them.
6. Track each vendor group through ready, ordered, confirmed, and shipped.

No vendor discovery, supplier contact, autonomous purchasing, or automatic external order submission occurs. The owner remains the decision-maker.

## Local data and exports

The dashboard stores a versioned owner vault in the current browser profile and migrates legacy local orders when possible. Imports are size-bounded and sanitized.

Treat browser storage and every export as sensitive business and customer data:

- do not run on public or shared computers;
- do not upload exports to issues, pull requests, chat prompts, public drives, or deployment artifacts;
- keep exports only in an encrypted owner-controlled location;
- remove stale copies when no longer needed;
- never use real records in Playwright, MCP, model, or CI fixtures.

## Payment runtime boundary

Runtime values remain server-side in encrypted Cloudflare configuration:

```text
<DATABASE_URL>
<STRIPE_SECRET_KEY>
<STRIPE_WEBHOOK_SECRET>
<STORE_ORIGIN>
<WORKER_HOST>
<CF_ACCESS_TEAM_DOMAIN>
<CF_ACCESS_AUD>
<CF_ACCESS_ALLOWED_EMAILS>
```

Never place values in Vite variables, source, screenshots, logs, issues, pull requests, documents, browser storage, or test fixtures.

Checkout remains server-authoritative for catalog, price, shipping, currency, quantity, and origin. Stripe Session creation uses an idempotency key. Webhook processing verifies the unmodified raw body, uses a leased replay receipt, returns non-2xx for retryable failures, verifies the private checkout reference, Session ID, paid state, currency, and exact total, and does not log payloads or customer fields.

The Stripe webhook is not placed behind interactive Cloudflare Access. The paid-order export is separately protected with a verified Access JWT, audience check, owner email allowlist, MFA policy, deny-by-default rules, and no-store responses.

Read `payment-worker/README.md` before any migration or deployment.

## Verification

```bash
npm ci
npm run quality
node ../scripts/verify-private-deployment-boundary.mjs
```

The checks fail when the owner entry loses loopback restriction, a client-bundled password returns, vendor handoffs expand beyond required fulfillment data, imports lose hard limits, obsolete Vercel APIs return, another deployment manifest appears, Preview URLs are enabled, or payment controls are removed.

## License

Private and proprietary. Do not redistribute source code, vendor material, customer information, pricing, sourcing documents, branding, or product assets.

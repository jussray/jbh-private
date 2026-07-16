# JBH private payment control Worker

This directory is the only cloud-deployable code in `jbh-private`.

It is an API-only Cloudflare Worker for:

- `POST /api/checkout` — server-authoritative Stripe Checkout Session creation;
- `POST /api/stripe/webhook` — raw-body Stripe signature verification, replay leasing, and paid-order recording;
- `GET /api/admin/orders/export` — Cloudflare Access-protected paid-order export for manual import into the loopback owner admin.

It must never serve or import the owner UI, private vault, vendor records, vendor documents, sourcing files, pricing files, or brand strategy.

## Required runtime bindings

Store values only as encrypted Cloudflare Worker secrets or protected runtime configuration. Never commit values or print them.

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

`<STORE_ORIGIN>` must be the exact HTTPS storefront origin. `<WORKER_HOST>` must be the exact custom hostname assigned to this Worker, without a scheme or path.

## Required platform controls

- Keep `workers_dev = false` and `preview_urls = false` in `wrangler.toml`.
- Do not add static assets or Pages output.
- Attach only an approved custom hostname after review.
- Put Cloudflare Access in front of `/api/admin/*` and require the owner identity with MFA.
- Do not put Access in front of `/api/stripe/webhook`; Stripe must reach it. Signature verification is the webhook authentication boundary.
- Apply a Cloudflare rate-limiting rule to `/api/checkout` and a tighter method/path allow rule to the webhook.
- Disable caching for every API path.
- Keep logs free of request bodies, customer fields, order exports, credentials, and vendor data.

## Stripe contract

The Worker is pinned to Stripe API version `2025-02-24.acacia` because the installed Stripe SDK and webhook object handling are built for that release. Configure the Stripe webhook endpoint to the same API version before enabling it.

Enable only:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
```

The webhook reads shipping information from `collected_information.shipping_details`, verifies the raw request body, confirms the private checkout reference, Stripe Session ID, paid status, currency, and exact total, then writes the paid order. Promotion codes remain disabled until discounts are represented in the private ledger and verified during webhook reconciliation.

## Safe deployment gate

Use placeholders in notes and terminals. Never paste values into issues, pull requests, chat, or logs.

```bash
cd admin
npm ci
npm run quality

<PRIVATE_DATABASE_MIGRATION_COMMAND> migrations/add_online_orders.sql

npm exec --yes wrangler@<PINNED_REVIEWED_VERSION> -- \
  --config payment-worker/wrangler.toml deploy
```

After the code upload, set each required secret through the Cloudflare secret interface, attach the reviewed custom hostname, configure Access for `/api/admin/*`, and create a Stripe test-mode endpoint at:

```text
https://<WORKER_HOST>/api/stripe/webhook
```

Do not switch the public storefront to this backend until all of these pass:

1. invalid-origin checkout is rejected;
2. unknown product, variant, quantity, and oversized payload tests are rejected;
3. the same checkout-attempt UUID returns one Stripe Session;
4. a valid signed test event creates one paid order;
5. the same event replay does not duplicate the order;
6. concurrent delivery leaves one completed receipt;
7. invalid signatures and amount/session mismatches remain non-2xx;
8. the Access export is denied without a valid assertion and owner allowlist;
9. the downloaded export imports into the loopback admin and re-runs private vendor routing;
10. logs contain no request bodies, customer fields, secrets, order exports, or vendor information.

Rollback is: stop storefront handoff, disable the new Stripe endpoint, detach the custom hostname, and revert the Worker version. Preserve failed webhook receipts for controlled replay; do not delete records to hide failures.

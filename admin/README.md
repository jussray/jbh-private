# Juss Beautiful Hair — Private Control Layer

This directory is the private backup and owner-control source for Juss Beautiful Hair. It contains admin and order-management code and must not be used as the public Cloudflare deployment source.

## Repository boundary

- Public storefront and Cloudflare checkout Worker: `jussbeautifulhair-site`
- Private owner/admin source, database code, migrations, and vendor material: `jbh-private`
- Never copy `vendor-docs/`, admin pages, database exports, `.env` files, or private build artifacts into the public repository.

The storefront router intentionally does not register `client/src/pages/Admin.tsx`. The local browser admin is a convenience tool, not an internet authentication boundary. Do not deploy it and do not use a `VITE_*` variable for an admin password because Vite variables are bundled into browser JavaScript.

## Owner-only API protection

All `/api/admin/*` routes require a valid Cloudflare Access assertion and fail closed when Access is not configured.

Configure these values only in the server/runtime environment:

| Variable | Purpose |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team slug or full team URL |
| `CF_ACCESS_AUD` | Audience tag for the JBH admin Access application |
| `CF_ACCESS_ALLOWED_EMAILS` | Comma-separated owner email allowlist |
| `DATABASE_URL` | Private order database connection |
| `STRIPE_SECRET_KEY` | Stripe server key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the exact production webhook endpoint |
| `PUBLIC_URL` | Canonical public storefront origin |

Do not place any of these values in source code, screenshots, issues, logs, frontend environment variables, or vendor documents.

## Cloudflare Access policy

The Access application protecting the owner API should:

1. Cover the private admin hostname and `/api/admin/*` routes.
2. Allow only the owner identity.
3. Require MFA through the identity provider.
4. Use a short session duration appropriate for an admin console.
5. Deny all other identities by default.

The Stripe webhook route must not be placed behind Cloudflare Access because Stripe cannot complete an interactive Access login. It is authenticated with Stripe's signed raw request body instead.

## Stripe webhook reliability

Before enabling the production webhook, apply:

```bash
psql "$DATABASE_URL" -f migrations/add_idempotency_and_dead_letter.sql
```

The webhook handler:

- verifies `Stripe-Signature` against the unmodified raw body;
- rejects oversized payloads;
- checks the Stripe session against the stored order, expected amount, currency, and session ID;
- records processed event IDs for idempotency;
- returns an error when processing fails so Stripe retries;
- writes only bounded non-sensitive failure codes to the dead-letter table;
- does not log customer names, addresses, emails, phone numbers, vendor data, credentials, or raw event payloads.

## Checkout trust boundary

Checkout requests may supply only product ID, selected variant, and quantity. Product names, images, prices, shipping, and totals are resolved from the server-side catalog. Never restore client-authoritative pricing.

## Local admin precautions

The local admin tool stores order details in the browser profile. Use it only on a dedicated, password-protected device and browser account.

- Do not run it on a public or shared computer.
- Do not publish exported order files.
- Remove old exports when they are no longer needed.
- Keep device encryption and automatic screen locking enabled.
- Treat browser storage and exports as customer data.

## Local development

```bash
cd admin
npm install
npm run check
npm run dev
```

Production validation:

```bash
npm ci
npm run check
npm run build
```

## Deployment rule

The public site must deploy only from `jussbeautifulhair-site`. This private repository is a backup and control source, not the public storefront build source.

## License

Private and proprietary. Do not redistribute source code, vendor material, customer information, branding, or product assets.

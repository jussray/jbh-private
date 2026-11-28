# Juss Beautiful Hair — Private Control Layer

This directory is the private owner-control source for Juss Beautiful Hair. It contains admin, paid-order, procurement, database, and vendor-routing code and must not be used as the public storefront deployment source.

## Repository boundary

- Public storefront and Cloudflare Shopify catalog/cart bridge: `jussray/jussbeautifulhair-site`.
- Private owner/admin source, paid-order intake, database code, migrations, procurement, and vendor material: `jussray/jbh-private`.
- Shared commerce contract: `jbh-shopify-private-orders@v1` in `.control-room/commerce-seam.json`.
- Never copy `vendor-docs/`, admin pages, database exports, `.env` files, customer/order records, supplier details, or private build artifacts into the public repository.

The storefront router intentionally does not register private admin routes. Browser admin code is not an internet authentication boundary. Do not use a `VITE_*` variable for an admin password or secret because Vite variables are bundled into browser JavaScript.

## Vendor-specific owner adapter runtime (JussPay cutover preparation)

The private Cloudflare Worker now exposes **Cloudflare Access-protected**
`GET /api/admin/vendor-adapters` and
`POST /api/admin/vendor-adapters/preview` for a bounded review-only vendor
work plan. The implementation is in
`admin/payment-worker/src/vendor-adapters.ts` and
`vendor-adapters-model.ts`. It never makes a supplier API request or
marks payment, stock, or dispatch as verified merely from submitted data.

- **Dropship Beauty:** exact supplier SKU/inventory and a functioning Shopify
  app order handoff are required. A Shopify integration configured in the past
  is not current paid-order dispatch proof.
- **Faire:** wholesale inventory must first be received and reserved by JBH;
  Faire retailer orders are **not** customer dropshipping or a custom retailer API.
- **DSers:** requires an actual connected order channel or supported CSV
  exchange, exact mapped supplier SKUs and separate order confirmation.
- **Manual/other vendors:** owner-accepted supplier quotes, stocked inventory
  and dispatch proof are required. Unrecognized suppliers are quarantined.

A preview is not an authorization to charge, procure, or dispatch. Real
supplier adapters must remain gated until verified transport and receipts
exist, and the JussPay live paid-receipt handoff still requires separate
end-to-end proof. This does not reactivate Shopify.

## JussPay private owner fulfillment (read-only)

After deployment, the proposed route on `jbh-private-payment-control` would expose an Access-only
owner view and an identical JSON API at:

- `GET /api/admin/jusspay/fulfillment/view` — server-rendered, escaped owner page.
- `GET /api/admin/jusspay/fulfillment` — owner-only JSON projection.

Both routes require a valid signed Cloudflare Access JWT for the private admin
application and the owner email allowlist, checked inside the Worker.
They are **not** routes on the public storefront. No browser-side owner key,
cross-origin credential forwarding, order dispatch, charge or checkout occurs.

The private Worker uses the `JUSSPAY` service binding to the existing
`jusspay` Worker, plus `JUSSPAY_OWNER_KEY` as a Cloudflare-secret binding.
Configure `JUSSPAY_OWNER_KEY` to match JussPay's separate
`JBH_OWNER_BRIDGE_KEY` read-only credential. **Do not reuse or rotate** the
human owner's `JBH_OWNER_KEY`: it remains the only credential permitted to
mark an order dispatched or read other owner-only JussPay endpoints. Never place either key in GitHub, logs, URLs, or
browser code. The upstream request uses a fixed internal target and the
`x-jbh-owner-key` header. If either binding is missing, the API fails closed.

Before declaring the route live, independently verify the deployed exact
Worker SHA, Cloudflare Access private-owner policy, binding presence, owner
auth rejection, successful service-to-service queue read, and no customer data
leak for unauthenticated requests. The view is **read-only**: owner dispatch
and supplier integrations still require separate proof/authorization.
The JussPay catalog and live-charge gates remain unchanged.

## Current Shopify physical-order seam

The active public physical checkout is Shopify-backed.

```text
canonical shop domain: 8qp1z2-az.myshopify.com
paid topic: orders/paid
private webhook path: /webhooks/shopify/orders-paid
private Worker service: jbh-private-payment-control
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

1. `jbh-private-payment-control` is deployed on one approved custom hostname;
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

## JussPay live receipt cutover (candidate, disabled until verified)

The private Worker accepts a separate HMAC-signed live receipt at
`/internal/jusspay/live/paid-receipt` only when
`JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED=true` and the independent
`JBH_JUSSPAY_LIVE_RECEIPT_SECRET` is provisioned. Sandbox remains separate.
Migration `019_jusspay_live_receipt_journal.sql` records immutable event
identity and hold precedence atomically. A receipt is evidence of a
verified payment/hold from JussPay, not authorization to dispatch or buy
inventory. The response echoes exact order/event identity only after storage
succeeds. The signed `/internal/jusspay/live/readiness` probe checks schema
presence and effective database privileges, not actual payment fulfillment.
Before applying the migration to production, inspect the real schema and
role, review the migration, verify the disposable database tests and grant
only the necessary privileges to the intended private Worker database role.
Never run fixture SQL against production. No secret values belong in git.
No supplier automation, storefront activation or historical receipt backfill
is implied by this change.

### Private Worker deployment reconciliation

The Nov 25, 2026 Script API deployments introduced the `JUSSPAY_OWNER_KEY`
server-held credential and the `JUSSPAY` service binding to `jusspay`.
The source declares that binding and retains `keep_vars = true`; the owner
credential must never enter source. A successful source build does not
resolve the provider's strict-upload conflict after an API deployment.
Before any separately authorized provider adoption, review the active version,
preserve all existing bindings and settings, check exact-head proofs, and
document the rollback version. Do not remove the strict deployment gate
or silently replace provider configuration.

Live receipt activation still requires the independently scoped receipt
credential, database binding, applied and verified migration, and signed
readiness proof. No live approval follows from this reconciliation alone.

### Explicitly approved recovery from Script API provenance

Normal production deployment remains strict. Do not remove the strict-upload
flag merely because Cloudflare rejects a deployment made after a Script API
edit. The recovery tool, `scripts/private-worker-version-recovery.mjs`, uses
an explicitly pinned active version and only stages an immutable Worker version;
it does not deploy it or change routes, secrets, or live-payment controls.

In GitHub Actions, run **Stage Private Worker Recovery** on main and select
the staging approval checkbox. The workflow derives `EXPECTED_HEAD_SHA`
from the dispatch commit, checks it against current main, discovers the
single active Cloudflare version, and pins that version for the entire
staging run. Do not ask the owner to retype provider-resolvable identifiers.
The checkbox authorizes staging only; production promotion remains separate.

For manual local recovery, run from a clean checkout of current main with
locked dependencies installed. Use the existing securely supplied Cloudflare
account ID/token and exact `EXPECTED_HEAD_SHA`. The active version is
discovered automatically; `JBH_RECOVERY_ACTIVE_VERSION` is an optional
explicit pin that must match the live version. Run read-only preflight first:

```sh
node scripts/private-worker-version-recovery.mjs --preflight
```

Only after explicit approval to stage, set
`JBH_RECOVERY_APPROVAL=STAGE_JBH_WORKER_VERSION` and invoke:

```sh
node scripts/private-worker-version-recovery.mjs --stage
```

The tool refuses unexpected binding inventory, runtime settings, service target,
non-unique active deployment, stale main, or checkout changes. It runs the
existing Worker tests and strict dry-run build before staging; inherited bindings
are pinned to the reviewed version, not the latest upload. It checks staged
metadata and active version after the upload. Secret values are never emitted.
An ambiguous upload result requires manual version inventory review before retry.

A successful staging receipt is not a deployment or proof of production
fulfillment. Review the staged version and rollback version separately before
any production promotion. Do not enable live receipts or apply a production
migration on the basis of this receipt alone. This recovery path intentionally
rejects new bindings until its inventory has been reviewed and updated.

### Deployment input resolution

The private payment control deployment reads the existing Worker settings for
the Shopify API version and location GID. It validates their names, types and
formats before use; it does not invent values or emit credentials. Normal
strict deployment remains in force.

Contact ingress reads the approved repository variables
`CONTACT_ROUTE_PATTERN`, `CONTACT_ZONE_NAME`, `ALLOWED_CONTACT_ORIGINS`,
and `ALLOWED_CONTACT_HOSTNAMES`. Missing or invalid values block deployment.
These variables must represent an approved configuration; they are not
automatically guessed. The existing private, protected-main and customer-data
requirements remain in force.

The deployment and uniqueness-migration actions use default-off owner approval
checkboxes. They resolve the dispatched commit from GitHub. The migration
retains the existing scoped database secret, fixed additive migration file,
duplicate preflight and postflight; a fresh main check precedes SQL.
No migration or deployment is authorized by merging this documentation.

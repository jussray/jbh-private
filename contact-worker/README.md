# Juss Beautiful Hair Private Contact Ingress

## Who

Ray/Juss is the founder and data decision owner. Storefront visitors submit contact questions. This private Worker may verify and persist those submissions but does not authorize marketing, automated replies, customer profiling, CRM synchronization, or public claims.

## What

A narrowly scoped Cloudflare Worker receives `POST /contact`, verifies Cloudflare Turnstile, rejects the honeypot field, validates explicit privacy consent, applies a short-window duplicate fingerprint, and stores the minimum contact payload in the private Neon database.

## Where

Authoritative private operations repository: `jussray/jbh-private`.

Public caller: `jussray/jussbeautifulhair-site` through an explicit `VITE_CONTACT_API_URL`. The public storefront Worker must not contain `DATABASE_URL`, contact persistence, customer-message logs, vendor data, sourcing records, or owner controls.

The earlier source in `jussray/jussbeautifulhair1/contact-worker` is transitional history only and must not remain a production deployment authority after this consolidation is approved.

## When

Deploy only after:

1. `admin/migrations/001_init.sql` and `admin/migrations/007_contact_ingress_safety.sql` are applied to the intended private Neon database;
2. Cloudflare secrets `DATABASE_URL` and `TURNSTILE_SECRET_KEY` are configured on `jbh-contact-ingress`;
3. variables `ALLOWED_CONTACT_ORIGINS` and `ALLOWED_CONTACT_HOSTNAMES` exactly match approved production and preview storefront hosts;
4. the public storefront has `VITE_CONTACT_API_URL` and `VITE_TURNSTILE_SITE_KEY` configured;
5. exact-head typecheck, contract tests, and Wrangler dry-run pass;
6. a real browser submission returns a receipt and creates one database row;
7. replay, invalid-origin, invalid-hostname, invalid-consent, honeypot, oversized-body, and invalid-Turnstile cases fail closed;
8. the duplicate-repository deployment workflow is retired or disabled so only `jbh-private` can deploy this Worker.

## Why

The contact form previously posted to a missing public Worker route. A proposed repair placed a Neon credential and customer-data writes inside the public payment Worker and lacked abuse controls. A later narrow ingress was built in the duplicate storefront repository. Consolidating that ingress here restores the approved boundary: the public storefront displays the form, while all hidden customer-data operations remain in `jbh-private`.

## How

- exact origin allowlist, never wildcard CORS;
- exact Turnstile action and hostname verification;
- minimum name, email, message, consent, receipt, source, and duplicate fingerprint fields;
- no IP persistence and no message contents in logs;
- ten-minute duplicate window using a SHA-256 fingerprint;
- `workers_dev` and preview URLs disabled;
- no committed route, DNS record, secret, or live hostname;
- generic public errors that do not expose provider or database details;
- manual, exact-main-head deployment only after explicit approval.

## Known

- `admin/migrations/001_init.sql` already defines `contact_messages`.
- The public privacy policy discloses contact-message retention and Neon storage.
- Turnstile plus the honeypot provides a server-verified abuse barrier; CORS alone is not treated as bot protection.
- The public payment Worker remains separate from this customer-data service.

## Unknown

- The production contact-service hostname and route.
- Whether the required Cloudflare and Neon secrets are configured.
- Whether both migrations have been applied to the production database.
- The intended contact-message retention period.
- Who reviews the private inquiry queue and at what cadence.
- Whether approved inquiries will later synchronize to HubSpot.

## Blocked

This repository change does not authorize migration execution, route attachment, secret mutation, Worker deployment, live customer submission, automated reply, CRM write, marketing use, or data deletion.

## Rollback

Remove the public `VITE_CONTACT_API_URL`, revert the public storefront wiring, disable the `jbh-contact-ingress` route, and redeploy the prior known-good private backend version. Do not delete stored contact messages without a separate explicit data-deletion decision.

## Next owner

Founder or designated operator must configure secrets, approve the service hostname, apply migrations, deploy the private ingress, run the production browser/database proof, define inquiry ownership and retention, and retire the duplicate repository's deployment authority. A repository merge alone is not deployment or customer-flow proof.

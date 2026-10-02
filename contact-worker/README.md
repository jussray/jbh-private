# Juss Beautiful Hair Private Contact Ingress

## Who

Ray/Juss is the founder and data decision owner. Storefront visitors submit contact questions. This private Worker may verify and persist those submissions but does not authorize marketing, automated replies, customer profiling, CRM synchronization, or public claims.

## What

A narrowly scoped Cloudflare Worker receives `POST /contact`, verifies Cloudflare Turnstile, rejects the honeypot field, validates explicit privacy consent, applies a short-window duplicate fingerprint, and stores the minimum contact payload in the private Neon database.

This is the current-main port of the hardened historical contact stack. The historical candidate at `29e38dfafa9809277f98a4c72fb86ff7de998c69` diverged materially from current main and is not a safe production base.

## Where

Authoritative private operations repository: `jussray/jbh-private`.

Public caller: `jussray/jussbeautifulhair-site` through an explicit `VITE_CONTACT_API_URL`. The public storefront Worker must not contain `DATABASE_URL`, contact persistence, customer-message logs, vendor data, sourcing records, or owner controls.

The earlier source in `jussray/jussbeautifulhair1/contact-worker` is transitional history only and must not remain a production deployment authority.

## When

Activate the isolated contact Worker only after:

1. `admin/migrations/001_init.sql` and `admin/migrations/011_contact_ingress_safety.sql` are applied to the intended private Neon database;
2. Cloudflare secrets `DATABASE_URL` and `TURNSTILE_SECRET_KEY` are configured on `jbh-contact-ingress`;
3. variables `ALLOWED_CONTACT_ORIGINS` and `ALLOWED_CONTACT_HOSTNAMES` exactly match approved storefront hosts;
4. the public storefront has `VITE_CONTACT_API_URL` and `VITE_TURNSTILE_SITE_KEY` configured;
5. exact-head typecheck, contract tests, migration checks, dependency gates, and Wrangler dry-run pass on the current candidate;
6. a real browser submission returns a receipt and creates exactly one database row;
7. duplicate, invalid-origin, invalid-hostname, invalid-consent, honeypot, oversized-body, and invalid-Turnstile cases fail closed;
8. the duplicate-repository deployment authority remains retired;
9. any downstream Make/CRM/customer-reply processing has its own approved processor, privacy, credential, mapping, and end-to-end proof gate.

## Why

The public contact form already requires consent, a honeypot, Turnstile, and an HTTPS private endpoint. The customer-data service belongs in `jbh-private`, not in the public payment Worker and not in a duplicate storefront repository.

The historical contact candidate was hardened correctly but was merged into an old feature-stack base rather than current `main`. Porting only the contact surface onto current main preserves the architecture without discarding newer private-backend work.

## How

- exact origin allowlist, never wildcard CORS;
- exact Turnstile action and hostname verification;
- minimum name, email, message, consent, receipt, source, and duplicate fingerprint fields;
- no IP persistence and no message contents in logs;
- ten-minute duplicate window using a SHA-256 fingerprint;
- `workers_dev` and preview URLs disabled;
- no committed contact route, DNS record, secret, or live contact hostname;
- generic public errors that do not expose provider or database details;
- manual, exact-main-head contact deployment only after explicit approval;
- exact-head CI and the production contact deploy workflow use shell Git bootstrap plus the hosted Node 24 toolcache because reusable `actions/checkout` / `actions/setup-node` bootstraps were proven to trigger pre-job `startup_failure` in this repository;
- the deployment workflow is itself protected by the repository Workflow Attack Repair Contract;
- root `package-lock.json` is required so `npm ci` is genuinely reproducible;
- Make remains downstream and disabled until OAuth, destinations, mappings, sanitized payload handling, and controlled end-to-end proof are complete.

## Known

- Private main at the start of this port was `8008767433418a26fe0378a4c90071e16ea76737`.
- Current main already owns `007_vendor_sample_readiness.sql`, so the historical contact migration was renumbered to `011_contact_ingress_safety.sql` to avoid a migration collision.
- The repository-level Actions failure class was isolated on 2026-10-01: shell-only hosted-runner bootstrap executes, while the affected reusable `uses:` bootstrap pattern terminates before repository steps.
- The root lockfile was missing historically. The branch now carries a lockfileVersion 3 graph bound to the repository-declared npm 10.9.2.
- Repository workflow bootstraps that exhibited the startup-failure class were migrated to the proven exact-SHA shell bootstrap and protected by regression contracts.
- The admin dependency graph was reduced to 0 critical, 0 high, 0 moderate, and one classified low transitive Vite/esbuild advisory. Production build and desktop/mobile browser witnesses pass independently of that low finding.
- Root `apify-client` is intentionally pinned at `2.20.0`. A controlled challenge of main's `2.24.0` passed the X engagement contract 9/9 but produced five current high-severity npm advisories through `proxy-agent -> pac-proxy-agent -> get-uri -> basic-ftp`; npm's own force remediation points back to `2.20.0`. The 2.24 lock candidate was therefore rejected and never committed.
- `admin/migrations/001_init.sql` defines `contact_messages`; `011_contact_ingress_safety.sql` is additive.
- The public storefront source implements consent, honeypot, Turnstile, HTTPS endpoint validation, duplicate handling, and persistence receipts.
- Cloudflare's Git integration posted a successful production deployment receipt for service `jbh-private` at PR commit `7084e80d22408e05f20afefbea754fd575522671` on 2026-10-01. This is a real external deployment effect from PR activity and must not be described as "no production deployment".

## Unknown

- Whether Cloudflare's `jbh-private` Git-integration deployment changed only the existing repository service or activated any contact-ingress resource. Repository evidence does not establish that the isolated `jbh-contact-ingress` Worker, route, contact secrets, or contact migration were activated.
- The production contact-service hostname and route.
- Whether required Cloudflare and Neon contact secrets are configured.
- Whether the contact migration has been applied to production.
- The intended contact-message retention period.
- Who reviews the inquiry queue and at what cadence.
- The final approved downstream automation destinations after Make OAuth completes.

## Blocked

Source proof and repository CI are separate from production contact activation. Contact activation remains blocked until the intended database, migration, isolated Worker identity, route, secrets, public environment variables, and real browser/database witness are proven together.

The existing Cloudflare Git integration has already produced a `jbh-private` production deployment receipt from this PR branch. That external effect must be reconciled as part of production governance, but it is not evidence that `jbh-contact-ingress` itself is live.

Make/Gmail/Slack downstream automation remains non-authoritative until its credentials, destinations, mappings, sanitized event contract, and controlled end-to-end test are green.

## Rollback

Before contact activation, revert or close the source candidate as needed. If `jbh-contact-ingress` is later activated, remove public `VITE_CONTACT_API_URL`, disable the approved contact route, redeploy the prior known-good contact runtime where applicable, and preserve stored contact records unless a separate explicit deletion decision authorizes removal.

The Cloudflare Git-integration deployment of the repository service is an already-observed external effect and must be handled according to that service's own rollback authority rather than being treated as nonexistent.

## Next owner

Keep merge proof bound to the current PR head. Production contact activation remains a separate decision from source merge. Reconcile Cloudflare provider state before claiming the isolated contact service is live, and keep downstream Make processing disabled until its independent authorization and proof gates pass.

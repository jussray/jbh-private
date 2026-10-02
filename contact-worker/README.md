# Juss Beautiful Hair Private Contact Ingress

## Who

Ray/Juss is the founder and data decision owner. Storefront visitors submit contact questions. This private Worker may verify and persist those submissions but does not authorize marketing, automated replies, customer profiling, CRM synchronization, or public claims.

## What

A narrowly scoped Cloudflare Worker receives `POST /contact`, verifies Cloudflare Turnstile, rejects the honeypot field, validates explicit privacy consent, applies a rolling ten-minute duplicate check, and stores the minimum contact payload in the private Neon database.

This is the current-main port of the hardened historical contact stack. The historical candidate at `29e38dfafa9809277f98a4c72fb86ff7de998c69` diverged materially from current main and is not a safe production base.

## Where

Intended private operations repository: `jussray/jbh-private`.

**Current governance blockers:** GitHub repository metadata presently reports this repository as `visibility: public` / `private: false`, and `main` is not protected. Those provider states must be reconciled before merge authority can be granted.

Public caller: `jussray/jussbeautifulhair-site` through an explicit `VITE_CONTACT_API_URL`. The public storefront Worker must not contain `DATABASE_URL`, contact persistence, customer-message logs, vendor data, sourcing records, or owner controls.

The earlier source in `jussray/jussbeautifulhair1/contact-worker` is transitional history only and must not remain a production deployment authority.

## When

Activate the isolated contact Worker only after:

1. repository visibility matches the approved private operations boundary and `main` is protected by a load-bearing merge membrane;
2. `admin/migrations/001_init.sql` and `admin/migrations/015_contact_ingress_safety.sql` are applied to the intended private Neon database through a separately approved migration action;
3. Cloudflare secrets `DATABASE_URL` and `TURNSTILE_SECRET_KEY` are configured on `jbh-contact-ingress`;
4. variables `ALLOWED_CONTACT_ORIGINS` and `ALLOWED_CONTACT_HOSTNAMES` exactly match approved storefront hosts;
5. the public storefront has `VITE_CONTACT_API_URL` and `VITE_TURNSTILE_SITE_KEY` configured;
6. exact-head typecheck, contract tests, migration checks, dependency gates, and Wrangler dry-run pass on the current candidate;
7. the Control Room ledger proves no non-main Cloudflare check crossed a `/production/builds/` boundary;
8. a real browser submission returns a receipt and creates exactly one database row;
9. duplicate, invalid-origin, invalid-hostname, invalid-consent, honeypot, oversized-body, and invalid-Turnstile cases fail closed;
10. the duplicate-repository deployment authority remains retired;
11. any downstream Make/CRM/customer-reply processing has its own approved processor, privacy, credential, mapping, and end-to-end proof gate.

## Why

The public contact form already requires consent, a honeypot, Turnstile, and an HTTPS private endpoint. The customer-data service belongs in the intended private operations boundary, not in the public payment Worker and not in a duplicate storefront repository.

The historical contact candidate was hardened correctly but was merged into an old feature-stack base rather than current `main`. Porting only the contact surface onto current main preserves the architecture without discarding newer private-backend work.

## How

- exact origin allowlist, never wildcard CORS;
- exact Turnstile action and hostname verification;
- minimum name, email, message, consent, receipt, source, and duplicate fingerprint fields;
- no IP persistence and no message contents in logs;
- rolling ten-minute duplicate detection using current/previous SHA-256 bucket fingerprints plus a server-time `created_at` cutoff;
- `workers_dev` and preview URLs disabled;
- no committed contact route, DNS record, secret, or live contact hostname;
- generic public errors that do not expose provider or database details;
- manual, exact-main-head contact deployment only after explicit approval;
- exact-head CI and the production contact deploy workflow use shell Git bootstrap plus the hosted Node 24 toolcache because reusable `actions/checkout` / `actions/setup-node` bootstraps were proven to trigger pre-job `startup_failure` in this repository;
- the exact-head contact gate reads GitHub provider state and fails unless the repository is private and `main` is protected;
- the Control Room ledger fails when a non-main exact head receives a Cloudflare production-build check;
- the deployment workflow is protected by the repository Workflow Attack Repair Contract;
- root `package-lock.json` is required so `npm ci` is genuinely reproducible;
- Make remains downstream and disabled until OAuth, destinations, mappings, sanitized payload handling, and controlled end-to-end proof are complete.

## Known

- Private-main candidate base at the start of this port was `8008767433418a26fe0378a4c90071e16ea76737`.
- GitHub currently reports `jussray/jbh-private` as public and current `main` as unprotected. A bounded default-branch scan found no obvious live Stripe key, GitHub PAT, Slack token, Shopify admin-token prefix, Google API key, or Postgres connection URL; token-prefix matches observed were defensive test/validation patterns. This limited scan is not a substitute for full secret-history review.
- Active PR #77 reserves post-010 migration intent `011` through `014`, so this contact-ingress safety migration is source-reserved as `015_contact_ingress_safety.sql`.
- Source merge does not authorize applying migration `015` before the production migration ledger and target database are separately verified.
- The repository-level Actions failure class was isolated on 2026-10-01: shell-only hosted-runner bootstrap executes, while the affected reusable `uses:` bootstrap pattern terminates before repository steps.
- The root lockfile was missing historically. The branch now carries a lockfileVersion 3 graph bound to the repository-declared npm 10.9.2.
- Repository workflow bootstraps that exhibited the startup-failure class were migrated to the proven exact-SHA shell bootstrap and protected by regression contracts.
- The admin dependency graph was reduced to 0 critical, 0 high, 0 moderate, and one classified low transitive Vite/esbuild advisory. Production build and desktop/mobile browser witnesses pass independently of that low finding.
- Root `apify-client` is intentionally pinned at `2.20.0`. A controlled challenge of main's `2.24.0` passed the X engagement contract 9/9 but produced five current high-severity npm advisories through `proxy-agent -> pac-proxy-agent -> get-uri -> basic-ftp`; npm's own force remediation points back to `2.20.0`. The 2.24 lock candidate was therefore rejected and never committed.
- `admin/migrations/001_init.sql` defines `contact_messages`; `015_contact_ingress_safety.sql` is additive.
- The public storefront source implements consent, honeypot, Turnstile, HTTPS endpoint validation, duplicate handling, and persistence receipts.
- Cloudflare's Git integration has posted successful production-build receipts for non-main PR commits under service `jbh-private`. This is a real external deployment effect and must not be described as preview-only.

## Unknown

- Whether sensitive historical content was ever committed and later removed before the bounded current-tree scan.
- The exact Cloudflare Workers Builds root/config/command that currently resolves provider project `jbh-private` instead of canonical source identity `jbh-private-payment-control`.
- Whether Cloudflare's `jbh-private` Git-integration deployment changed only the existing repository service or activated any contact-ingress resource. Repository evidence does not establish that the isolated `jbh-contact-ingress` Worker, route, contact secrets, or contact migration were activated.
- The production contact-service hostname and route.
- Whether required Cloudflare and Neon contact secrets are configured.
- Whether the contact migration has been applied to production.
- The intended contact-message retention period.
- Who reviews the inquiry queue and at what cadence.
- The final approved downstream automation destinations after Make OAuth completes.

## Blocked

**Merge authority is blocked while the intended-private repository is public, `main` is unprotected, or a non-main PR head can cross a Cloudflare production-build boundary.** The exact-head workflow and Control Room ledger intentionally fail closed on those provider states.

Source proof and repository CI are separate from production contact activation. Contact activation remains blocked until the intended database, migration, isolated Worker identity, route, secrets, public environment variables, and real browser/database witness are proven together.

Make/Gmail/Slack downstream automation remains non-authoritative until its credentials, destinations, mappings, sanitized event contract, and controlled end-to-end test are green.

## Rollback

Before contact activation, revert or close the source candidate as needed. If `jbh-contact-ingress` is later activated, remove public `VITE_CONTACT_API_URL`, disable the approved contact route, redeploy the prior known-good contact runtime where applicable, and preserve stored contact records unless a separate explicit deletion decision authorizes removal.

The Cloudflare Git-integration deployment of the repository service is an already-observed external effect and must be handled according to that service's own rollback authority rather than being treated as nonexistent.

## Next owner

First reconcile GitHub repository visibility and main-branch protection, then reconcile Cloudflare Workers Builds so non-main PR source changes cannot cross production. After that provider containment, keep merge proof bound to the current PR head. Production contact activation remains a separate decision from source merge, and downstream Make processing stays disabled until its independent authorization and proof gates pass.

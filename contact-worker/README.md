# Juss Beautiful Hair Private Contact Ingress

## Who

Ray/Juss is the founder and data decision owner. Storefront visitors submit contact questions. This private Worker may verify and persist those submissions but does not authorize marketing, automated replies, customer profiling, CRM synchronization, or public claims.

## What

A narrowly scoped Cloudflare Worker receives `POST /contact`, verifies Cloudflare Turnstile, rejects the honeypot field, validates explicit privacy consent, applies a short-window duplicate fingerprint, and stores the minimum contact payload in the private Neon database.

This is the current-main port of the hardened historical contact stack. The historical candidate at `29e38dfafa9809277f98a4c72fb86ff7de998c69` diverged from current main by 170 commits and is not a safe production base.

## Where

Authoritative private operations repository: `jussray/jbh-private`.

Public caller: `jussray/jussbeautifulhair-site` through an explicit `VITE_CONTACT_API_URL`. The public storefront Worker must not contain `DATABASE_URL`, contact persistence, customer-message logs, vendor data, sourcing records, or owner controls.

The earlier source in `jussray/jussbeautifulhair1/contact-worker` is transitional history only and must not remain a production deployment authority.

## When

Deploy only after:

1. `admin/migrations/001_init.sql` and `admin/migrations/011_contact_ingress_safety.sql` are applied to the intended private Neon database;
2. Cloudflare secrets `DATABASE_URL` and `TURNSTILE_SECRET_KEY` are configured on `jbh-contact-ingress`;
3. variables `ALLOWED_CONTACT_ORIGINS` and `ALLOWED_CONTACT_HOSTNAMES` exactly match approved storefront hosts;
4. the public storefront has `VITE_CONTACT_API_URL` and `VITE_TURNSTILE_SITE_KEY` configured;
5. exact-head typecheck, contract tests, migration checks, and Wrangler dry-run pass on the current candidate;
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
- no committed route, DNS record, secret, or live hostname;
- generic public errors that do not expose provider or database details;
- manual, exact-main-head deployment only after explicit approval;
- exact-head CI uses shell Git bootstrap and the hosted Node 24 toolcache because reusable `uses:` actions currently trigger pre-job `startup_failure` in this repository;
- root `package-lock.json` is required so `npm ci` is genuinely reproducible;
- Make remains downstream and disabled until OAuth, destinations, mappings, sanitized payload handling, and controlled end-to-end proof are complete.

## Known

- Current private main at the start of this port was `8008767433418a26fe0378a4c90071e16ea76737`.
- Current main already owns `007_vendor_sample_readiness.sql`, so the historical contact migration was renumbered to `011_contact_ingress_safety.sql` to avoid a migration collision.
- The repository-level Actions failure class was isolated on 2026-10-01: a shell-only hosted runner starts and executes, while adding reusable `uses:` actions causes pre-job `startup_failure`.
- The root lockfile was missing historically. A branch-only bootstrap generated `package-lock.json` with lockfileVersion 3 using the repository-declared npm 10.9.2, then the temporary write-capable bootstrap workflow was removed.
- On exact candidate SHA `2b01ff418313ebf3d5221350efaa1ce18710cf99`, the repaired Private Contact Ingress Exact-Head Gate passed exact-SHA fetch, hosted Node 24 selection, root lock verification, `npm ci`, strict TypeScript, both contact contract tests, additive migration validation, Wrangler 4.143.1 dry-run, and deterministic bundle receipt generation.
- The deterministic dry-run receipt for that exact run included SHA-256 `9d7acea75fe337cf1217b59210b30823b67e138d9f2ff7486503d2b5a020513e` for `.wrangler/contact-dry-run/README.md`.
- `admin/migrations/001_init.sql` defines `contact_messages`.
- The public storefront already implements consent, honeypot, Turnstile, HTTPS endpoint validation, duplicate handling, and persistence receipts.

## Unknown

- The production contact-service hostname and route.
- Whether required Cloudflare and Neon secrets are configured.
- Whether the contact migration has been applied to production.
- The intended contact-message retention period.
- Who reviews the inquiry queue and at what cadence.
- The final approved downstream automation destinations after Make OAuth completes.
- The exact source and exploitability of the five high-severity dependency advisories reported by npm during the 2026-10-01 exact-head install. They need separate dependency-audit evidence before production activation.

## Blocked

The contact source proof is no longer blocked by GitHub Actions. Production activation remains blocked because source proof does not authorize migration execution, route attachment, secret mutation, Worker deployment, live customer submission, automated reply, CRM write, marketing use, or data deletion.

Repository-wide workflow health is not fully repaired yet. Other private workflow families that still depend on reusable `uses:` actions continue to terminate with `startup_failure` before jobs are created and must be migrated or independently proven without weakening their test commands.

## Rollback

Delete or revert the current-main contact-port commits. If the private ingress is later activated, remove public `VITE_CONTACT_API_URL`, disable the `jbh-contact-ingress` route, redeploy the prior known-good private backend, and preserve stored contact records unless a separate explicit deletion decision authorizes removal.

Before production activation, rollback of this candidate is simply closing PR #82 and deleting its branch because no migration, route, secret, deployment, or customer-data side effect has occurred.

## Next owner

Clear the remaining dependency-audit and repository-wide execution proof. Production activation remains a separate gate. Make may consume only an approved sanitized downstream event after its OAuth connections, destinations, mappings, privacy boundary, and controlled test are proven.

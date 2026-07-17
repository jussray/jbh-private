# Juss Beautiful Hair private-admin MCP stack

Last reviewed: 2026-07-14

This repository contains private admin code, vendor sourcing, brand strategy, and operational material. Its default MCP stack is intentionally smaller than the public storefront stack.

## Connected servers

| Server | Purpose | Boundary |
| --- | --- | --- |
| `github` | Repository, pull requests, Actions, code scanning, and secret scanning | Selected toolsets only; no committed PAT or Authorization header |
| `context7` | Current documentation for React, Vite, Stripe SDK, Drizzle, Neon, TypeScript, and related libraries | Documentation only; never send vendor, customer, order, payment, or credential data |
| `playwright` | Local admin-route verification with synthetic fixtures | Pinned package, isolated Chromium profile, no production login state |

## Deliberately excluded

- Cloudflare Builds and Observability. Deployment authority and public runtime evidence belong in `jussbeautifulhair-site`.
- Supabase, DBHub, and generic database MCP servers. Direct database access is a temporary, read-only escalation only when a specific investigation requires it.
- Netdata. There is no owned persistent server fleet in this repository's current architecture.
- GitHub Insiders and local Docker GitHub MCP as committed defaults.
- Unpinned packages, `@latest` bridges, raw bearer headers, or repository-stored credentials.

## Sensitive-data rule

Never send the following through MCP prompts or browser fixtures:

- vendor names, factory contacts, catalog links, negotiation history, pricing sheets, or sourcing documents;
- real customer names, addresses, emails, phone numbers, orders, refunds, or disputes;
- Stripe event bodies, signatures, secret keys, webhook secrets, or live Checkout sessions;
- admin passwords, tokens, database URLs, or production cookies.

Use invented fixtures and sanitized operational summaries. Private repository visibility is not permission to expose every file to every connected tool.

## Verification prompts

```text
Use GitHub MCP to inspect the admin authentication and order-update paths. Report security gaps without changing code.
```

```text
Use Context7 to verify the installed Stripe SDK, Drizzle, Neon, React, and Vite APIs before proposing changes. Use package and lockfile versions.
```

```text
Use Playwright in an isolated profile to test the local admin route with synthetic orders and vendors. Do not load production credentials or real records.
```

## Validation

From `admin/` run:

```bash
npm run verify:mcp
npm run check
npm run build
```

Any direct database, deployment, migration, or production-data operation requires a separate founder-approved workflow and a removal condition for the temporary access channel.

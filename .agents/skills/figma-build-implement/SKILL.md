---
name: figma-build-implement
description: Build and implement private Juss Beautiful Hair owner/admin interfaces through Figma while preserving local-only operations, vendor/customer secrecy, and the isolated payment-Worker boundary.
---

# Juss Beautiful Hair Private Figma Build + Implementation

Load for every Figma, private admin design, internal design-system, design-to-code, visual QA, component mapping, or owner-workflow task in this repository.

## Tool skills

- Load `figma-use` before every Figma write.
- Load `figma-generate-library` for variables, tokens, reusable components, variants, modes, themes, or design-system reconciliation.
- Use `figma-generate-design` only for first capture of a reviewed local admin page into an existing private file; rebuild editable structure with `figma-use`.
- Use `figma-code-connect` only for published components in an eligible private team library, exact node URLs, and verified code props.

## Repository profile

- Product boundary: loopback-only owner/admin and local vault plus one isolated API-only Cloudflare payment Worker.
- Primary design targets: owner dashboard, catalog administration, vendor/sourcing workflow, routing, margin and quality evidence, paid-order import status, audit/replay state, and security/error states.
- Implement in the current local admin code and preserve the local-only/non-deployable owner surface. The payment Worker remains API-only and must not receive owner UI assets.
- Use a private Figma file and synthetic/redacted operational data.

## Required sequence

1. Run 5W1H and verify the exact private/public/payment-Worker boundaries.
2. Redteam the premise: Figma cloud exposure, vendor/customer leakage, owner UI accidentally bundled for deployment, browser-held secrets, duplicate checkout authority, and unsafe convenience actions.
3. Inspect current admin components, vault/data contracts, routing, import/export schemas, Worker boundary checks, tests, and private design libraries.
4. Lock the owner, workflow, data classification, local route, implementation files, non-deployment rules, and proof.
5. Build private tokens and reusable admin components before screens. Do not publish them to a public/community library.
6. Implement only in the local owner/admin surface. Keep secrets server/local, keep vendor/cost data out of client logs, and keep the isolated Worker UI-free.
7. Redteam the selected implementation: access control, local binding, export minimization, exact-cent math, replay, tampering, vendor separation, accidental build inclusion, and rollback.
8. Verify MCP/deployment boundary checks, owner-admin security tests, payment-Worker security tests, TypeScript, production/private build checks, and Playwright with synthetic data.
9. Record private Figma nodes, exact code paths, proof, known drift, rollback, and next founder gate without exposing sensitive content in public PR text.

## Data and authority boundary

- Never place real customer/order records, vendor identities, vendor prices, sourcing documents, margins, credentials, webhook payloads, Stripe secrets, Cloudflare Access tokens, or proprietary business records into Figma.
- Use synthetic and redacted fixture values; keep screenshots sanitized.
- Figma does not authorize purchasing, vendor contact, refunds, price changes, secret changes, database migration, domain attachment, Stripe activation, Worker deployment, or public release.
- The private library must not be attached to public storefront files.

## Code Connect

Use only with published components in an eligible private library and verified local-admin code APIs. Do not map sensitive example content or payment-Worker endpoints into templates.

## Definition of done

Editable private design, implementation status, data minimization, access/deployment boundary proof, accessibility, exact tests, unresolved drift, rollback, and next gate are documented. A private mockup is not local-runtime or Worker proof.

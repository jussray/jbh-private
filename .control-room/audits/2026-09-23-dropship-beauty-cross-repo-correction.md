# Dropship Beauty cross-repo correction receipt

Timestamp: 2026-09-23 UTC

## Scope

This receipt supersedes stale current-state claims in `docs/verification/dropship-beauty-image-repair-20260923.md` without deleting or rewriting the historical receipt.

## VERIFIED

- `admin/migrations/009_vendor_connection_state.sql` contains a code-level Dropship Beauty connection record with `connection_mode = 'shopify_supplier_feed'`, state `catalog_observed`, evidence for Shopify location `gid://shopify/Location/94408442099`, and a guarded `BRAZ-SEW-` supplier-lane hint for private procurement intake. Dispatch authority remains false.
- `admin/data/vendor-selection-intent.json` is a separate owner-selection intent record. Its `selected-contacted` state is not the same truth layer as the connection-state migration and must not be silently rewritten to impersonate runtime authority.
- During the later live audit, Shopify authority was `8qp1z2-az.myshopify.com` and the store returned 24 ACTIVE products tagged `dropship-beauty`.
- The public storefront allowlist on `jussray/jussbeautifulhair-site` omitted four live campaign handles: `body-wave-human-hair-bundle-deal`, `straight-human-hair-bundle-deal`, `deep-wave-human-hair-bundle-deal`, and `loose-wave-human-hair-bundle-deal`. Because `applyJbhPresentation` returns null for an unmapped handle, those products were excluded from the headless catalog even though Shopify marked them active.
- The existing public branch `claude/dropship-beauty-images-qqlu53` was repaired and regression-guarded at exact head `7768e1f1be5060101429808b32a0fdeabbe5645f`. The four campaign products use exact live Shopify option titles and the customer-safe placeholder instead of unreviewed supplier imagery.
- Vercel rebuilt that exact public head and still failed with the pre-existing `module_not_found` / `npm run build` exit-1 blocker. The public repair is therefore source-level only, not merged or production-proven.
- Retained legacy Stripe rollback code still contains `$9.99` flat shipping and free shipping at `$150`. Current Shopify domestic checkout truth verified during the later audit is Standard `$8`, Express `$15`, and free Standard at `$70+`.
- The private README identifies Stripe as a retained legacy rollback path, so the old Stripe shipping constants are recovery-path drift, not evidence that live Shopify checkout is using those values.

## SUPERSEDED CLAIMS

The historical receipt statements `Dropship Beauty integration: none in code` and `JBH Shopify admin: no connector to shop 8qp1z2-az` must not be reused as current-state truth. They describe an earlier agent/tool environment and are superseded by the evidence above.

## UNKNOWN / BLOCKED

- The exact missing module behind the current Vercel build failure is still unknown because the available deployment-log action did not return build-log detail. Do not merge the public branch until exact-head build and required browser proof are green.
- The intended economics of the retained Stripe rollback path have not been reconciled with current Shopify shipping. Do not silently change the legacy constants until the rollback behavior is explicitly decided and tested.
- Dropship Beauty dispatch remains unauthorized in the private connection-state model.

## Rollback

This file is additive continuity evidence only. Reverting this commit removes the correction receipt without changing vendor state, checkout, shipping, products, Shopify data, or deployment state.

## Next gates

1. Resolve the public Vercel `module_not_found` failure and obtain exact-head build/browser proof.
2. Reconcile whether the retained Stripe rollback shipping policy should mirror current Shopify or remain a separately defined fallback policy.
3. Resume the separately scoped Shopify delivery-profile isolation only after its exact GraphQL mutation and rollback proof are validated.

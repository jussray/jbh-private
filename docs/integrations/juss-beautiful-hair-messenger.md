# Juss Beautiful Hair customer messaging integration

> Exported from `jussray/Sekret-Bip@1d494ec8e6d1d20950e2a6714eec85e17cad5347:docs/integrations/juss-beautiful-hair-messenger.md` (blob `12de7d76`). The JBH Messenger and payment policy belongs to JBH, not Se'kret Bip.

Status: **review-safe contract only**. Production messaging and payments are not activated by this branch.

## Connected Meta assets

- Facebook Page: `Juss Beautiful Hair`
- Page ID: `235882889600658`
- Linked ad account: `448895848561566`

## Product flow

```text
Facebook Messenger
  -> verified Meta webhook
  -> normalized message + idempotency key
  -> approved FAQ, lead capture, or founder review
  -> HubSpot contact/conversation record
  -> optional Stripe Checkout session created server-side
  -> signed Stripe webhook records payment truth
  -> Founder Control Room review queue
```

## Messenger rules

- Answer only from an approved FAQ or product source.
- Route order status, unknown requests, inventory claims, delivery promises, refunds, discounts, and explicit human requests to review.
- Do not store access tokens, app secrets, webhook secrets, or unnecessary private message content in logs.
- Deduplicate Meta events with Page ID, sender ID, and message ID.

## HubSpot handoff

A qualified conversation should include:

- source: `Facebook Messenger`
- business: `Juss Beautiful Hair`
- customer name and consented contact method
- intent and product interest
- short conversation summary
- human-review requirement
- consent state
- Meta trace identifiers
- Stripe customer, checkout, or payment identifiers only when created by the server

HubSpot is a record and review surface. It must not become an unverified payment-status source.

## Stripe rules

- Never request or accept card numbers in Messenger.
- Create Checkout Sessions only on the server.
- A Checkout Session requires explicit customer consent and an approved `price_...` identifier.
- Prices come from Stripe or another founder-approved catalog source, never from model generation.
- Payment status comes only from a verified Stripe API response or signed Stripe webhook event.
- Refunds, discounts, coupons, and manual price changes require founder review.
- Stripe webhook events must be signature-verified and idempotent before CRM updates.
- Log only sanitized event metadata. Do not copy full Stripe event payloads or customer financial data into general logs.

## Environment contract

Expected server-only secrets and configuration:

```text
META_APP_SECRET
META_VERIFY_TOKEN
META_PAGE_ACCESS_TOKEN
HUBSPOT_PRIVATE_APP_TOKEN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
JHB_ALLOWED_STRIPE_PRICE_IDS
```

These values must be supplied through the deployment secret store. They must never be committed, echoed, or placed in client bundles.

## Current implementation

- `automation/messenger/message-policy.mjs`
  - intent classification
  - safe routing
  - Meta event idempotency key
  - review-safe HubSpot lead mapping
- `automation/messenger/payment-policy.mjs`
  - payment request classification
  - consent and approved-price gates
  - refund and discount review gates
  - sanitized Stripe event metadata
- focused Node contract tests in `automation/messenger/*.test.mjs` (`npm run test:messenger`)

## Not implemented yet

- Meta webhook endpoint and signature verification
- HubSpot API writes
- Stripe Checkout Session creation
- Stripe webhook endpoint and signature verification
- Founder Control Room review UI
- live Meta, HubSpot, or Stripe credentials
- production activation

## Proof gates

1. Run the focused Node tests.
2. Verify Meta webhook signature rejection and duplicate-event handling.
3. Verify Stripe signature rejection and duplicate-event handling in test mode.
4. Create a Stripe test Checkout Session using an allowlisted test price.
5. Confirm a signed `checkout.session.completed` event updates the review record exactly once.
6. Confirm no card data or secrets appear in logs or HubSpot.
7. Capture Playwright evidence for the human review dashboard if a UI is added.
8. Keep production activation blocked until founder approval.

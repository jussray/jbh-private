# Cookie and Session Contract

The private Juss Beautiful Hair owner/admin repository currently sets zero cookies.

## Why zero is correct

The admin is a local Vite application. A cookie created by that client would only restate what the same client already claims; it would not establish owner identity, authorization, auditability, revocation, or safe remote access.

The isolated payment Worker is API-only. It must not serve the owner UI, expose private operations, or become an admin session authority.

## Forbidden

- client-created admin, owner, role, vendor, order, payment, or access cookies;
- `document.cookie`, Cookie Store API, or custom `Set-Cookie` handling;
- customer, order, vendor, sourcing, margin, credential, webhook, Stripe, or proprietary data in cookies;
- analytics, advertising, fingerprinting, replay, or cross-site tracking cookies;
- deploying the local owner UI and calling a cookie “authentication.”

## Future gate

A real loopback backend may add a short-lived HttpOnly session only after it proves server-side owner identity, origin/CSRF protection, audit events, revocation, timeout, logout, no-store caching, and strict separation from the payment Worker. Until then, cookie count remains zero.

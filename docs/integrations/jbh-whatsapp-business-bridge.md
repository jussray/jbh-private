# JBH AI-assisted WhatsApp Business connector

**State:** private branch implementation only; not deployed or activated. WhatsApp message acceptance is not proof of delivery, invoicing, supplier order acceptance or shipment.

## Routing

- `GET /webhooks/whatsapp`: Meta challenge (configured verify token).
- `POST /webhooks/whatsapp`: authenticates `X-Hub-Signature-256` against the exact body, then deduplicates inbound messages.
- `POST /api/admin/whatsapp/contacts`: Cloudflare Access owner-only consented contact registration, using a keyed contact hash instead of retaining raw phone numbers.
- `POST /api/admin/whatsapp/send-approved`: Cloudflare Access owner-only outbound request. Requires opted-in recorded recipient, proper 24-hour session or approved Meta template, and server-verified order state.
- For vendor purchase-order notices, the existing private paid order and explicitly authorized purchase-order draft must match the vendor; this **does not** place an order, send a customer address, authorize any supplier payment or mark an order dispatched.
- Only preapproved FAQ facts can generate automatic customer replies. Payment, refunds, tracking, order placement, vendor acceptance and unknown requests are queued for owner review. No model-produced price, stock, or order status is trusted.

## Configure server-only in Cloudflare (never in GitHub, browser code or chat)

```text
DATABASE_URL
JBH_WHATSAPP_WEBHOOK_ENABLED=false
JBH_WHATSAPP_SEND_ENABLED=false
JBH_WHATSAPP_AUTO_REPLY_ENABLED=false
JBH_WHATSAPP_APP_SECRET=<Meta app secret>
JBH_WHATSAPP_VERIFY_TOKEN=<random challenge token>
JBH_WHATSAPP_PHONE_NUMBER_ID=<Meta phone number ID>
JBH_WHATSAPP_CONTACT_HASH_KEY=<random secret >= 32 characters>
JBH_WHATSAPP_ACCESS_TOKEN=<business system-user access token>
JBH_WHATSAPP_GRAPH_VERSION=<verified supported vNN.N>
JBH_WHATSAPP_APPROVED_FAQS_JSON={}
JBH_WHATSAPP_APPROVED_TEMPLATES_JSON=[]
```

Do not activate until Meta Business Account and number are connected, Meta webhook subscriptions and template approvals verified, contacts have recorded opt-in, DB migrations 019 and 020 applied safely, owner review and tests pass, and the exact live webhook URL is reachable without bypassing private/admin Cloudflare Access. **Only** the signed webhook path may receive public Meta traffic; all admin endpoints remain Access-protected.

Do not auto-retry an uncertain Meta send: the provider could have accepted the original. Reconcile Meta message ID and delivery status first. Store no payment-card numbers, private recipient addresses in AI prompts, or supplier account credentials in message content.

The system must continue to block customer charges and supplier order dispatch until separate production JussPay/vendor authority gates pass.

## Signed delivery receipts (pending private migration 021)

Meta can acknowledge a send before later reporting `sent`, `delivered`, `read`, or `failed`. Those status updates arrive on the same signed webhook. Migration `021_whatsapp_delivery_receipts.sql` stores immutable, phone-free status receipts keyed by the Meta message ID and status. The private outbox reconciles monotonically, including receipts that arrive before the `/messages` response is saved.

A provider-accepted message is **not** proof of delivery, supplier acceptance, vendor invoicing, shipment, or payment. The bridge never automatically retries a send when delivery is unknown. Meta receipt data must not activate supplier purchases.

This is still review-branch code. Do not apply the migration, enable Meta messaging, or alter production Cloudflare Access until the actual database, webhook, business phone, contacts/consents, and end-to-end tests are verified.

## Private owner readiness and review (pending migration 022)

These paths are behind existing Cloudflare Access policy on `/api/admin` and cannot be called by Meta:

- `GET /api/admin/whatsapp/readiness`: reports configured binding presence, whether private database schema tables 019–022 exist, and whether outbound switches remain off; never displays secret values. A configured secret is **not** evidence of a live Meta handshake.
- `GET /api/admin/whatsapp/review`: shows up to 50 recent message IDs, intent labels, reply status, and owner-resolution state. **Metadata only:** the current inbox does not retain original message contents or phone numbers. Do not claim this is a complete conversation reader.
- `POST /api/admin/whatsapp/review/resolve`: records one owner resolution code (`no_action_required`, `handled_externally`, or `followup_required`) against an existing inbox message ID. No vendor purchase, message, or payment is initiated.

Migration `022_whatsapp_owner_review_actions.sql` is additive and requires `020`. Database migration order is `019 → 020 → 021 → 022`, but **nothing may be applied** before confirming that the actual production private Postgres database and its migration baseline match the code. These checks do not authorize enabling checkout or supplier dispatch.

## Verified Cloudflare routing (2026-11-22/23)

The account routes `api.jussbeautifulhair.com/*` to `jbh-private-payment-control`, and the Access application currently protects `api.jussbeautifulhair.com/api/admin`. The planned public webhook is `https://api.jussbeautifulhair.com/webhooks/whatsapp`. Only this webhook should be reachable without Cloudflare Access, and each POST must validate Meta's signed body.

As checked, the production Worker had **no `DATABASE_URL` or WhatsApp secret bindings**, and the review-branch code was not deployed. Configure Meta assets and secrets inside authorized dashboards; do not paste credentials into chats.

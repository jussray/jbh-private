import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import { z } from "zod";
import {
  EVENT_LEASE_MINUTES,
  type Env,
  json,
  MAX_WEBHOOK_BODY_BYTES,
  type OnlineOrderRow,
  readBoundedText,
  safeErrorCode,
  SafeProcessingError,
  type Sql,
  stripeClient,
  text,
} from "./shared";

async function claimWebhookEvent(
  sql: Sql,
  eventId: string,
  eventType: string,
): Promise<"claimed" | "completed" | "busy"> {
  const claimed = (await sql`
    INSERT INTO stripe_webhook_receipts (
      stripe_event_id, event_type, status, attempts, lease_started_at, updated_at
    ) VALUES (${eventId}, ${eventType}, 'processing', 1, NOW(), NOW())
    ON CONFLICT (stripe_event_id) DO UPDATE SET
      event_type = EXCLUDED.event_type,
      status = 'processing',
      attempts = stripe_webhook_receipts.attempts + 1,
      lease_started_at = NOW(),
      completed_at = NULL,
      last_error = NULL,
      updated_at = NOW()
    WHERE stripe_webhook_receipts.status = 'failed'
       OR (
         stripe_webhook_receipts.status = 'processing'
         AND stripe_webhook_receipts.lease_started_at <
             NOW() - (${EVENT_LEASE_MINUTES} * INTERVAL '1 minute')
       )
    RETURNING stripe_event_id
  `) as unknown as Array<{ stripe_event_id: string }>;
  if (claimed[0]) return "claimed";

  const existing = (await sql`
    SELECT status FROM stripe_webhook_receipts
    WHERE stripe_event_id = ${eventId}
    LIMIT 1
  `) as unknown as Array<{ status: string }>;
  return existing[0]?.status === "completed" ? "completed" : "busy";
}

async function finishWebhookEvent(sql: Sql, eventId: string): Promise<void> {
  await sql`
    UPDATE stripe_webhook_receipts
    SET status = 'completed', completed_at = NOW(), last_error = NULL, updated_at = NOW()
    WHERE stripe_event_id = ${eventId}
  `;
}

async function failWebhookEvent(
  sql: Sql,
  eventId: string,
  error: unknown,
): Promise<void> {
  await sql`
    UPDATE stripe_webhook_receipts
    SET status = 'failed', last_error = ${safeErrorCode(error)}, updated_at = NOW()
    WHERE stripe_event_id = ${eventId}
  `;
}

async function markOnlineOrderPaid(
  sql: Sql,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const reference = session.metadata?.checkout_attempt_id;
  if (!reference || !z.string().uuid().safeParse(reference).success) {
    throw new SafeProcessingError("invalid_checkout_reference");
  }
  if (session.payment_status !== "paid") return;

  const rows = (await sql`
    SELECT checkout_attempt_id, cart_fingerprint, stripe_session_id,
           payment_status, currency, subtotal_cents, shipping_cents,
           total_cents, items_json
    FROM online_orders
    WHERE checkout_attempt_id = ${reference}::uuid
    LIMIT 1
  `) as unknown as OnlineOrderRow[];
  const order = rows[0];
  if (!order) throw new SafeProcessingError("online_order_not_found");
  if (!order.stripe_session_id || order.stripe_session_id !== session.id) {
    throw new SafeProcessingError("stripe_session_mismatch");
  }
  if (
    session.currency !== order.currency ||
    session.amount_total !== Number(order.total_cents)
  ) {
    throw new SafeProcessingError("amount_or_currency_mismatch");
  }

  const shipping =
    session.collected_information?.shipping_details ?? session.shipping_details ?? null;
  const address = shipping?.address ?? null;
  const customerName =
    shipping?.name?.trim() || session.customer_details?.name?.trim() || null;
  const customerEmail =
    session.customer_details?.email?.trim().toLowerCase() || null;
  const customerPhone = session.customer_details?.phone?.trim() || null;
  if (
    !customerName ||
    !customerEmail ||
    !address?.line1 ||
    !address.city ||
    !address.state ||
    !address.postal_code
  ) {
    throw new SafeProcessingError("required_customer_details_missing");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const addressJson = JSON.stringify({
    street: address.line2 ? `${address.line1}, ${address.line2}` : address.line1,
    city: address.city,
    state: address.state,
    zip: address.postal_code,
    country: address.country ?? "US",
  });

  const updated = (await sql`
    UPDATE online_orders
    SET payment_status = 'paid',
        fulfillment_status = CASE
          WHEN fulfillment_status = 'new' THEN 'processing'
          ELSE fulfillment_status
        END,
        stripe_payment_intent_id = ${paymentIntentId},
        customer_name = ${customerName},
        customer_email = ${customerEmail},
        customer_phone = ${customerPhone},
        shipping_address_json = ${addressJson}::jsonb,
        paid_at = COALESCE(paid_at, NOW()),
        updated_at = NOW()
    WHERE checkout_attempt_id = ${reference}::uuid
      AND stripe_session_id = ${session.id}
      AND currency = ${session.currency}
      AND total_cents = ${session.amount_total}
    RETURNING checkout_attempt_id
  `) as unknown as Array<{ checkout_attempt_id: string }>;
  if (!updated[0]) throw new SafeProcessingError("paid_order_update_failed");
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return text("Method not allowed", 405, { Allow: "POST" });
  }
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.DATABASE_URL) {
    return text("Stripe not configured", 503);
  }

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) return text("Missing signature", 400);

  let event: Stripe.Event;
  try {
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BODY_BYTES);
    event = await stripeClient(env).webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    console.error("[WEBHOOK] signature verification failed");
    return text("Invalid signature", 400);
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return json({ received: true });
  }

  const sql = neon(env.DATABASE_URL);
  let claim: "claimed" | "completed" | "busy";
  try {
    claim = await claimWebhookEvent(sql, event.id, event.type);
  } catch {
    return text("Webhook processing unavailable", 500);
  }
  if (claim === "completed") return json({ received: true, duplicate: true });
  if (claim === "busy") return text("Webhook already processing", 409);

  try {
    await markOnlineOrderPaid(sql, event.data.object);
    await finishWebhookEvent(sql, event.id);
    console.log(`[WEBHOOK] processed ${event.type} event …${event.id.slice(-8)}`);
    return json({ received: true });
  } catch (error) {
    try {
      await failWebhookEvent(sql, event.id, error);
    } catch {
      console.error(`[WEBHOOK] receipt update failed for event …${event.id.slice(-8)}`);
    }
    console.error(
      `[WEBHOOK] processing failed for event …${event.id.slice(-8)} (${safeErrorCode(error)})`,
    );
    return text("Webhook processing failed", 500);
  }
}

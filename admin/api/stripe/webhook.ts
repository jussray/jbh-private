import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { storage } from "../_lib/storage";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../_lib/stripe";

// Stripe signature verification requires the exact raw request bytes.
export const config = { api: { bodyParser: false } };

const MAX_WEBHOOK_BYTES = 1024 * 1024;

class WebhookProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "WebhookProcessingError";
  }
}

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_WEBHOOK_BYTES) {
        reject(new WebhookProcessingError("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getSignatureHeader(req: VercelRequest): string | null {
  const value = req.headers["stripe-signature"];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  try {
    return (await storage.findProcessedEvent(eventId)) !== null;
  } catch {
    // Fail open here only so the actual order mutation can fail and trigger a
    // Stripe retry rather than silently discarding a legitimate payment.
    return false;
  }
}

function safeFailureCode(error: unknown): string {
  if (error instanceof WebhookProcessingError) return error.code;
  if (error instanceof Error) return error.name.slice(0, 80) || "Error";
  return "UnknownError";
}

async function writeToDlq(
  eventId: string,
  eventType: string,
  error: unknown,
): Promise<void> {
  try {
    await storage.upsertFailedWebhookEvent({
      stripeEventId: eventId,
      eventType,
      // Store a bounded non-sensitive code, never a raw exception message.
      lastError: safeFailureCode(error),
    });
  } catch {
    const safeId = eventId.slice(-8);
    console.error(`[WEBHOOK] DLQ write failed for event …${safeId}`);
  }
}

async function markCheckoutPaid(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderId = Number(session.metadata?.order_id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw new WebhookProcessingError("invalid_order_reference");
  }

  if (session.payment_status !== "paid") return;

  const order = await storage.getOrder(orderId);
  if (!order) throw new WebhookProcessingError("order_not_found");

  if (order.stripeSessionId && order.stripeSessionId !== session.id) {
    throw new WebhookProcessingError("session_mismatch");
  }

  const expectedAmount = Math.round(order.total * 100);
  if (session.currency !== "usd" || session.amount_total !== expectedAmount) {
    throw new WebhookProcessingError("amount_or_currency_mismatch");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : null;

  const updated = await storage.markOrderPaid(
    orderId,
    session.id,
    paymentIntentId,
  );
  if (!updated) throw new WebhookProcessingError("order_update_failed");

  const safeId = event.id.slice(-8);
  console.log(
    `[WEBHOOK] payment confirmed — order #${updated.id} — event …${safeId}`,
  );
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await markCheckoutPaid(
        event,
        event.data.object as Stripe.Checkout.Session,
      );
      return;
    default:
      // Stripe sends many event types. Unknown types are acknowledged without
      // logging payloads or customer information.
      return;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method not allowed");
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.error("[WEBHOOK] Stripe bindings are not configured");
    return res.status(503).send("Stripe not configured");
  }

  const signature = getSignatureHeader(req);
  if (!signature) return res.status(400).send("Missing signature");

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    console.error("[WEBHOOK] Signature verification failed");
    return res.status(400).send("Invalid signature");
  }

  if (await alreadyProcessed(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
    await storage.createProcessedEvent(event.id);
    return res.status(200).json({ received: true });
  } catch (error) {
    await writeToDlq(event.id, event.type, error);
    const safeId = event.id.slice(-8);
    console.error(
      `[WEBHOOK] Processing failed for event …${safeId} (${event.type})`,
    );
    return res.status(500).send("Webhook processing failed");
  }
}

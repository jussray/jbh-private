/**
 * admin/api/stripe/webhook.ts
 *
 * Hardened Stripe webhook handler.
 *
 * Security & reliability properties:
 *  ✓ Raw body verified against stripe-signature BEFORE any processing
 *  ✓ Idempotency — skips events already in processed_stripe_events
 *  ✓ HTTP 500 on internal errors so Stripe retries (never swallowed 200)
 *  ✓ Dead-letter — failed events written to failed_webhook_events
 *  ✓ No PII in logs — only last 8 chars of event_id logged
 *
 * No Cloudflare Access protection on this route.
 * Stripe cannot authenticate through Access — protect via signature only.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { storage } from "../_lib/storage";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../_lib/stripe";

// Tell Vercel: do NOT parse the body. Raw Buffer required for signature check.
export const config = { api: { bodyParser: false } };

// ─── Raw body reader ────────────────────────────────────────────────────────

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ─── Idempotency helpers ────────────────────────────────────────────────────

/**
 * Returns true if this event has already been successfully processed.
 * Uses the processed_stripe_events table as the idempotency store.
 */
async function alreadyProcessed(eventId: string): Promise<boolean> {
  try {
    // storage.findProcessedEvent returns the row if found, null if not.
    const existing = await storage.findProcessedEvent(eventId);
    return existing !== null;
  } catch {
    // On DB read error, assume not processed — safer to process twice
    // than to silently drop a payment event.
    return false;
  }
}

/**
 * Marks an event as successfully processed.
 * Called AFTER the handler logic succeeds.
 */
async function markProcessed(eventId: string): Promise<void> {
  await storage.createProcessedEvent(eventId);
}

/**
 * Writes a failed event to the dead-letter queue.
 * Called INSTEAD of markProcessed when handler logic throws.
 */
async function writeToDlq(eventId: string, type: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await storage.upsertFailedWebhookEvent({
      stripeEventId: eventId,
      eventType: type,
      lastError: message,
    });
  } catch (dlqErr) {
    // Last resort — DLQ write itself failed. Log only, never throw.
    const safe = eventId.slice(-8);
    console.error(`[WEBHOOK] DLQ write failed for event …${safe}`);
  }
}

// ─── Event handler ──────────────────────────────────────────────────────────

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderIdRaw = session.metadata?.order_id;
      const orderId = orderIdRaw ? Number(orderIdRaw) : NaN;

      if (Number.isNaN(orderId)) {
        // No order_id in metadata — not our session, skip silently
        return;
      }

      if (session.payment_status !== "paid") {
        // Session completed but payment not collected — skip
        return;
      }

      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null;

      const order = await storage.markOrderPaid(orderId, session.id, piId);

      if (order) {
        // Log order reference and amount ONLY — no email, no name
        const safe = event.id.slice(-8);
        console.log(
          `[WEBHOOK] checkout.session.completed — order #${order.id}` +
          ` — total $${order.total} — event …${safe}`
        );
      }
      break;
    }

    // Add future event types here.
    // Each case should be idempotent and never log PII.

    default:
      // Unknown event type — not an error, Stripe sends many we don't handle
      break;
  }
}

// ─── Main handler ───────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.error("[WEBHOOK] Stripe not configured — check env bindings");
    return res.status(503).send("Stripe not configured");
  }

  // ── Step 1: Signature verification against raw body ──────────────────────
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing stripe-signature header");

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    // Signature failure — 400 tells Stripe this is a permanent rejection (no retry)
    console.error("[WEBHOOK] Signature verification failed — possible replay or misconfiguration");
    return res.status(400).send("Invalid signature");
  }

  // ── Step 2: Idempotency check ─────────────────────────────────────────────
  if (await alreadyProcessed(event.id)) {
    // Already handled — acknowledge without reprocessing
    return res.status(200).json({ received: true, duplicate: true });
  }

  // ── Step 3: Handle the event ──────────────────────────────────────────────
  try {
    await handleEvent(event);
    await markProcessed(event.id);
    return res.status(200).json({ received: true });
  } catch (err) {
    // Handler failed — write to dead-letter, return 500 so Stripe retries
    await writeToDlq(event.id, event.type, err);
    const safe = event.id.slice(-8);
    console.error(`[WEBHOOK] Handler error for event …${safe} (${event.type}) — written to DLQ`);
    return res.status(500).send("Internal error — will retry");
  }
}

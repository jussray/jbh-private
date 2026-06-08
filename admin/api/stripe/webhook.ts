// POST /api/stripe/webhook
// Stripe sends events here. Must use raw body for signature verification.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { storage } from "../_lib/storage";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../_lib/stripe";

// Tell Vercel: don't parse the body. We need the raw Buffer to verify signature.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Stripe not configured");
  }
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing signature");

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[Stripe webhook] signature verification failed:", err);
    return res.status(400).send("Invalid signature");
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderIdRaw = session.metadata?.order_id;
      const orderId = orderIdRaw ? Number(orderIdRaw) : NaN;
      if (!Number.isNaN(orderId) && session.payment_status === "paid") {
        const piId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null;
        const order = await storage.markOrderPaid(orderId, session.id, piId);
        if (order) {
          console.log(
            `[STRIPE] order #${order.id} paid — total $${order.total} — ${order.email}`
          );
        }
      }
    }
  } catch (e) {
    console.error("[Stripe webhook] handler error:", e);
    // Still 200 so Stripe doesn't retry for internal bugs
  }
  return res.status(200).json({ received: true });
}

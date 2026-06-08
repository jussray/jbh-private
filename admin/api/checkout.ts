// POST /api/checkout
// Creates an order in Postgres and a Stripe Checkout Session.
// Returns { orderId, url } — client redirects to Stripe's hosted page.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { storage } from "./_lib/storage";
import { stripe, PUBLIC_URL } from "./_lib/stripe";
import { insertOrderSchema } from "../shared/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!stripe) return res.status(503).json({ error: "Payments not configured" });
  if (!PUBLIC_URL) return res.status(503).json({ error: "PUBLIC_URL not configured" });

  const parsed = insertOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  // Recompute totals server-side. Never trust client.
  const items = parsed.data.itemsJson as Array<{
    id: string;
    name: string;
    variant?: string;
    price: number;
    qty: number;
    image?: string;
  }>;

  const subtotal = items.reduce(
    (sum, it) => sum + Number(it.price) * Number(it.qty),
    0
  );
  const shipping = subtotal >= 150 ? 0 : 9.99;
  const total = Math.round((subtotal + shipping) * 100) / 100;

  try {
    // 1) Persist the order (unpaid)
    const order = await storage.createOrder({
      ...parsed.data,
      subtotal,
      shipping,
      total,
    });

    // 2) Build Stripe line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map(
      (it) => ({
        quantity: it.qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(it.price * 100),
          product_data: {
            name: it.variant ? `${it.name} (${it.variant})` : it.name,
            images: it.image ? [`${PUBLIC_URL}${it.image}`] : undefined,
          },
        },
      })
    );
    if (shipping > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(shipping * 100),
          product_data: { name: "Shipping" },
        },
      });
    }

    // 3) Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: order.email,
      metadata: { order_id: String(order.id) },
      success_url: `${PUBLIC_URL}/#/confirmation/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/#/cart?canceled=1`,
    });

    // 4) Save session id on the order
    await storage.attachStripeSession(order.id, session.id);

    console.log(
      `[CHECKOUT] order #${order.id} — Stripe session ${session.id} — $${total}`
    );

    return res.status(200).json({ orderId: order.id, url: session.url });
  } catch (e: any) {
    console.error("[CHECKOUT] failed:", e?.message ?? e);
    return res
      .status(500)
      .json({ error: "Checkout failed", detail: e?.message ?? "unknown" });
  }
}

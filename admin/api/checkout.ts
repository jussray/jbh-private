// POST /api/checkout
// Creates an unpaid order from server-authoritative catalog data, then creates
// a Stripe Checkout Session. Customer-supplied names and prices are ignored.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { storage } from "./_lib/storage";
import { stripe, PUBLIC_URL } from "./_lib/stripe";
import { insertOrderSchema } from "../shared/schema";
import { getProduct } from "../client/src/lib/catalog";

const FREE_SHIPPING_THRESHOLD = 150;
const FLAT_SHIPPING = 9.99;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!stripe) return res.status(503).json({ error: "Payments not configured" });
  if (!PUBLIC_URL) return res.status(503).json({ error: "Store URL not configured" });

  let storeUrl: URL;
  try {
    storeUrl = new URL(PUBLIC_URL);
  } catch {
    return res.status(503).json({ error: "Store URL not configured" });
  }

  const requestOrigin = req.headers.origin;
  if (requestOrigin && requestOrigin !== storeUrl.origin) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", storeUrl.origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");

  const parsed = insertOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid checkout details" });
  }

  const canonicalItems = [] as Array<{
    id: string;
    name: string;
    variant: string;
    price: number;
    qty: number;
    image: string;
  }>;

  for (const requested of parsed.data.itemsJson) {
    const product = getProduct(requested.id);
    const variant = product?.variants.find(
      (candidate) => candidate.option === requested.variant,
    );

    if (!product || !variant) {
      return res.status(400).json({ error: "Cart contains an unavailable item" });
    }

    canonicalItems.push({
      id: product.id,
      name: product.name,
      variant: variant.option,
      price: variant.price,
      qty: requested.qty,
      image: product.image,
    });
  }

  const subtotal = Number(
    canonicalItems
      .reduce((sum, item) => sum + item.price * item.qty, 0)
      .toFixed(2),
  );
  const shipping =
    subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
  const total = Number((subtotal + shipping).toFixed(2));

  try {
    const order = await storage.createOrder({
      customerName: parsed.data.customerName,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone,
      addressJson: parsed.data.addressJson,
      itemsJson: canonicalItems,
      subtotal,
      shipping,
      total,
      notes: parsed.data.notes || null,
    });

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      canonicalItems.map((item) => ({
        quantity: item.qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(item.price * 100),
          product_data: {
            name: `${item.name} (${item.variant})`,
            images: [new URL(item.image, storeUrl).toString()],
          },
        },
      }));

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

    const orderMetadata = { order_id: String(order.id) };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lineItems,
        customer_email: order.email,
        billing_address_collection: "required",
        shipping_address_collection: { allowed_countries: ["US"] },
        phone_number_collection: { enabled: true },
        metadata: orderMetadata,
        payment_intent_data: { metadata: orderMetadata },
        success_url: `${storeUrl.origin}/#/confirmation/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${storeUrl.origin}/#/cart?canceled=1`,
      },
      { idempotencyKey: `jbh-order-${order.id}` },
    );

    await storage.attachStripeSession(order.id, session.id);

    console.log(`[CHECKOUT] created order #${order.id} — total $${total}`);
    return res.status(200).json({ orderId: order.id, url: session.url });
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`[CHECKOUT] failed — ${errorType}`);
    return res.status(500).json({ error: "Checkout failed" });
  }
}

import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import { z } from "zod";
import { getProduct } from "../../client/src/lib/catalog";
import {
  checkoutCors,
  checkoutSchema,
  configuredStoreOrigin,
  FLAT_SHIPPING_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
  json,
  MAX_CHECKOUT_BODY_BYTES,
  type Env,
  type OnlineOrderRow,
  readBoundedText,
  safeErrorCode,
  SafeProcessingError,
  sha256Hex,
  type StoredItem,
  stripeClient,
  text,
} from "./shared";

export async function handleCheckout(request: Request, env: Env): Promise<Response> {
  const storeOrigin = configuredStoreOrigin(env);
  if (!storeOrigin || !env.DATABASE_URL || !env.STRIPE_SECRET_KEY) {
    return json({ error: "Payments are not configured" }, 503);
  }

  const requestOrigin = request.headers.get("Origin");
  if (!requestOrigin || requestOrigin !== storeOrigin) {
    return json({ error: "Origin not allowed" }, 403);
  }
  const cors = checkoutCors(requestOrigin);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...cors, "Cache-Control": "no-store" },
    });
  }
  if (request.method !== "POST") {
    return text("Method not allowed", 405, { ...cors, Allow: "POST, OPTIONS" });
  }

  let input: z.infer<typeof checkoutSchema>;
  try {
    const raw = await readBoundedText(request, MAX_CHECKOUT_BODY_BYTES);
    const parsed = checkoutSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json({ error: "Invalid cart" }, 400, cors);
    input = parsed.data;
  } catch (error) {
    const oversized = safeErrorCode(error) === "payload_too_large";
    return json(
      { error: oversized ? "Request too large" : "Invalid request" },
      oversized ? 413 : 400,
      cors,
    );
  }

  const canonicalItems: StoredItem[] = [];
  const itemImages = new Map<string, string>();
  for (const requested of input.items) {
    const product = getProduct(requested.id);
    const variant = product?.variants.find(
      (candidate) => candidate.option === requested.variant,
    );
    if (!product || !variant) {
      return json({ error: "Cart contains an unavailable item" }, 400, cors);
    }
    canonicalItems.push({
      id: product.id,
      name: product.name,
      variant: variant.option,
      priceCents: Math.round(variant.price * 100),
      quantity: requested.quantity,
    });
    itemImages.set(
      `${product.id}\u0000${variant.option}`,
      new URL(product.image, storeOrigin).toString(),
    );
  }

  const subtotalCents = canonicalItems.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const shippingCents =
    subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
  const totalCents = subtotalCents + shippingCents;
  const canonicalJson = JSON.stringify(canonicalItems);
  const cartFingerprint = await sha256Hex(canonicalJson);
  const sql = neon(env.DATABASE_URL);

  try {
    await sql`
      INSERT INTO online_orders (
        checkout_attempt_id, cart_fingerprint, currency, subtotal_cents,
        shipping_cents, total_cents, items_json
      ) VALUES (
        ${input.checkoutAttemptId}::uuid, ${cartFingerprint}, 'usd',
        ${subtotalCents}, ${shippingCents}, ${totalCents}, ${canonicalJson}::jsonb
      )
      ON CONFLICT (checkout_attempt_id) DO NOTHING
    `;

    const rows = (await sql`
      SELECT checkout_attempt_id, cart_fingerprint, stripe_session_id,
             payment_status, currency, subtotal_cents, shipping_cents,
             total_cents, items_json
      FROM online_orders
      WHERE checkout_attempt_id = ${input.checkoutAttemptId}::uuid
      LIMIT 1
    `) as unknown as OnlineOrderRow[];
    const order = rows[0];
    if (!order) throw new SafeProcessingError("checkout_record_missing");
    if (
      order.cart_fingerprint !== cartFingerprint ||
      order.currency !== "usd" ||
      Number(order.total_cents) !== totalCents
    ) {
      return json({ error: "Checkout attempt conflict" }, 409, cors);
    }

    const stripe = stripeClient(env);
    if (order.stripe_session_id) {
      const prior = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (prior.url && prior.status === "open") {
        return json({ url: prior.url }, 200, cors);
      }
      return json(
        { error: "Checkout attempt expired. Return to cart and try again." },
        409,
        cors,
      );
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      canonicalItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: item.priceCents,
          product_data: {
            name: `${item.name} (${item.variant})`,
            images: [itemImages.get(`${item.id}\u0000${item.variant}`) ?? storeOrigin],
          },
        },
      }));

    if (shippingCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: shippingCents,
          product_data: { name: "Shipping" },
        },
      });
    }

    const reference = input.checkoutAttemptId;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_creation: "always",
        line_items: lineItems,
        billing_address_collection: "required",
        shipping_address_collection: { allowed_countries: ["US"] },
        phone_number_collection: { enabled: true },
        client_reference_id: reference,
        metadata: { checkout_attempt_id: reference },
        payment_intent_data: {
          metadata: { checkout_attempt_id: reference },
        },
        // Promotion codes remain disabled until discounts are modeled in the
        // private order ledger and included in webhook amount reconciliation.
        success_url: `${storeOrigin}/#/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${storeOrigin}/#/cart`,
      },
      { idempotencyKey: `jbh-checkout-${reference}` },
    );
    if (!session.url) throw new SafeProcessingError("stripe_session_url_missing");

    const attached = (await sql`
      UPDATE online_orders
      SET stripe_session_id = ${session.id}, updated_at = NOW()
      WHERE checkout_attempt_id = ${reference}::uuid
        AND (stripe_session_id IS NULL OR stripe_session_id = ${session.id})
      RETURNING checkout_attempt_id
    `) as unknown as Array<{ checkout_attempt_id: string }>;
    if (!attached[0]) throw new SafeProcessingError("stripe_session_attach_conflict");

    return json({ url: session.url }, 200, cors);
  } catch (error) {
    console.error(`[CHECKOUT] failed (${safeErrorCode(error)})`);
    return json({ error: "Checkout failed. Please try again." }, 500, cors);
  }
}

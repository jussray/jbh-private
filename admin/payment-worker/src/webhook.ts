import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import { getProduct } from "../../client/src/lib/catalog";
import {
  type Env,
  json,
  MAX_WEBHOOK_BYTES,
  readBoundedText,
  safeErrorCode,
  SafeProcessingError,
  stripeClient,
  text,
} from "./shared";

const FREE_SHIPPING_THRESHOLD = 150;
const FLAT_SHIPPING = 9.99;
const CHECKOUT_ATTEMPT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ShippingAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

interface ShippingDetails {
  name?: string | null;
  address?: ShippingAddress | null;
}

type CheckoutSessionWithCollectedInformation = Stripe.Checkout.Session & {
  collected_information?: {
    shipping_details?: ShippingDetails | null;
  } | null;
  shipping_details?: ShippingDetails | null;
};

type Sql = ReturnType<typeof neon<false, false>>;

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

function expandedProduct(lineItem: Stripe.LineItem): Stripe.Product | null {
  const product = lineItem.price?.product;
  if (!product || typeof product === "string") return null;
  if ("deleted" in product && product.deleted) return null;
  return product;
}

function shippingDetails(
  session: CheckoutSessionWithCollectedInformation,
): ShippingDetails | null {
  return (
    session.collected_information?.shipping_details ??
    session.shipping_details ??
    null
  );
}

function money(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

async function alreadyProcessed(sql: Sql, eventId: string): Promise<boolean> {
  try {
    const rows = (await sql`
      SELECT stripe_event_id
      FROM processed_stripe_events
      WHERE stripe_event_id = ${eventId}
      LIMIT 1
    `) as unknown as Array<{ stripe_event_id: string }>;
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

async function markProcessed(sql: Sql, eventId: string): Promise<void> {
  await sql`
    INSERT INTO processed_stripe_events (stripe_event_id)
    VALUES (${eventId})
    ON CONFLICT (stripe_event_id) DO NOTHING
  `;
}

async function writeToDlq(
  sql: Sql,
  eventId: string,
  eventType: string,
  error: unknown,
): Promise<void> {
  try {
    await sql`
      INSERT INTO failed_webhook_events (
        stripe_event_id, event_type, retry_count, last_error, resolved
      ) VALUES (
        ${eventId}, ${eventType}, 1, ${safeErrorCode(error)}, false
      )
      ON CONFLICT (stripe_event_id) DO UPDATE SET
        event_type = EXCLUDED.event_type,
        failed_at = NOW(),
        retry_count = failed_webhook_events.retry_count + 1,
        last_error = EXCLUDED.last_error,
        resolved = false,
        resolved_at = NULL
    `;
  } catch {
    console.error(`[WEBHOOK] DLQ write failed for event …${eventId.slice(-8)}`);
  }
}

async function markLegacyCheckoutPaid(
  sql: Sql,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  orderId: number,
): Promise<void> {
  if (session.payment_status !== "paid") return;

  const rows = (await sql`
    SELECT id, total, stripe_session_id
    FROM orders
    WHERE id = ${orderId}
    LIMIT 1
  `) as unknown as Array<{
    id: number;
    total: number | string;
    stripe_session_id: string | null;
  }>;
  const order = rows[0];
  if (!order) throw new SafeProcessingError("order_not_found");
  if (order.stripe_session_id && order.stripe_session_id !== session.id) {
    throw new SafeProcessingError("session_mismatch");
  }

  const expectedAmount = Math.round(Number(order.total) * 100);
  if (session.currency !== "usd" || session.amount_total !== expectedAmount) {
    throw new SafeProcessingError("amount_or_currency_mismatch");
  }

  const updated = (await sql`
    UPDATE orders
    SET payment_status = 'paid',
        stripe_session_id = ${session.id},
        stripe_payment_intent_id = ${paymentIntentId(session)},
        status = 'processing'
    WHERE id = ${orderId}
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  if (!updated[0]) throw new SafeProcessingError("order_update_failed");

  console.log(
    `[WEBHOOK] payment confirmed - order #${updated[0].id} - event …${event.id.slice(-8)}`,
  );
}

async function createOrderFromHostedCheckout(
  sql: Sql,
  stripe: Stripe,
  event: Stripe.Event,
  eventSession: Stripe.Checkout.Session,
  checkoutAttemptId: string,
): Promise<void> {
  if (!CHECKOUT_ATTEMPT_ID.test(checkoutAttemptId)) {
    throw new SafeProcessingError("invalid_checkout_attempt_id");
  }

  const retrieved = (await stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["line_items.data.price.product"],
  })) as CheckoutSessionWithCollectedInformation;

  if (retrieved.payment_status !== "paid") return;
  if (
    retrieved.metadata?.checkout_attempt_id !== checkoutAttemptId ||
    retrieved.client_reference_id !== checkoutAttemptId
  ) {
    throw new SafeProcessingError("checkout_attempt_mismatch");
  }
  if (retrieved.currency !== "usd") {
    throw new SafeProcessingError("amount_or_currency_mismatch");
  }

  const lineItems = retrieved.line_items?.data;
  if (!lineItems?.length) throw new SafeProcessingError("missing_line_items");

  const items: Array<{
    id: string;
    name: string;
    variant: string;
    price: number;
    qty: number;
    image: string;
    assignedVendorId: string;
    routeId: string;
    vendorSku: string;
    vendorUnitCost: number;
    vendorStatus: "unassigned";
  }> = [];
  let subtotalCents = 0;
  let shippingCents = 0;

  for (const lineItem of lineItems) {
    const product = expandedProduct(lineItem);
    const metadata = product?.metadata;
    const quantity = lineItem.quantity;
    const unitAmount = lineItem.price?.unit_amount;

    if (!product || !metadata || !quantity || quantity < 1 || !unitAmount) {
      throw new SafeProcessingError("invalid_line_item");
    }

    if (metadata.kind === "shipping") {
      if (shippingCents !== 0 || quantity !== 1) {
        throw new SafeProcessingError("invalid_shipping_line");
      }
      shippingCents = unitAmount;
      continue;
    }

    if (metadata.kind !== "product") {
      throw new SafeProcessingError("unknown_line_item_kind");
    }

    const productId = metadata.product_id;
    const variantName = metadata.variant;
    const canonicalProduct = productId ? getProduct(productId) : undefined;
    const canonicalVariant = canonicalProduct?.variants.find(
      (candidate) => candidate.option === variantName,
    );

    if (!canonicalProduct || !canonicalVariant) {
      throw new SafeProcessingError("catalog_item_not_found");
    }

    const canonicalUnitAmount = Math.round(canonicalVariant.price * 100);
    if (unitAmount !== canonicalUnitAmount) {
      throw new SafeProcessingError("catalog_price_mismatch");
    }

    subtotalCents += canonicalUnitAmount * quantity;
    items.push({
      id: canonicalProduct.id,
      name: canonicalProduct.name,
      variant: canonicalVariant.option,
      price: canonicalVariant.price,
      qty: quantity,
      image: canonicalProduct.image,
      assignedVendorId: "",
      routeId: "",
      vendorSku: "",
      vendorUnitCost: 0,
      vendorStatus: "unassigned",
    });
  }

  if (!items.length) throw new SafeProcessingError("empty_order");

  const expectedShippingCents =
    subtotalCents >= FREE_SHIPPING_THRESHOLD * 100
      ? 0
      : Math.round(FLAT_SHIPPING * 100);
  if (shippingCents !== expectedShippingCents) {
    throw new SafeProcessingError("shipping_mismatch");
  }

  const expectedSubtotalCents = subtotalCents + shippingCents;
  if (retrieved.amount_subtotal !== expectedSubtotalCents) {
    throw new SafeProcessingError("subtotal_mismatch");
  }

  const discountCents = retrieved.total_details?.amount_discount ?? 0;
  const taxCents = retrieved.total_details?.amount_tax ?? 0;
  const stripeShippingCents = retrieved.total_details?.amount_shipping ?? 0;
  const expectedTotalCents =
    expectedSubtotalCents - discountCents + taxCents + stripeShippingCents;
  if (
    stripeShippingCents !== 0 ||
    retrieved.amount_total !== expectedTotalCents
  ) {
    throw new SafeProcessingError("total_mismatch");
  }

  const customer = retrieved.customer_details;
  const delivery = shippingDetails(retrieved);
  const address = delivery?.address;
  const customerName = (delivery?.name ?? customer?.name ?? "").trim();
  const email = (customer?.email ?? "").trim().toLowerCase();
  const phone = (customer?.phone ?? "").trim();
  const street = [address?.line1, address?.line2]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
  const city = (address?.city ?? "").trim();
  const state = (address?.state ?? "").trim();
  const zip = (address?.postal_code ?? "").trim();

  if (
    !customerName ||
    !email ||
    !phone ||
    !street ||
    !city ||
    !state ||
    !zip ||
    address?.country !== "US"
  ) {
    throw new SafeProcessingError("missing_customer_or_shipping_details");
  }

  const notes = [
    `Checkout attempt: ${checkoutAttemptId}`,
    discountCents > 0
      ? `Stripe promotion discount: $${money(discountCents).toFixed(2)}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const itemsJson = JSON.stringify(items);
  const addressJson = JSON.stringify({ street, city, state, zip });
  const created = (await sql`
    INSERT INTO orders (
      customer_name, email, phone, address_json, items_json,
      subtotal, shipping, total, notes, status, stripe_session_id,
      stripe_payment_intent_id, payment_status
    ) VALUES (
      ${customerName}, ${email}, ${phone}, ${addressJson}::jsonb,
      ${itemsJson}::jsonb, ${money(subtotalCents)}, ${money(shippingCents)},
      ${money(retrieved.amount_total ?? 0)}, ${notes}, 'processing',
      ${retrieved.id}, ${paymentIntentId(retrieved)}, 'paid'
    )
    ON CONFLICT (stripe_session_id) DO NOTHING
    RETURNING id, payment_status
  `) as unknown as Array<{ id: number; payment_status: string }>;

  if (!created[0]) {
    const existing = (await sql`
      SELECT id, payment_status
      FROM orders
      WHERE stripe_session_id = ${retrieved.id}
      LIMIT 1
    `) as unknown as Array<{ id: number; payment_status: string }>;
    if (!existing[0] || existing[0].payment_status !== "paid") {
      throw new SafeProcessingError("existing_order_not_paid");
    }
    console.log(
      `[WEBHOOK] duplicate hosted checkout retained - order #${existing[0].id} - event …${event.id.slice(-8)}`,
    );
    return;
  }

  console.log(
    `[WEBHOOK] hosted checkout reconciled - order #${created[0].id} - event …${event.id.slice(-8)}`,
  );
}

async function reconcileCheckoutPayment(
  sql: Sql,
  stripe: Stripe,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const rawOrderId = session.metadata?.order_id;
  if (rawOrderId) {
    const orderId = Number(rawOrderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      throw new SafeProcessingError("invalid_order_reference");
    }
    await markLegacyCheckoutPaid(sql, event, session, orderId);
    return;
  }

  const checkoutAttemptId = session.metadata?.checkout_attempt_id;
  if (!checkoutAttemptId) {
    throw new SafeProcessingError("missing_order_reference");
  }

  await createOrderFromHostedCheckout(sql, stripe, event, session, checkoutAttemptId);
}

async function handleEvent(
  sql: Sql,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await reconcileCheckoutPayment(
        sql,
        stripe,
        event,
        event.data.object as Stripe.Checkout.Session,
      );
      return;
    default:
      return;
  }
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return text("Method not allowed", 405, { Allow: "POST" });
  }
  if (!env.DATABASE_URL || !env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    console.error("[WEBHOOK] required bindings are not configured");
    return text("Stripe not configured", 503);
  }

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) return text("Missing signature", 400);

  const stripe = stripeClient(env);
  let event: Stripe.Event;
  try {
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    event = await stripe.webhooks.constructEventAsync(
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

  const sql = neon(env.DATABASE_URL);
  if (await alreadyProcessed(sql, event.id)) {
    return json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(sql, stripe, event);
    await markProcessed(sql, event.id);
    return json({ received: true });
  } catch (error) {
    await writeToDlq(sql, event.id, event.type, error);
    console.error(
      `[WEBHOOK] processing failed for event …${event.id.slice(-8)} (${safeErrorCode(error)})`,
    );
    return text("Webhook processing failed", 500);
  }
}

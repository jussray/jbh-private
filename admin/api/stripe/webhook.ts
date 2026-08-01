import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getProduct } from "../../client/src/lib/catalog";
import { storage } from "../_lib/storage";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../_lib/stripe";

// Stripe signature verification requires the exact raw request bytes.
export const config = { api: { bodyParser: false } };

const MAX_WEBHOOK_BYTES = 1024 * 1024;
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

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

async function markLegacyCheckoutPaid(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  orderId: number,
): Promise<void> {
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

  const updated = await storage.markOrderPaid(
    orderId,
    session.id,
    paymentIntentId(session),
  );
  if (!updated) throw new WebhookProcessingError("order_update_failed");

  const safeId = event.id.slice(-8);
  console.log(
    `[WEBHOOK] payment confirmed - order #${updated.id} - event …${safeId}`,
  );
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

async function createOrderFromHostedCheckout(
  event: Stripe.Event,
  eventSession: Stripe.Checkout.Session,
  checkoutAttemptId: string,
): Promise<void> {
  if (!stripe) throw new WebhookProcessingError("stripe_not_configured");
  if (!CHECKOUT_ATTEMPT_ID.test(checkoutAttemptId)) {
    throw new WebhookProcessingError("invalid_checkout_attempt_id");
  }

  const retrieved = (await stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["line_items.data.price.product"],
  })) as CheckoutSessionWithCollectedInformation;

  if (retrieved.payment_status !== "paid") return;
  if (
    retrieved.metadata?.checkout_attempt_id !== checkoutAttemptId ||
    retrieved.client_reference_id !== checkoutAttemptId
  ) {
    throw new WebhookProcessingError("checkout_attempt_mismatch");
  }
  if (retrieved.currency !== "usd") {
    throw new WebhookProcessingError("amount_or_currency_mismatch");
  }

  const lineItems = retrieved.line_items?.data;
  if (!lineItems?.length) {
    throw new WebhookProcessingError("missing_line_items");
  }

  const items: Array<{
    id: string;
    name: string;
    variant: string;
    price: number;
    qty: number;
    image: string;
  }> = [];
  let subtotalCents = 0;
  let shippingCents = 0;

  for (const lineItem of lineItems) {
    const product = expandedProduct(lineItem);
    const metadata = product?.metadata;
    const quantity = lineItem.quantity;
    const unitAmount = lineItem.price?.unit_amount;

    if (!product || !metadata || !quantity || quantity < 1 || !unitAmount) {
      throw new WebhookProcessingError("invalid_line_item");
    }

    if (metadata.kind === "shipping") {
      if (shippingCents !== 0 || quantity !== 1) {
        throw new WebhookProcessingError("invalid_shipping_line");
      }
      shippingCents = unitAmount;
      continue;
    }

    if (metadata.kind !== "product") {
      throw new WebhookProcessingError("unknown_line_item_kind");
    }

    const productId = metadata.product_id;
    const variantName = metadata.variant;
    const canonicalProduct = productId ? getProduct(productId) : undefined;
    const canonicalVariant = canonicalProduct?.variants.find(
      (candidate) => candidate.option === variantName,
    );

    if (!canonicalProduct || !canonicalVariant) {
      throw new WebhookProcessingError("catalog_item_not_found");
    }

    const canonicalUnitAmount = Math.round(canonicalVariant.price * 100);
    if (unitAmount !== canonicalUnitAmount) {
      throw new WebhookProcessingError("catalog_price_mismatch");
    }

    subtotalCents += canonicalUnitAmount * quantity;
    items.push({
      id: canonicalProduct.id,
      name: canonicalProduct.name,
      variant: canonicalVariant.option,
      price: canonicalVariant.price,
      qty: quantity,
      image: canonicalProduct.image,
    });
  }

  if (!items.length) throw new WebhookProcessingError("empty_order");

  const expectedShippingCents =
    subtotalCents >= FREE_SHIPPING_THRESHOLD * 100
      ? 0
      : Math.round(FLAT_SHIPPING * 100);
  if (shippingCents !== expectedShippingCents) {
    throw new WebhookProcessingError("shipping_mismatch");
  }

  const expectedSubtotalCents = subtotalCents + shippingCents;
  if (retrieved.amount_subtotal !== expectedSubtotalCents) {
    throw new WebhookProcessingError("subtotal_mismatch");
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
    throw new WebhookProcessingError("total_mismatch");
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
    throw new WebhookProcessingError("missing_customer_or_shipping_details");
  }

  const notes = [
    `Checkout attempt: ${checkoutAttemptId}`,
    discountCents > 0
      ? `Stripe promotion discount: $${money(discountCents).toFixed(2)}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const result = await storage.createPaidCheckoutOrder({
    customerName,
    email,
    phone,
    addressJson: { street, city, state, zip },
    itemsJson: items,
    subtotal: money(subtotalCents),
    shipping: money(shippingCents),
    total: money(retrieved.amount_total ?? 0),
    notes,
    status: "processing",
    stripeSessionId: retrieved.id,
    stripePaymentIntentId: paymentIntentId(retrieved),
    paymentStatus: "paid",
  });

  if (!result.created && result.order.paymentStatus !== "paid") {
    throw new WebhookProcessingError("existing_order_not_paid");
  }

  const safeId = event.id.slice(-8);
  console.log(
    `[WEBHOOK] hosted checkout reconciled - order #${result.order.id} - event …${safeId}`,
  );
}

async function reconcileCheckoutPayment(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const rawOrderId = session.metadata?.order_id;
  if (rawOrderId) {
    const orderId = Number(rawOrderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      throw new WebhookProcessingError("invalid_order_reference");
    }
    await markLegacyCheckoutPaid(event, session, orderId);
    return;
  }

  const checkoutAttemptId = session.metadata?.checkout_attempt_id;
  if (!checkoutAttemptId) {
    throw new WebhookProcessingError("missing_order_reference");
  }

  await createOrderFromHostedCheckout(event, session, checkoutAttemptId);
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await reconcileCheckoutPayment(
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

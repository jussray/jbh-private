import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import {
  type Env,
  json,
  MAX_WEBHOOK_BYTES,
  readBoundedText,
  safeErrorCode,
  SafeProcessingError,
  text,
} from "./shared";

const SHOPIFY_PAID_TOPIC = "orders/paid";
const HAIR_MATCH_VARIANT_ID = "50196622344435";
const HAIR_MATCH_SUBTOTAL_CENTS = 2500;
const SERVICE_CODE = "jbh-hair-match-v1";

type Sql = ReturnType<typeof neon<false, false>>;

const moneyString = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const identifier = z.union([
  z.number().int().positive().transform(String),
  z.string().trim().regex(/^\d+$/),
]);

const addressSchema = z
  .object({
    name: z.string().trim().max(160).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const shopifyOrderSchema = z
  .object({
    id: identifier,
    admin_graphql_api_id: z.string().trim().max(160).optional(),
    currency: z.string().trim().length(3),
    financial_status: z.string().trim().max(40).nullable().optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    contact_email: z.string().trim().email().max(254).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    customer: z
      .object({
        email: z.string().trim().email().max(254).nullable().optional(),
        first_name: z.string().trim().max(100).nullable().optional(),
        last_name: z.string().trim().max(100).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    billing_address: addressSchema,
    shipping_address: addressSchema,
    subtotal_price: moneyString.optional(),
    current_subtotal_price: moneyString.optional(),
    total_price: moneyString.optional(),
    current_total_price: moneyString.optional(),
    line_items: z
      .array(
        z
          .object({
            id: identifier,
            product_id: identifier.nullable().optional(),
            variant_id: identifier.nullable(),
            title: z.string().trim().min(1).max(240),
            variant_title: z.string().trim().max(160).nullable().optional(),
            sku: z.string().trim().max(120).nullable().optional(),
            quantity: z.number().int().min(1).max(10),
            price: moneyString,
          })
          .passthrough(),
      )
      .min(1)
      .max(20),
  })
  .passthrough();

interface NormalizedPaidService {
  shopifyOrderId: string;
  shopifyOrderGid: string | null;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  itemsJson: string;
  subtotal: number;
  total: number;
  currency: "USD";
}

function cents(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new SafeProcessingError("invalid_money");
  return Math.round(amount * 100);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value);
  return btoa(binary);
}

export async function verifyShopifyWebhookHmac(
  rawBody: string,
  provided: string,
  secret: string,
): Promise<boolean> {
  if (!provided || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return constantTimeEqual(provided, base64(digest));
}

function normalizedShopDomain(value: string): string | null {
  const domain = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) return null;
  return domain;
}

export function normalizePaidHairMatchOrder(payload: unknown): NormalizedPaidService {
  const parsed = shopifyOrderSchema.safeParse(payload);
  if (!parsed.success) throw new SafeProcessingError("invalid_shopify_order");
  const order = parsed.data;

  if (order.currency.toUpperCase() !== "USD") {
    throw new SafeProcessingError("unsupported_currency");
  }
  if (order.financial_status && order.financial_status !== "paid") {
    throw new SafeProcessingError("order_not_paid");
  }
  if (order.line_items.length !== 1) {
    throw new SafeProcessingError("unexpected_line_item_count");
  }

  const line = order.line_items[0];
  if (line.variant_id !== HAIR_MATCH_VARIANT_ID) {
    throw new SafeProcessingError("unexpected_shopify_variant");
  }
  if (line.quantity !== 1 || cents(line.price) !== HAIR_MATCH_SUBTOTAL_CENTS) {
    throw new SafeProcessingError("hair_match_price_or_quantity_mismatch");
  }

  const subtotalValue = order.current_subtotal_price ?? order.subtotal_price;
  const totalValue = order.current_total_price ?? order.total_price;
  if (!subtotalValue || !totalValue) {
    throw new SafeProcessingError("missing_shopify_totals");
  }

  const subtotalCents = cents(subtotalValue);
  const totalCents = cents(totalValue);
  if (
    subtotalCents !== HAIR_MATCH_SUBTOTAL_CENTS ||
    totalCents < subtotalCents ||
    totalCents > subtotalCents + 1000
  ) {
    throw new SafeProcessingError("shopify_total_mismatch");
  }

  const email = (
    order.email ??
    order.contact_email ??
    order.customer?.email ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!email) throw new SafeProcessingError("missing_customer_email");

  const addressName =
    order.billing_address?.name ?? order.shipping_address?.name ?? null;
  const customerName =
    addressName?.trim() ||
    [order.customer?.first_name, order.customer?.last_name]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ") ||
    null;
  const customerPhone = (
    order.phone ??
    order.customer?.phone ??
    order.billing_address?.phone ??
    order.shipping_address?.phone ??
    ""
  ).trim() || null;

  return {
    shopifyOrderId: order.id,
    shopifyOrderGid: order.admin_graphql_api_id ?? null,
    customerEmail: email,
    customerName,
    customerPhone,
    itemsJson: JSON.stringify([
      {
        lineItemId: order.line_items[0].id,
        variantId: HAIR_MATCH_VARIANT_ID,
        serviceCode: SERVICE_CODE,
        title: order.line_items[0].title,
        variantTitle: order.line_items[0].variant_title ?? null,
        sku: order.line_items[0].sku ?? null,
        quantity: 1,
        unitPrice: 25,
        vendorRoutingStatus: "not_applicable",
      },
    ]),
    subtotal: subtotalCents / 100,
    total: totalCents / 100,
    currency: "USD",
  };
}

async function alreadyProcessed(sql: Sql, webhookId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT webhook_id
    FROM processed_shopify_events
    WHERE webhook_id = ${webhookId}
    LIMIT 1
  `) as unknown as Array<{ webhook_id: string }>;
  return Boolean(rows[0]);
}

async function markProcessed(
  sql: Sql,
  webhookId: string,
  shopifyOrderId: string,
): Promise<void> {
  await sql`
    INSERT INTO processed_shopify_events (webhook_id, shopify_order_id)
    VALUES (${webhookId}, ${shopifyOrderId})
    ON CONFLICT (webhook_id) DO NOTHING
  `;
}

async function writeToDlq(
  sql: Sql,
  webhookId: string,
  topic: string,
  error: unknown,
): Promise<void> {
  try {
    await sql`
      INSERT INTO failed_shopify_events (
        webhook_id, topic, retry_count, last_error, resolved
      ) VALUES (
        ${webhookId}, ${topic}, 1, ${safeErrorCode(error)}, false
      )
      ON CONFLICT (webhook_id) DO UPDATE SET
        topic = EXCLUDED.topic,
        failed_at = NOW(),
        retry_count = failed_shopify_events.retry_count + 1,
        last_error = EXCLUDED.last_error,
        resolved = false,
        resolved_at = NULL
    `;
  } catch {
    console.error(`[SHOPIFY_WEBHOOK] DLQ write failed for delivery …${webhookId.slice(-8)}`);
  }
}

async function storePaidService(
  sql: Sql,
  order: NormalizedPaidService,
  webhookId: string,
  shopDomain: string,
  topic: string,
): Promise<void> {
  const created = (await sql`
    INSERT INTO shopify_paid_services (
      shopify_order_id, shopify_order_gid, shop_domain, first_webhook_id,
      topic, service_code, customer_email, customer_name, customer_phone,
      items_json, subtotal, total, currency, payment_status,
      fulfillment_status, vendor_routing_status
    ) VALUES (
      ${order.shopifyOrderId}, ${order.shopifyOrderGid}, ${shopDomain},
      ${webhookId}, ${topic}, ${SERVICE_CODE}, ${order.customerEmail},
      ${order.customerName}, ${order.customerPhone}, ${order.itemsJson}::jsonb,
      ${order.subtotal}, ${order.total}, ${order.currency}, 'paid',
      'service_pending', 'not_applicable'
    )
    ON CONFLICT (shopify_order_id) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: number }>;

  if (created[0]) return;

  const existing = (await sql`
    SELECT service_code, subtotal, currency, payment_status,
           vendor_routing_status
    FROM shopify_paid_services
    WHERE shopify_order_id = ${order.shopifyOrderId}
    LIMIT 1
  `) as unknown as Array<{
    service_code: string;
    subtotal: number | string;
    currency: string;
    payment_status: string;
    vendor_routing_status: string;
  }>;
  const row = existing[0];
  if (
    !row ||
    row.service_code !== SERVICE_CODE ||
    Number(row.subtotal) !== order.subtotal ||
    row.currency !== "USD" ||
    row.payment_status !== "paid" ||
    row.vendor_routing_status !== "not_applicable"
  ) {
    throw new SafeProcessingError("existing_shopify_order_mismatch");
  }
}

export async function handleShopifyWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return text("Method not allowed", 405, { Allow: "POST" });
  }
  if (!env.DATABASE_URL || !env.SHOPIFY_WEBHOOK_SECRET || !env.SHOPIFY_SHOP_DOMAIN) {
    console.error("[SHOPIFY_WEBHOOK] required bindings are not configured");
    return text("Shopify not configured", 503);
  }

  const topic = request.headers.get("X-Shopify-Topic")?.trim().toLowerCase() ?? "";
  const shopDomain = normalizedShopDomain(
    request.headers.get("X-Shopify-Shop-Domain") ?? "",
  );
  const expectedShop = normalizedShopDomain(env.SHOPIFY_SHOP_DOMAIN);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id")?.trim() ?? "";
  const providedHmac = request.headers.get("X-Shopify-Hmac-SHA256")?.trim() ?? "";

  if (topic !== SHOPIFY_PAID_TOPIC) return text("Unsupported topic", 400);
  if (!shopDomain || !expectedShop || shopDomain !== expectedShop) {
    return text("Shop not allowed", 403);
  }
  if (!/^[A-Za-z0-9-]{16,100}$/.test(webhookId)) {
    return text("Invalid webhook id", 400);
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
  } catch {
    return text("Invalid payload", 400);
  }

  if (!(await verifyShopifyWebhookHmac(rawBody, providedHmac, env.SHOPIFY_WEBHOOK_SECRET))) {
    console.error("[SHOPIFY_WEBHOOK] signature verification failed");
    return text("Invalid signature", 401);
  }

  const sql = neon(env.DATABASE_URL);
  try {
    if (await alreadyProcessed(sql, webhookId)) {
      return json({ received: true, duplicate: true });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new SafeProcessingError("invalid_json");
    }

    const order = normalizePaidHairMatchOrder(payload);
    await storePaidService(sql, order, webhookId, shopDomain, topic);
    await markProcessed(sql, webhookId, order.shopifyOrderId);
    return json({ received: true });
  } catch (error) {
    await writeToDlq(sql, webhookId, topic, error);
    console.error(
      `[SHOPIFY_WEBHOOK] processing failed for delivery …${webhookId.slice(-8)} (${safeErrorCode(error)})`,
    );
    return text("Webhook processing failed", 500);
  }
}

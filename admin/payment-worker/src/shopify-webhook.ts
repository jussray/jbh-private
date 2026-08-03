import { neon } from "@neondatabase/serverless";
import {
  HAIR_MATCH_SERVICE_CODE,
  type NormalizedPaidService,
  normalizePaidHairMatchOrder,
  normalizedShopDomain,
  SHOPIFY_PAID_TOPIC,
  ShopifyOrderModelError,
  verifyShopifyWebhookHmac,
} from "./shopify-order-model";
import {
  type Env,
  json,
  MAX_WEBHOOK_BYTES,
  readBoundedText,
  safeErrorCode,
  SafeProcessingError,
  text,
} from "./shared";

type Sql = ReturnType<typeof neon<false, false>>;

function shopifyErrorCode(error: unknown): string {
  if (error instanceof ShopifyOrderModelError) return error.code.slice(0, 80);
  return safeErrorCode(error);
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
        ${webhookId}, ${topic}, 1, ${shopifyErrorCode(error)}, false
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
      ${webhookId}, ${topic}, ${HAIR_MATCH_SERVICE_CODE}, ${order.customerEmail},
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
    row.service_code !== HAIR_MATCH_SERVICE_CODE ||
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
      `[SHOPIFY_WEBHOOK] processing failed for delivery …${webhookId.slice(-8)} (${shopifyErrorCode(error)})`,
    );
    return text("Webhook processing failed", 500);
  }
}

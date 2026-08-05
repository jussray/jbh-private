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

async function processedOrderId(
  sql: Sql,
  webhookId: string,
): Promise<string | null> {
  const rows = (await sql`
    SELECT shopify_order_id
    FROM processed_shopify_events
    WHERE webhook_id = ${webhookId}
    LIMIT 1
  `) as unknown as Array<{ shopify_order_id: string }>;
  return rows[0]?.shopify_order_id ?? null;
}

async function markProcessed(
  sql: Sql,
  webhookId: string,
  shopifyOrderId: string,
): Promise<boolean> {
  const created = (await sql`
    INSERT INTO processed_shopify_events (webhook_id, shopify_order_id)
    VALUES (${webhookId}, ${shopifyOrderId})
    ON CONFLICT (webhook_id) DO NOTHING
    RETURNING shopify_order_id
  `) as unknown as Array<{ shopify_order_id: string }>;

  if (created[0]) return false;

  const existingOrderId = await processedOrderId(sql, webhookId);
  if (existingOrderId !== shopifyOrderId) {
    throw new SafeProcessingError("existing_shopify_webhook_mismatch");
  }
  return true;
}

async function resolveFailure(sql: Sql, webhookId: string): Promise<void> {
  await sql`
    UPDATE failed_shopify_events
    SET resolved = true,
        resolved_at = COALESCE(resolved_at, NOW())
    WHERE webhook_id = ${webhookId}
      AND resolved = false
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

  const exactMatch = (await sql`
    SELECT id
    FROM shopify_paid_services
    WHERE shopify_order_id = ${order.shopifyOrderId}
      AND shopify_order_gid IS NOT DISTINCT FROM ${order.shopifyOrderGid}
      AND shop_domain = ${shopDomain}
      AND topic = ${topic}
      AND service_code = ${HAIR_MATCH_SERVICE_CODE}
      AND customer_email = ${order.customerEmail}
      AND customer_name IS NOT DISTINCT FROM ${order.customerName}
      AND customer_phone IS NOT DISTINCT FROM ${order.customerPhone}
      AND items_json = ${order.itemsJson}::jsonb
      AND subtotal = ${order.subtotal}
      AND total = ${order.total}
      AND currency = ${order.currency}
      AND payment_status = 'paid'
      AND fulfillment_status = 'service_pending'
      AND vendor_routing_status = 'not_applicable'
    LIMIT 1
  `) as unknown as Array<{ id: number }>;

  if (!exactMatch[0]) {
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
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new SafeProcessingError("invalid_json");
    }

    const order = normalizePaidHairMatchOrder(payload);
    const existingOrderId = await processedOrderId(sql, webhookId);
    if (existingOrderId) {
      if (existingOrderId !== order.shopifyOrderId) {
        throw new SafeProcessingError("existing_shopify_webhook_mismatch");
      }
      await resolveFailure(sql, webhookId);
      return json({ received: true, duplicate: true });
    }

    await storePaidService(sql, order, webhookId, shopDomain, topic);
    const duplicate = await markProcessed(sql, webhookId, order.shopifyOrderId);
    await resolveFailure(sql, webhookId);
    return json({ received: true, duplicate });
  } catch (error) {
    await writeToDlq(sql, webhookId, topic, error);
    console.error(
      `[SHOPIFY_WEBHOOK] processing failed for delivery …${webhookId.slice(-8)} (${shopifyErrorCode(error)})`,
    );
    return text("Webhook processing failed", 500);
  }
}

import { neon } from "@neondatabase/serverless";
import {
  type NormalizedPaidPhysicalOrder,
  normalizePaidShopifyPhysicalOrder,
  normalizedShopDomain,
  SHOPIFY_PAID_TOPIC,
  ShopifyPhysicalOrderModelError,
  verifyShopifyWebhookHmac,
} from "./shopify-physical-order-model";
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

function errorCode(error: unknown): string {
  if (error instanceof ShopifyPhysicalOrderModelError) {
    return error.code.slice(0, 80);
  }
  return safeErrorCode(error);
}

async function processedOrderId(sql: Sql, webhookId: string): Promise<string | null> {
  const rows = (await sql`
    SELECT shopify_order_id
    FROM processed_shopify_physical_events
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
    INSERT INTO processed_shopify_physical_events (webhook_id, shopify_order_id)
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
    UPDATE failed_shopify_physical_events
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
      INSERT INTO failed_shopify_physical_events (
        webhook_id, topic, retry_count, last_error, resolved
      ) VALUES (
        ${webhookId}, ${topic}, 1, ${errorCode(error)}, false
      )
      ON CONFLICT (webhook_id) DO UPDATE SET
        topic = EXCLUDED.topic,
        failed_at = NOW(),
        retry_count = failed_shopify_physical_events.retry_count + 1,
        last_error = EXCLUDED.last_error,
        resolved = false,
        resolved_at = NULL
    `;
  } catch {
    console.error(
      `[SHOPIFY_PHYSICAL] DLQ write failed for delivery …${webhookId.slice(-8)}`,
    );
  }
}

async function storePaidPhysicalOrder(
  sql: Sql,
  order: NormalizedPaidPhysicalOrder,
  webhookId: string,
  shopDomain: string,
  topic: string,
): Promise<void> {
  const created = (await sql`
    INSERT INTO shopify_physical_orders (
      shopify_order_id, shopify_order_gid, shop_domain, first_webhook_id,
      topic, order_name, customer_email, customer_name, customer_phone,
      shipping_address_json, items_json, subtotal_cents, total_cents,
      currency, payment_status, procurement_status
    ) VALUES (
      ${order.shopifyOrderId}, ${order.shopifyOrderGid}, ${shopDomain},
      ${webhookId}, ${topic}, ${order.orderName}, ${order.customerEmail},
      ${order.customerName}, ${order.customerPhone},
      ${order.shippingAddressJson}::jsonb, ${order.itemsJson}::jsonb,
      ${order.subtotalCents}, ${order.totalCents}, ${order.currency},
      'paid', 'procurement_needed'
    )
    ON CONFLICT (shopify_order_id) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  if (created[0]) return;

  const exactMatch = (await sql`
    SELECT id
    FROM shopify_physical_orders
    WHERE shopify_order_id = ${order.shopifyOrderId}
      AND shopify_order_gid IS NOT DISTINCT FROM ${order.shopifyOrderGid}
      AND shop_domain = ${shopDomain}
      AND topic = ${topic}
      AND order_name IS NOT DISTINCT FROM ${order.orderName}
      AND customer_email IS NOT DISTINCT FROM ${order.customerEmail}
      AND customer_name IS NOT DISTINCT FROM ${order.customerName}
      AND customer_phone IS NOT DISTINCT FROM ${order.customerPhone}
      AND shipping_address_json = ${order.shippingAddressJson}::jsonb
      AND items_json = ${order.itemsJson}::jsonb
      AND subtotal_cents = ${order.subtotalCents}
      AND total_cents = ${order.totalCents}
      AND currency = ${order.currency}
      AND payment_status = 'paid'
    LIMIT 1
  `) as unknown as Array<{ id: number }>;

  if (!exactMatch[0]) {
    throw new SafeProcessingError("existing_shopify_order_mismatch");
  }
}

export async function handleShopifyPhysicalWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return text("Method not allowed", 405, { Allow: "POST" });
  }
  if (
    !env.DATABASE_URL ||
    !env.SHOPIFY_WEBHOOK_SECRET ||
    !env.SHOPIFY_SHOP_DOMAIN
  ) {
    console.error("[SHOPIFY_PHYSICAL] required bindings are not configured");
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

  if (
    !(await verifyShopifyWebhookHmac(
      rawBody,
      providedHmac,
      env.SHOPIFY_WEBHOOK_SECRET,
    ))
  ) {
    console.error("[SHOPIFY_PHYSICAL] signature verification failed");
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

    const normalized = normalizePaidShopifyPhysicalOrder(payload);
    if (normalized.kind === "ignored_service") {
      return json({ received: true, ignored: "service_only" });
    }

    const order = normalized.order;
    const existingOrderId = await processedOrderId(sql, webhookId);
    if (existingOrderId) {
      if (existingOrderId !== order.shopifyOrderId) {
        throw new SafeProcessingError("existing_shopify_webhook_mismatch");
      }
      await resolveFailure(sql, webhookId);
      return json({ received: true, duplicate: true });
    }

    await storePaidPhysicalOrder(sql, order, webhookId, shopDomain, topic);
    const duplicate = await markProcessed(sql, webhookId, order.shopifyOrderId);
    await resolveFailure(sql, webhookId);
    return json({ received: true, duplicate, procurement: "needed" });
  } catch (error) {
    await writeToDlq(sql, webhookId, topic, error);
    console.error(
      `[SHOPIFY_PHYSICAL] processing failed for delivery …${webhookId.slice(-8)} (${errorCode(error)})`,
    );
    return text("Webhook processing failed", 500);
  }
}
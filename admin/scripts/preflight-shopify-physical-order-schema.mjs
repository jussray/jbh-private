import { appendFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function publishResult(result) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`, "utf8");
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  publishResult("missing-database-url");
  console.error("Shopify physical-order schema preflight failed: DATABASE_URL is not set.");
  process.exit(2);
}

const sql = neon(databaseUrl);

try {
  const [state] = await sql`
    SELECT
      to_regclass(current_schema() || '.shopify_physical_orders') IS NOT NULL
        AS orders_table_present,
      to_regclass(current_schema() || '.processed_shopify_physical_events') IS NOT NULL
        AS processed_events_table_present,
      to_regclass(current_schema() || '.failed_shopify_physical_events') IS NOT NULL
        AS failed_events_table_present,
      (
        SELECT COUNT(*) = 10
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'shopify_physical_orders'
          AND column_name = ANY (ARRAY[
            'shopify_order_id',
            'shop_domain',
            'first_webhook_id',
            'topic',
            'shipping_address_json',
            'items_json',
            'subtotal_cents',
            'total_cents',
            'payment_status',
            'procurement_status'
          ]::text[])
      ) AS required_order_columns_present,
      EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'shopify_physical_orders'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef LIKE '%(shopify_order_id)%'
      ) AS order_id_unique,
      EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'shopify_physical_orders'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef LIKE '%(first_webhook_id)%'
      ) AS first_webhook_id_unique,
      EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'processed_shopify_physical_events'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef LIKE '%(webhook_id)%'
      ) AS processed_webhook_id_unique,
      EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'failed_shopify_physical_events'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef LIKE '%(webhook_id)%'
      ) AS failed_webhook_id_unique
  `;

  const report = {
    ordersTablePresent: Boolean(state?.orders_table_present),
    processedEventsTablePresent: Boolean(state?.processed_events_table_present),
    failedEventsTablePresent: Boolean(state?.failed_events_table_present),
    requiredOrderColumnsPresent: Boolean(state?.required_order_columns_present),
    orderIdUnique: Boolean(state?.order_id_unique),
    firstWebhookIdUnique: Boolean(state?.first_webhook_id_unique),
    processedWebhookIdUnique: Boolean(state?.processed_webhook_id_unique),
    failedWebhookIdUnique: Boolean(state?.failed_webhook_id_unique),
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    !report.ordersTablePresent ||
    !report.processedEventsTablePresent ||
    !report.failedEventsTablePresent
  ) {
    publishResult("shopify-physical-tables-missing");
    console.error("Shopify physical-order schema preflight blocked: required tables are missing.");
    process.exit(3);
  }

  if (!report.requiredOrderColumnsPresent) {
    publishResult("shopify-physical-columns-missing");
    console.error("Shopify physical-order schema preflight blocked: required order columns are missing.");
    process.exit(4);
  }

  if (
    !report.orderIdUnique ||
    !report.firstWebhookIdUnique ||
    !report.processedWebhookIdUnique ||
    !report.failedWebhookIdUnique
  ) {
    publishResult("shopify-idempotency-constraints-missing");
    console.error("Shopify physical-order schema preflight blocked: idempotency constraints are missing.");
    process.exit(5);
  }

  publishResult("passed-shopify-physical-schema");
  console.log("Shopify physical-order schema preflight passed.");
} catch (error) {
  publishResult("query-failed");
  const code = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
  console.error(`Shopify physical-order schema preflight failed: ${code}`);
  process.exit(6);
}

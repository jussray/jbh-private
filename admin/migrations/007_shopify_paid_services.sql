-- Additive private ingestion for paid Shopify consultation orders.
-- This table is intentionally separate from physical-product orders so a
-- consultation can never enter vendor routing by implication.

CREATE TABLE IF NOT EXISTS shopify_paid_services (
  id BIGSERIAL PRIMARY KEY,
  shopify_order_id TEXT NOT NULL UNIQUE,
  shopify_order_gid TEXT,
  shop_domain TEXT NOT NULL,
  first_webhook_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  service_code TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  items_json JSONB NOT NULL,
  subtotal DOUBLE PRECISION NOT NULL,
  total DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  fulfillment_status TEXT NOT NULL DEFAULT 'service_pending',
  vendor_routing_status TEXT NOT NULL DEFAULT 'not_applicable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shopify_paid_services_currency_check CHECK (currency = 'USD'),
  CONSTRAINT shopify_paid_services_payment_check CHECK (payment_status = 'paid'),
  CONSTRAINT shopify_paid_services_vendor_check CHECK (vendor_routing_status = 'not_applicable'),
  CONSTRAINT shopify_paid_services_amount_check CHECK (subtotal >= 0 AND total >= subtotal)
);

CREATE INDEX IF NOT EXISTS shopify_paid_services_created_at_idx
  ON shopify_paid_services (created_at DESC);

CREATE TABLE IF NOT EXISTS processed_shopify_events (
  webhook_id TEXT PRIMARY KEY,
  shopify_order_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failed_shopify_events (
  webhook_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ
);

-- Private Shopify physical-order intake for manual procurement launch mode.
-- Additive only. This migration does not activate vendors, create product mappings,
-- queue fulfillment, dispatch supplier orders, or delete existing data.

CREATE TABLE IF NOT EXISTS shopify_physical_orders (
  id BIGSERIAL PRIMARY KEY,
  shopify_order_id TEXT NOT NULL UNIQUE,
  shopify_order_gid TEXT,
  shop_domain TEXT NOT NULL,
  first_webhook_id TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL CHECK (topic = 'orders/paid'),
  order_name TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  shipping_address_json JSONB NOT NULL,
  items_json JSONB NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 1),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status = 'paid'),
  procurement_status TEXT NOT NULL DEFAULT 'procurement_needed'
    CHECK (procurement_status IN (
      'procurement_needed',
      'supplier_ordered',
      'supplier_confirmed',
      'shipped',
      'delivered',
      'cancelled'
    )),
  supplier_code TEXT,
  supplier_order_reference TEXT,
  tracking_number TEXT,
  tracking_carrier TEXT,
  ordered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_shopify_physical_events (
  webhook_id TEXT PRIMARY KEY,
  shopify_order_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failed_shopify_physical_events (
  webhook_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INTEGER NOT NULL DEFAULT 1 CHECK (retry_count >= 1),
  last_error TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shopify_physical_procurement_status_idx
  ON shopify_physical_orders (procurement_status, created_at DESC);

CREATE INDEX IF NOT EXISTS failed_shopify_physical_unresolved_idx
  ON failed_shopify_physical_events (resolved, failed_at DESC);

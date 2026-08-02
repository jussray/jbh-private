-- Private vendor routing and fulfillment queue.
-- Additive only. No vendor, customer, order, or contact records are deleted.

CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  fulfillment_email TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_product_mappings (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_product_mapping_unique
  ON vendor_product_mappings (product_id, variant);

CREATE TABLE IF NOT EXISTS vendor_fulfillment_groups (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  items_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_owner_approval',
  owner_approved_at TIMESTAMPTZ,
  queued_at TIMESTAMPTZ,
  tracking_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_fulfillment_order_vendor_unique
  ON vendor_fulfillment_groups (order_id, vendor_id);

CREATE TABLE IF NOT EXISTS vendor_dispatch_jobs (
  id SERIAL PRIMARY KEY,
  fulfillment_group_id INTEGER NOT NULL UNIQUE
    REFERENCES vendor_fulfillment_groups(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_routing_exceptions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_routing_exception_unique
  ON vendor_routing_exceptions (order_id, product_id, variant, reason);

CREATE INDEX IF NOT EXISTS vendor_fulfillment_order_idx
  ON vendor_fulfillment_groups (order_id, status);

CREATE INDEX IF NOT EXISTS vendor_dispatch_status_idx
  ON vendor_dispatch_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS vendor_routing_exception_order_idx
  ON vendor_routing_exceptions (order_id, resolved_at);

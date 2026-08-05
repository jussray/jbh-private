-- Owner-only vendor quote and sample-order readiness ledger.
-- This migration records vendor replies and prepares reviewable sample drafts.
-- It does not send email, make a payment, place an order, activate a vendor,
-- create a live product mapping, or queue fulfillment.

ALTER TABLE vendors
  ALTER COLUMN active SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS vendor_quotes (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  source_message_id TEXT,
  source_thread_id TEXT,
  quote_reference TEXT,
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN (
      'received',
      'under_review',
      'sample_ready',
      'rejected',
      'expired'
    )),
  reply_received_at TIMESTAMPTZ NOT NULL,
  terms_summary TEXT,
  shipping_summary TEXT,
  return_summary TEXT,
  branding_summary TEXT,
  payment_summary TEXT,
  minimum_order_cents INTEGER
    CHECK (minimum_order_cents IS NULL OR minimum_order_cents >= 0),
  quoted_shipping_cents INTEGER NOT NULL DEFAULT 0
    CHECK (quoted_shipping_cents >= 0),
  quoted_duties_cents INTEGER NOT NULL DEFAULT 0
    CHECK (quoted_duties_cents >= 0),
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, source_message_id)
);

CREATE TABLE IF NOT EXISTS vendor_quote_items (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES vendor_quotes(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  vendor_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  sample_candidate BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quote_id, product_id, variant, vendor_sku)
);

CREATE TABLE IF NOT EXISTS vendor_sample_order_requests (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  quote_id INTEGER NOT NULL REFERENCES vendor_quotes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'awaiting_owner_approval',
      'ready_for_owner_checkout',
      'cancelled'
    )),
  ship_to_kind TEXT NOT NULL
    CHECK (ship_to_kind IN ('owner', 'business')),
  ship_to_reference TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  duties_cents INTEGER NOT NULL DEFAULT 0 CHECK (duties_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  items_json JSONB NOT NULL,
  owner_approval_note TEXT,
  owner_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(items_json) = 'array'),
  CHECK (jsonb_array_length(items_json) BETWEEN 1 AND 100),
  CHECK (total_cents = subtotal_cents + shipping_cents + duties_cents),
  CHECK (
    status <> 'ready_for_owner_checkout'
    OR owner_approved_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS vendor_quotes_vendor_status_idx
  ON vendor_quotes (vendor_id, status, reply_received_at DESC);

CREATE INDEX IF NOT EXISTS vendor_quote_items_quote_idx
  ON vendor_quote_items (quote_id, product_id, variant);

CREATE INDEX IF NOT EXISTS vendor_sample_requests_status_idx
  ON vendor_sample_order_requests (status, created_at DESC);

-- A complete sample request may become ready for the owner's manual checkout,
-- but no database trigger or function performs an external purchase.

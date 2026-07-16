-- Juss Beautiful Hair online payment control plane.
-- Apply only to the private production database used by the isolated payment Worker.
-- Safe to re-run. Contains no credentials or business records.

BEGIN;

CREATE TABLE IF NOT EXISTS online_orders (
  checkout_attempt_id UUID PRIMARY KEY,
  cart_fingerprint TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
  fulfillment_status TEXT NOT NULL DEFAULT 'new'
    CHECK (fulfillment_status IN ('new', 'processing', 'shipped', 'delivered', 'cancelled')),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents INTEGER NOT NULL CHECK (shipping_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  items_json JSONB NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  shipping_address_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT online_orders_paid_state_check CHECK (
    (payment_status <> 'paid' AND paid_at IS NULL)
    OR (payment_status = 'paid' AND paid_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS online_orders_created_at_idx
  ON online_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS online_orders_paid_at_idx
  ON online_orders (paid_at DESC)
  WHERE payment_status = 'paid';

CREATE TABLE IF NOT EXISTS stripe_webhook_receipts (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  lease_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_receipts_retry_idx
  ON stripe_webhook_receipts (updated_at)
  WHERE status IN ('processing', 'failed');

COMMIT;

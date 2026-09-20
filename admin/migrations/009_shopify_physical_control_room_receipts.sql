-- Sanitized paid-order receipt outbox for Shopify physical commerce.
-- Additive only. The outbox contains no customer identity, shipping details,
-- private operational identities, payment instrument, or item payload.

CREATE TABLE IF NOT EXISTS shopify_physical_control_room_receipt_outbox (
  id BIGSERIAL PRIMARY KEY,
  receipt_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  shopify_order_id TEXT NOT NULL
    REFERENCES shopify_physical_orders(shopify_order_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL DEFAULT 'paid_order_recorded'
    CHECK (event_type = 'paid_order_recorded'),
  collected_value_cents INTEGER NOT NULL
    CHECK (collected_value_cents BETWEEN 1 AND 100000000),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (shopify_order_id, event_type)
);

CREATE INDEX IF NOT EXISTS shopify_physical_control_room_receipt_pending_idx
  ON shopify_physical_control_room_receipt_outbox (sent_at, created_at);

CREATE OR REPLACE FUNCTION queue_shopify_physical_control_room_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_status <> 'paid' THEN
    RETURN NEW;
  END IF;

  INSERT INTO shopify_physical_control_room_receipt_outbox (
    shopify_order_id,
    event_type,
    collected_value_cents,
    currency
  ) VALUES (
    NEW.shopify_order_id,
    'paid_order_recorded',
    NEW.total_cents,
    NEW.currency
  )
  ON CONFLICT (shopify_order_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'shopify_physical_queue_control_room_receipt'
  ) THEN
    CREATE TRIGGER shopify_physical_queue_control_room_receipt
      AFTER INSERT ON shopify_physical_orders
      FOR EACH ROW
      EXECUTE FUNCTION queue_shopify_physical_control_room_receipt();
  END IF;
END;
$$;

-- Backfill any paid Shopify physical order that existed before this migration.
INSERT INTO shopify_physical_control_room_receipt_outbox (
  shopify_order_id,
  event_type,
  collected_value_cents,
  currency,
  created_at
)
SELECT
  shopify_order_id,
  'paid_order_recorded',
  total_cents,
  currency,
  created_at
FROM shopify_physical_orders
WHERE payment_status = 'paid'
ON CONFLICT (shopify_order_id, event_type) DO NOTHING;

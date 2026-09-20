-- Sanitized Shopify physical-order outcome outbox for Founder Control Room.
-- Additive only. The outbox contains no customer identity, shipping details,
-- private operational identities, payment instrument, tracking value, or item payload.

CREATE TABLE IF NOT EXISTS shopify_physical_control_room_receipt_outbox (
  id BIGSERIAL PRIMARY KEY,
  receipt_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  shopify_order_id TEXT NOT NULL
    REFERENCES shopify_physical_orders(shopify_order_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'paid_order_recorded',
      'tracking_received',
      'completed',
      'exception'
    )),
  collected_value_cents INTEGER,
  currency TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (shopify_order_id, event_type),
  CONSTRAINT shopify_physical_control_room_receipt_money_check CHECK (
    (
      event_type = 'paid_order_recorded'
      AND collected_value_cents BETWEEN 1 AND 100000000
      AND currency = 'USD'
    )
    OR
    (
      event_type <> 'paid_order_recorded'
      AND collected_value_cents IS NULL
      AND currency IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS shopify_physical_control_room_receipt_pending_idx
  ON shopify_physical_control_room_receipt_outbox (sent_at, created_at);

CREATE OR REPLACE FUNCTION queue_shopify_physical_control_room_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  lifecycle_event TEXT;
  lifecycle_time TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'paid' THEN
      INSERT INTO shopify_physical_control_room_receipt_outbox (
        shopify_order_id,
        event_type,
        collected_value_cents,
        currency,
        created_at
      ) VALUES (
        NEW.shopify_order_id,
        'paid_order_recorded',
        NEW.total_cents,
        NEW.currency,
        NEW.created_at
      )
      ON CONFLICT (shopify_order_id, event_type) DO NOTHING;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.procurement_status IS NOT DISTINCT FROM OLD.procurement_status THEN
    RETURN NEW;
  END IF;

  lifecycle_event := CASE NEW.procurement_status
    WHEN 'shipped' THEN 'tracking_received'
    WHEN 'delivered' THEN 'completed'
    WHEN 'cancelled' THEN 'exception'
    ELSE NULL
  END;

  IF lifecycle_event IS NULL THEN
    RETURN NEW;
  END IF;

  -- A shipped receipt proves only that tracking was recorded. The tracking value
  -- itself remains private and is never copied into this outbox.
  IF lifecycle_event = 'tracking_received' AND NEW.tracking_number IS NULL THEN
    RETURN NEW;
  END IF;

  lifecycle_time := CASE NEW.procurement_status
    WHEN 'shipped' THEN COALESCE(NEW.shipped_at, NEW.updated_at, NOW())
    WHEN 'delivered' THEN COALESCE(NEW.delivered_at, NEW.updated_at, NOW())
    ELSE COALESCE(NEW.updated_at, NOW())
  END;

  INSERT INTO shopify_physical_control_room_receipt_outbox (
    shopify_order_id,
    event_type,
    created_at
  ) VALUES (
    NEW.shopify_order_id,
    lifecycle_event,
    lifecycle_time
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
      AFTER INSERT OR UPDATE OF procurement_status ON shopify_physical_orders
      FOR EACH ROW
      EXECUTE FUNCTION queue_shopify_physical_control_room_receipt();
  END IF;
END;
$$;

-- Backfill paid-order evidence for physical orders that existed before this migration.
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

-- Backfill privacy-safe lifecycle evidence when the current ledger already proves it.
INSERT INTO shopify_physical_control_room_receipt_outbox (
  shopify_order_id,
  event_type,
  created_at
)
SELECT
  shopify_order_id,
  'tracking_received',
  COALESCE(shipped_at, updated_at, created_at)
FROM shopify_physical_orders
WHERE procurement_status IN ('shipped', 'delivered')
  AND tracking_number IS NOT NULL
ON CONFLICT (shopify_order_id, event_type) DO NOTHING;

INSERT INTO shopify_physical_control_room_receipt_outbox (
  shopify_order_id,
  event_type,
  created_at
)
SELECT
  shopify_order_id,
  'completed',
  COALESCE(delivered_at, updated_at, created_at)
FROM shopify_physical_orders
WHERE procurement_status = 'delivered'
ON CONFLICT (shopify_order_id, event_type) DO NOTHING;

INSERT INTO shopify_physical_control_room_receipt_outbox (
  shopify_order_id,
  event_type,
  created_at
)
SELECT
  shopify_order_id,
  'exception',
  COALESCE(updated_at, created_at)
FROM shopify_physical_orders
WHERE procurement_status = 'cancelled'
ON CONFLICT (shopify_order_id, event_type) DO NOTHING;

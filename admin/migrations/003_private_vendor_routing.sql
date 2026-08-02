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

CREATE TABLE IF NOT EXISTS control_room_receipt_outbox (
  id SERIAL PRIMARY KEY,
  receipt_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  group_count INTEGER NOT NULL DEFAULT 0 CHECK (group_count BETWEEN 0 AND 1000),
  unresolved_count INTEGER NOT NULL DEFAULT 0 CHECK (unresolved_count BETWEEN 0 AND 1000),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (order_id, event_type)
);

CREATE INDEX IF NOT EXISTS vendor_fulfillment_order_idx
  ON vendor_fulfillment_groups (order_id, status);

CREATE INDEX IF NOT EXISTS vendor_dispatch_status_idx
  ON vendor_dispatch_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS vendor_routing_exception_order_idx
  ON vendor_routing_exceptions (order_id, resolved_at);

CREATE INDEX IF NOT EXISTS control_room_receipt_outbox_pending_idx
  ON control_room_receipt_outbox (sent_at, created_at);

CREATE OR REPLACE FUNCTION route_paid_order_to_private_vendors()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_status <> 'paid' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.items_json) <> 'array' THEN
    RAISE EXCEPTION 'paid_order_items_must_be_array';
  END IF;

  INSERT INTO vendor_routing_exceptions (
    order_id,
    product_id,
    variant,
    reason
  )
  SELECT DISTINCT
    NEW.id,
    item.value ->> 'id',
    item.value ->> 'variant',
    'vendor_mapping_missing'
  FROM jsonb_array_elements(NEW.items_json) AS item(value)
  LEFT JOIN vendor_product_mappings AS mapping
    ON mapping.product_id = item.value ->> 'id'
   AND mapping.variant = item.value ->> 'variant'
   AND mapping.active = TRUE
  LEFT JOIN vendors AS vendor
    ON vendor.id = mapping.vendor_id
   AND vendor.active = TRUE
  WHERE NULLIF(item.value ->> 'id', '') IS NOT NULL
    AND NULLIF(item.value ->> 'variant', '') IS NOT NULL
    AND (mapping.id IS NULL OR vendor.id IS NULL)
  ON CONFLICT (order_id, product_id, variant, reason) DO NOTHING;

  INSERT INTO vendor_fulfillment_groups (
    order_id,
    vendor_id,
    items_json,
    status
  )
  SELECT
    NEW.id,
    mapping.vendor_id,
    jsonb_agg(
      item.value
      ORDER BY item.value ->> 'id', item.value ->> 'variant'
    ),
    'pending_owner_approval'
  FROM jsonb_array_elements(NEW.items_json) AS item(value)
  JOIN vendor_product_mappings AS mapping
    ON mapping.product_id = item.value ->> 'id'
   AND mapping.variant = item.value ->> 'variant'
   AND mapping.active = TRUE
  JOIN vendors AS vendor
    ON vendor.id = mapping.vendor_id
   AND vendor.active = TRUE
  GROUP BY mapping.vendor_id
  ON CONFLICT (order_id, vendor_id) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM vendor_routing_exceptions
    WHERE order_id = NEW.id
      AND resolved_at IS NULL
  ) THEN
    UPDATE orders
    SET status = 'needs_vendor_review'
    WHERE id = NEW.id;
  ELSE
    UPDATE orders
    SET status = 'vendor_review'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION queue_sanitized_control_room_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  receipt_event TEXT;
  group_total INTEGER;
  unresolved_total INTEGER;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.payment_status = 'paid' THEN
    INSERT INTO control_room_receipt_outbox (
      order_id,
      event_type,
      group_count,
      unresolved_count
    ) VALUES (NEW.id, 'paid_order_recorded', 0, 0)
    ON CONFLICT (order_id, event_type) DO NOTHING;
  END IF;

  receipt_event := CASE NEW.status
    WHEN 'needs_vendor_review' THEN 'vendor_review_required'
    WHEN 'vendor_review' THEN 'vendor_groups_ready'
    WHEN 'ready_to_dispatch' THEN 'owner_approved'
    WHEN 'fulfillment_queued' THEN 'fulfillment_queued'
    WHEN 'delivered' THEN 'completed'
    ELSE NULL
  END;

  IF receipt_event IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO group_total
  FROM vendor_fulfillment_groups
  WHERE order_id = NEW.id;

  SELECT COUNT(*)::INTEGER
  INTO unresolved_total
  FROM vendor_routing_exceptions
  WHERE order_id = NEW.id
    AND resolved_at IS NULL;

  INSERT INTO control_room_receipt_outbox (
    order_id,
    event_type,
    group_count,
    unresolved_count
  ) VALUES (
    NEW.id,
    receipt_event,
    group_total,
    unresolved_total
  )
  ON CONFLICT (order_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'orders_route_paid_to_private_vendors'
  ) THEN
    CREATE TRIGGER orders_route_paid_to_private_vendors
      AFTER INSERT OR UPDATE OF payment_status ON orders
      FOR EACH ROW
      EXECUTE FUNCTION route_paid_order_to_private_vendors();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'orders_queue_sanitized_control_room_receipt'
  ) THEN
    CREATE TRIGGER orders_queue_sanitized_control_room_receipt
      AFTER INSERT OR UPDATE OF status ON orders
      FOR EACH ROW
      EXECUTE FUNCTION queue_sanitized_control_room_receipt();
  END IF;
END;
$$;

-- JBH private per-variant supplier quotes. Additive only, not an activation.
-- Existing one-vendor active mapping and dispatch authority gates remain intact.
-- Offer candidates are NOT accepted supplier terms or permission to charge.
CREATE TABLE IF NOT EXISTS vendor_variant_offers (
  id BIGSERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  supplier_sku TEXT NOT NULL,
  quote_ref TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents > 0),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  duties_cents INTEGER NOT NULL DEFAULT 0 CHECK (duties_cents >= 0),
  supplier_tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (supplier_tax_cents >= 0),
  available_units INTEGER NOT NULL DEFAULT 0 CHECK (available_units >= 0),
  stock_verified_at TIMESTAMPTZ,
  quote_expires_at TIMESTAMPTZ,
  estimated_delivery_days INTEGER CHECK (estimated_delivery_days BETWEEN 1 AND 30),
  ship_to_country TEXT NOT NULL DEFAULT 'US' CHECK (ship_to_country = 'US'),
  supplier_account_verified BOOLEAN NOT NULL DEFAULT FALSE,
  commercial_terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  direct_ship_verified BOOLEAN NOT NULL DEFAULT FALSE,
  order_handoff_verified BOOLEAN NOT NULL DEFAULT FALSE,
  dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, product_id, variant, supplier_sku),
  CHECK (
    dispatch_authority = FALSE OR (
      supplier_account_verified = TRUE
      AND commercial_terms_accepted = TRUE
      AND direct_ship_verified = TRUE
      AND order_handoff_verified = TRUE
      AND verified_at IS NOT NULL
      AND stock_verified_at IS NOT NULL
      AND quote_expires_at IS NOT NULL
      AND jsonb_typeof(evidence_json) = 'array'
      AND jsonb_array_length(evidence_json) > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS vendor_variant_offers_quote_idx
  ON vendor_variant_offers (product_id, variant, quote_expires_at);

-- A supplier purchase order is not a customer charge or a supplier invoice.
-- This table records drafts for existing verified paid private orders only.
-- No supplier contacts, payments, or dispatch occur in this migration.
CREATE TABLE IF NOT EXISTS supplier_purchase_order_drafts (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  fulfillment_group_id INTEGER NOT NULL UNIQUE
    REFERENCES vendor_fulfillment_groups(id) ON DELETE RESTRICT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  quote_snapshot_json JSONB NOT NULL,
  total_payable_cents INTEGER NOT NULL CHECK (total_payable_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','awaiting_owner_review','authorized')),
  owner_authorized_at TIMESTAMPTZ,
  supplier_invoice_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state <> 'authorized' OR owner_authorized_at IS NOT NULL),
  CHECK (jsonb_typeof(quote_snapshot_json) = 'array' AND jsonb_array_length(quote_snapshot_json) > 0)
);

CREATE OR REPLACE FUNCTION guard_private_supplier_purchase_draft()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM orders o
    JOIN vendor_fulfillment_groups g ON g.order_id = o.id
    WHERE o.id = NEW.order_id
      AND o.payment_status = 'paid'
      AND g.id = NEW.fulfillment_group_id
      AND g.vendor_id = NEW.vendor_id
  ) THEN
    RAISE EXCEPTION 'verified_paid_order_and_vendor_group_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_purchase_draft_paid_order_gate ON supplier_purchase_order_drafts;
CREATE TRIGGER supplier_purchase_draft_paid_order_gate
  BEFORE INSERT OR UPDATE OF order_id, fulfillment_group_id, vendor_id
  ON supplier_purchase_order_drafts
  FOR EACH ROW EXECUTE FUNCTION guard_private_supplier_purchase_draft();

-- Crucial: no ALTER to public catalog, no vendor activation, no email send,
-- no supplier API dispatch, and no monetary transfers in this migration.

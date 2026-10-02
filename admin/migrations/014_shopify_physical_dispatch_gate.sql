-- Bind the real Shopify paid-order table to supplier dispatch authority.
--
-- The active commerce path writes to shopify_physical_orders, not the legacy
-- orders table used by the older vendor-routing API. This migration closes that
-- seam by making supplier_ordered a provider-authorized state transition.
-- It grants no new dispatch authority by itself.

CREATE TABLE IF NOT EXISTS shopify_supplier_catalog_authorities (
  supplier_code TEXT PRIMARY KEY REFERENCES vendors(code) ON DELETE RESTRICT,
  shopify_location_gid TEXT,
  sku_family_regex TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'catalog_observed'
    CHECK (state IN ('catalog_observed', 'mapping_verified', 'dispatch_active', 'blocked')),
  dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state = 'dispatch_active' OR dispatch_authority = FALSE),
  CHECK (dispatch_authority = FALSE OR verified_at IS NOT NULL)
);

-- Current Shopify truth: the active physical JBH catalog is supplied by the
-- Dropship Beauty inventory location. Exact SKU families are known, but a real
-- paid supplier-order dispatch has not yet been proven, so authority stays FALSE.
INSERT INTO shopify_supplier_catalog_authorities (
  supplier_code,
  shopify_location_gid,
  sku_family_regex,
  state,
  dispatch_authority,
  evidence_json,
  verified_at
)
VALUES (
  'dropship-beauty',
  'gid://shopify/Location/94408442099',
  '^(BRAZ-SEW-(BW|DW|LW|ST|KS|KC|AK|SW)-|BRAZ-TRANS-(CLO-(DW|ST|LW|BW)|FRO-(ST|LW))-|613-BRAZ-SEW-BW-)',
  'mapping_verified',
  FALSE,
  '["Shopify readback verified the active physical JBH products carry dropship-beauty tags and tracked inventory at the Dropship Beauty location","catalog mapping is verified but supplier-order dispatch remains unproven"]'::jsonb,
  NOW()
)
ON CONFLICT (supplier_code) DO UPDATE
SET shopify_location_gid = EXCLUDED.shopify_location_gid,
    sku_family_regex = EXCLUDED.sku_family_regex,
    state = CASE
      WHEN shopify_supplier_catalog_authorities.state IN ('dispatch_active', 'blocked')
        THEN shopify_supplier_catalog_authorities.state
      ELSE EXCLUDED.state
    END,
    dispatch_authority = shopify_supplier_catalog_authorities.dispatch_authority,
    evidence_json = CASE
      WHEN shopify_supplier_catalog_authorities.dispatch_authority
        THEN shopify_supplier_catalog_authorities.evidence_json
      ELSE EXCLUDED.evidence_json
    END,
    verified_at = COALESCE(
      shopify_supplier_catalog_authorities.verified_at,
      EXCLUDED.verified_at
    ),
    updated_at = NOW();

-- Correct the stale role label without destroying historical intent rows.
UPDATE vendor_selection_intents
SET operating_role = 'current-shopify-catalog-supplier',
    updated_at = NOW()
WHERE vendor_id = (SELECT id FROM vendors WHERE code = 'dropship-beauty')
  AND operating_role = 'primary-beauty-essentials';

CREATE OR REPLACE FUNCTION assert_shopify_physical_supplier_order_authority(
  p_order_id BIGINT,
  p_supplier_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  target_order shopify_physical_orders%ROWTYPE;
  target_vendor vendors%ROWTYPE;
  catalog_authority shopify_supplier_catalog_authorities%ROWTYPE;
  bad_catalog_item BOOLEAN;
  missing_exact_mapping BOOLEAN;
  missing_binding BOOLEAN;
  dsers_required BOOLEAN;
  dsers_active BOOLEAN;
BEGIN
  SELECT * INTO target_order
  FROM shopify_physical_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shopify_dispatch_order_not_found';
  END IF;

  IF target_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'shopify_dispatch_order_not_paid';
  END IF;

  IF p_supplier_code IS NULL OR btrim(p_supplier_code) = '' THEN
    RAISE EXCEPTION 'shopify_dispatch_supplier_missing';
  END IF;

  SELECT * INTO target_vendor
  FROM vendors
  WHERE code = p_supplier_code;

  IF NOT FOUND OR target_vendor.active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'shopify_dispatch_vendor_not_active';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vendor_connection_states state
    WHERE state.vendor_id = target_vendor.id
      AND state.state = 'dispatch_active'
      AND state.dispatch_authority = TRUE
      AND state.verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'shopify_dispatch_vendor_authority_missing';
  END IF;

  SELECT * INTO catalog_authority
  FROM shopify_supplier_catalog_authorities authority
  WHERE authority.supplier_code = p_supplier_code;

  IF FOUND THEN
    IF catalog_authority.state <> 'dispatch_active'
       OR catalog_authority.dispatch_authority IS DISTINCT FROM TRUE
       OR catalog_authority.verified_at IS NULL THEN
      RAISE EXCEPTION 'shopify_dispatch_catalog_authority_missing';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(target_order.items_json) AS item(value)
      WHERE COALESCE(item.value ->> 'sku', '') !~ catalog_authority.sku_family_regex
    ) INTO bad_catalog_item;

    IF bad_catalog_item THEN
      RAISE EXCEPTION 'shopify_dispatch_supplier_sku_mismatch';
    END IF;

    RETURN;
  END IF;

  -- Non-Shopify-feed suppliers must use exact product+variant mappings. This is
  -- where future DSers/AliExpress/Alibaba/1688/Agent-backed products plug in.
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(target_order.items_json) AS item(value)
    LEFT JOIN vendor_product_mappings mapping
      ON mapping.product_id = item.value ->> 'productCode'
     AND mapping.variant = item.value ->> 'canonicalVariant'
     AND mapping.vendor_id = target_vendor.id
     AND mapping.active = TRUE
     AND mapping.dispatch_authority = TRUE
     AND mapping.supplier_sku = item.value ->> 'sku'
     AND mapping.orchestrator_code IS NOT NULL
     AND mapping.supplier_platform IS NOT NULL
     AND mapping.mapping_verified_at IS NOT NULL
    WHERE mapping.id IS NULL
  ) INTO missing_exact_mapping;

  IF missing_exact_mapping THEN
    RAISE EXCEPTION 'shopify_dispatch_exact_mapping_missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(target_order.items_json) AS item(value)
    JOIN vendor_product_mappings mapping
      ON mapping.product_id = item.value ->> 'productCode'
     AND mapping.variant = item.value ->> 'canonicalVariant'
     AND mapping.vendor_id = target_vendor.id
    LEFT JOIN vendor_dispatch_bindings binding
      ON binding.vendor_id = mapping.vendor_id
     AND binding.orchestrator_code = mapping.orchestrator_code
     AND binding.supplier_platform = mapping.supplier_platform
     AND binding.state = 'dispatch_active'
     AND binding.dispatch_authority = TRUE
     AND binding.verified_at IS NOT NULL
    WHERE binding.id IS NULL
  ) INTO missing_binding;

  IF missing_binding THEN
    RAISE EXCEPTION 'shopify_dispatch_binding_authority_missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(target_order.items_json) AS item(value)
    JOIN vendor_product_mappings mapping
      ON mapping.product_id = item.value ->> 'productCode'
     AND mapping.variant = item.value ->> 'canonicalVariant'
     AND mapping.vendor_id = target_vendor.id
    WHERE mapping.orchestrator_code = 'dsers'
  ) INTO dsers_required;

  IF dsers_required THEN
    SELECT EXISTS (
      SELECT 1
      FROM fulfillment_orchestrator_states orchestrator
      WHERE orchestrator.code = 'dsers'
        AND orchestrator.state = 'dispatch_active'
        AND orchestrator.dispatch_authority = TRUE
        AND orchestrator.verified_at IS NOT NULL
    ) INTO dsers_active;

    IF NOT dsers_active THEN
      RAISE EXCEPTION 'shopify_dispatch_dsers_authority_missing';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION guard_shopify_physical_supplier_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.procurement_status = 'supplier_ordered'
     AND OLD.procurement_status IS DISTINCT FROM 'supplier_ordered' THEN
    PERFORM assert_shopify_physical_supplier_order_authority(
      NEW.id,
      NEW.supplier_code
    );

    IF NEW.supplier_order_reference IS NULL
       OR btrim(NEW.supplier_order_reference) = '' THEN
      RAISE EXCEPTION 'shopify_dispatch_supplier_order_reference_missing';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shopify_physical_supplier_order_authority_gate
  ON shopify_physical_orders;
CREATE TRIGGER shopify_physical_supplier_order_authority_gate
  BEFORE UPDATE OF procurement_status, supplier_code, supplier_order_reference
  ON shopify_physical_orders
  FOR EACH ROW
  EXECUTE FUNCTION guard_shopify_physical_supplier_order();

-- Stop condition:
-- The active Dropship Beauty catalog is now bound to its real supplier lane, but
-- dispatch remains blocked until one current provider-backed test proves the app
-- can receive/process the paid order and the corresponding authority rows are
-- explicitly promoted. DSers stays separate and cannot claim these products.

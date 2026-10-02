-- Fail-closed dispatch authority for JBH fulfillment.
--
-- A vendor selection, Shopify inventory location, installed fulfillment app, or
-- owner approval is not enough to dispatch. Every queued fulfillment group must
-- be backed by an exact product+variant mapping with explicit dispatch authority.
-- DSers-backed mappings additionally require the DSers orchestrator itself to be
-- dispatch-active. This migration activates nothing by itself.

ALTER TABLE vendor_product_mappings
  ADD COLUMN IF NOT EXISTS supplier_sku TEXT,
  ADD COLUMN IF NOT EXISTS orchestrator_code TEXT,
  ADD COLUMN IF NOT EXISTS supplier_platform TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mapping_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mapping_verified_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendor_product_mapping_dispatch_authority_check'
  ) THEN
    ALTER TABLE vendor_product_mappings
      ADD CONSTRAINT vendor_product_mapping_dispatch_authority_check
      CHECK (
        dispatch_authority = FALSE OR (
          supplier_sku IS NOT NULL
          AND orchestrator_code IS NOT NULL
          AND supplier_platform IS NOT NULL
          AND mapping_verified_at IS NOT NULL
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS vendor_product_mapping_dispatch_idx
  ON vendor_product_mappings (
    vendor_id,
    product_id,
    variant,
    active,
    dispatch_authority
  );

-- This table records how a vendor is actually dispatched. The vendor and the
-- middleware are deliberately separate identities. For example, DSers may be
-- the orchestrator while AliExpress/Alibaba/1688/Agent is the supplier platform.
CREATE TABLE IF NOT EXISTS vendor_dispatch_bindings (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  orchestrator_code TEXT NOT NULL,
  supplier_platform TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'observed'
    CHECK (state IN ('observed', 'mapping_verified', 'dispatch_active', 'blocked')),
  dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, orchestrator_code, supplier_platform),
  CHECK (state = 'dispatch_active' OR dispatch_authority = FALSE),
  CHECK (dispatch_authority = FALSE OR verified_at IS NOT NULL)
);

-- Preserve the current observed lanes without promoting them to dispatch.
-- Dropship Beauty is the inventory-backed live supplier lane observed in Shopify.
INSERT INTO vendor_dispatch_bindings (
  vendor_id,
  orchestrator_code,
  supplier_platform,
  state,
  dispatch_authority,
  evidence_json,
  verified_at
)
SELECT
  vendors.id,
  'shopify_supplier_feed',
  'dropship-beauty',
  'observed',
  FALSE,
  '["Shopify inventory/location evidence exists; supplier purchase/dispatch mechanics are not yet proven"]'::jsonb,
  NULL::timestamptz
FROM vendors
WHERE vendors.code = 'dropship-beauty'
ON CONFLICT (vendor_id, orchestrator_code, supplier_platform) DO UPDATE
SET state = CASE
      WHEN vendor_dispatch_bindings.state IN ('mapping_verified', 'dispatch_active', 'blocked')
        THEN vendor_dispatch_bindings.state
      ELSE EXCLUDED.state
    END,
    dispatch_authority = vendor_dispatch_bindings.dispatch_authority,
    evidence_json = CASE
      WHEN vendor_dispatch_bindings.dispatch_authority
        THEN vendor_dispatch_bindings.evidence_json
      ELSE EXCLUDED.evidence_json
    END,
    verified_at = vendor_dispatch_bindings.verified_at,
    updated_at = NOW();

-- Faire is a valid sourcing/account lane, but JBH has no retailer API dispatch
-- proof. Keep it explicit and fail-closed until exact product/order mechanics are
-- verified through the supported Shopify/Faire workflow.
INSERT INTO vendor_dispatch_bindings (
  vendor_id,
  orchestrator_code,
  supplier_platform,
  state,
  dispatch_authority,
  evidence_json,
  verified_at
)
SELECT
  vendors.id,
  'manual',
  'faire',
  'observed',
  FALSE,
  '["Faire account/Shopify integration is a sourcing and sync lane; no automatic JBH customer-order supplier dispatch authority is proven"]'::jsonb,
  NULL::timestamptz
FROM vendors
WHERE vendors.code = 'faire'
ON CONFLICT (vendor_id, orchestrator_code, supplier_platform) DO UPDATE
SET state = CASE
      WHEN vendor_dispatch_bindings.state IN ('mapping_verified', 'dispatch_active', 'blocked')
        THEN vendor_dispatch_bindings.state
      ELSE EXCLUDED.state
    END,
    dispatch_authority = vendor_dispatch_bindings.dispatch_authority,
    evidence_json = CASE
      WHEN vendor_dispatch_bindings.dispatch_authority
        THEN vendor_dispatch_bindings.evidence_json
      ELSE EXCLUDED.evidence_json
    END,
    verified_at = vendor_dispatch_bindings.verified_at,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION assert_vendor_group_dispatch_authority(
  p_group_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  target_group vendor_fulfillment_groups%ROWTYPE;
  target_vendor vendors%ROWTYPE;
  missing_mapping BOOLEAN;
  invalid_binding BOOLEAN;
  dsers_required BOOLEAN;
  dsers_active BOOLEAN;
BEGIN
  SELECT * INTO target_group
  FROM vendor_fulfillment_groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch_group_not_found';
  END IF;

  SELECT * INTO target_vendor
  FROM vendors
  WHERE id = target_group.vendor_id;

  IF NOT FOUND OR target_vendor.active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'dispatch_vendor_not_active';
  END IF;

  -- The vendor itself must have a current dispatch-active connection state.
  IF NOT EXISTS (
    SELECT 1
    FROM vendor_connection_states state
    WHERE state.vendor_id = target_group.vendor_id
      AND state.state = 'dispatch_active'
      AND state.dispatch_authority = TRUE
      AND state.verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'dispatch_vendor_authority_missing';
  END IF;

  -- Every item in the group must resolve to the exact same vendor and exact
  -- product+variant mapping with supplier identity and verified dispatch authority.
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(target_group.items_json) AS item(value)
    LEFT JOIN vendor_product_mappings mapping
      ON mapping.product_id = item.value ->> 'id'
     AND mapping.variant = item.value ->> 'variant'
     AND mapping.vendor_id = target_group.vendor_id
     AND mapping.active = TRUE
     AND mapping.dispatch_authority = TRUE
     AND mapping.supplier_sku IS NOT NULL
     AND mapping.orchestrator_code IS NOT NULL
     AND mapping.supplier_platform IS NOT NULL
     AND mapping.mapping_verified_at IS NOT NULL
    WHERE mapping.id IS NULL
  ) INTO missing_mapping;

  IF missing_mapping THEN
    RAISE EXCEPTION 'dispatch_exact_mapping_missing';
  END IF;

  -- Each exact product mapping must also have an active vendor->orchestrator
  -- binding for the same supplier platform.
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(target_group.items_json) AS item(value)
    JOIN vendor_product_mappings mapping
      ON mapping.product_id = item.value ->> 'id'
     AND mapping.variant = item.value ->> 'variant'
     AND mapping.vendor_id = target_group.vendor_id
    LEFT JOIN vendor_dispatch_bindings binding
      ON binding.vendor_id = mapping.vendor_id
     AND binding.orchestrator_code = mapping.orchestrator_code
     AND binding.supplier_platform = mapping.supplier_platform
     AND binding.state = 'dispatch_active'
     AND binding.dispatch_authority = TRUE
     AND binding.verified_at IS NOT NULL
    WHERE binding.id IS NULL
  ) INTO invalid_binding;

  IF invalid_binding THEN
    RAISE EXCEPTION 'dispatch_binding_authority_missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(target_group.items_json) AS item(value)
    JOIN vendor_product_mappings mapping
      ON mapping.product_id = item.value ->> 'id'
     AND mapping.variant = item.value ->> 'variant'
     AND mapping.vendor_id = target_group.vendor_id
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
      RAISE EXCEPTION 'dispatch_dsers_authority_missing';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION guard_vendor_fulfillment_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'queued_for_dispatch'
     AND OLD.status IS DISTINCT FROM 'queued_for_dispatch' THEN
    PERFORM assert_vendor_group_dispatch_authority(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_fulfillment_dispatch_authority_gate
  ON vendor_fulfillment_groups;
CREATE TRIGGER vendor_fulfillment_dispatch_authority_gate
  BEFORE UPDATE OF status ON vendor_fulfillment_groups
  FOR EACH ROW
  EXECUTE FUNCTION guard_vendor_fulfillment_dispatch();

-- Double gate the job insertion too. This catches direct DB writes and protects
-- against application code bypassing the group state transition.
CREATE OR REPLACE FUNCTION guard_vendor_dispatch_job_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_vendor_group_dispatch_authority(NEW.fulfillment_group_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_dispatch_job_authority_gate
  ON vendor_dispatch_jobs;
CREATE TRIGGER vendor_dispatch_job_authority_gate
  BEFORE INSERT ON vendor_dispatch_jobs
  FOR EACH ROW
  EXECUTE FUNCTION guard_vendor_dispatch_job_insert();

-- Stop condition:
-- This migration deliberately grants ZERO new dispatch authority. Existing and
-- future mappings stay blocked until provider-backed evidence promotes the exact
-- vendor connection, exact product/variant mapping, vendor dispatch binding, and
-- DSers orchestrator state (when DSers is used) to dispatch-active.

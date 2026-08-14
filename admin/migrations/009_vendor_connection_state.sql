-- Private vendor connection state for JBH procurement.
-- Additive only. This migration does not authorize a purchase, activate a vendor,
-- create an active routing mapping, queue dispatch, or expose supplier identity publicly.

INSERT INTO vendors (code, display_name, fulfillment_email, active)
VALUES ('faire', 'Faire', NULL, FALSE)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    active = vendors.active,
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS vendor_connection_states (
  code TEXT PRIMARY KEY,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
  connection_mode TEXT NOT NULL
    CHECK (connection_mode IN (
      'manual_wholesale',
      'shopify_supplier_feed',
      'shopify_app_pending_verification'
    )),
  state TEXT NOT NULL
    CHECK (state IN (
      'pending_account',
      'selected_contacted',
      'catalog_observed',
      'terms_review',
      'ready_for_exact_mapping',
      'dispatch_active',
      'blocked'
    )),
  dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state = 'dispatch_active' OR dispatch_authority = FALSE),
  CHECK (dispatch_authority = FALSE OR verified_at IS NOT NULL)
);

INSERT INTO vendor_connection_states (
  code,
  vendor_id,
  connection_mode,
  state,
  dispatch_authority,
  evidence_json,
  verified_at
)
SELECT
  connection.code,
  vendor.id,
  connection.connection_mode,
  connection.state,
  FALSE,
  connection.evidence_json,
  connection.verified_at
FROM (
  VALUES
    (
      'dropship-bundles',
      'manual_wholesale',
      'selected_contacted',
      '["owner-selected hair dropship lane","live Shopify inventory is currently attributed to the separate Dropship Beauty location","dispatch remains disabled"]'::jsonb,
      NULL::timestamptz
    ),
    (
      'dropship-beauty',
      'shopify_supplier_feed',
      'catalog_observed',
      '["Shopify location gid://shopify/Location/94408442099 is named Dropship Beauty","stocked BRAZ-SEW Body Wave, Deep Wave, Loose Wave, and Kinky Straight variants carry available inventory at that location","catalog connection is not purchase or dispatch authority"]'::jsonb,
      TIMESTAMPTZ '2026-08-14 01:35:00+00'
    ),
    (
      'faire',
      'manual_wholesale',
      'pending_account',
      '["owner-selected wholesale sourcing lane","retailer account or API connection is not yet proven","manual procurement only until account and terms are verified"]'::jsonb,
      NULL::timestamptz
    )
) AS connection(code, connection_mode, state, evidence_json, verified_at)
JOIN vendors AS vendor ON vendor.code = connection.code
ON CONFLICT (code) DO UPDATE
SET vendor_id = EXCLUDED.vendor_id,
    connection_mode = EXCLUDED.connection_mode,
    state = CASE
      WHEN vendor_connection_states.state IN (
        'terms_review',
        'ready_for_exact_mapping',
        'dispatch_active',
        'blocked'
      ) THEN vendor_connection_states.state
      ELSE EXCLUDED.state
    END,
    dispatch_authority = vendor_connection_states.dispatch_authority,
    evidence_json = EXCLUDED.evidence_json,
    verified_at = COALESCE(vendor_connection_states.verified_at, EXCLUDED.verified_at),
    updated_at = NOW();

-- The currently stocked supplier-connected hair SKUs carry a BRAZ-SEW prefix,
-- and live Shopify inventory for those products is attributed to the Dropship Beauty
-- location. Prefill that private manual-procurement lane only. The order remains
-- procurement_needed and still requires owner action before supplier_ordered.
CREATE OR REPLACE FUNCTION hint_shopify_supplier_lane()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.supplier_code IS NULL
     AND jsonb_typeof(NEW.items_json) = 'array'
     AND jsonb_array_length(NEW.items_json) > 0
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(NEW.items_json) AS item(value)
       WHERE COALESCE(item.value ->> 'sku', '') !~ '^BRAZ-SEW-'
     ) THEN
    NEW.supplier_code := 'dropship-beauty';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shopify_physical_hint_supplier_lane ON shopify_physical_orders;
CREATE TRIGGER shopify_physical_hint_supplier_lane
  BEFORE INSERT OR UPDATE OF items_json, supplier_code ON shopify_physical_orders
  FOR EACH ROW
  EXECUTE FUNCTION hint_shopify_supplier_lane();

UPDATE shopify_physical_orders
SET supplier_code = 'dropship-beauty',
    updated_at = NOW()
WHERE supplier_code IS NULL
  AND procurement_status = 'procurement_needed'
  AND jsonb_typeof(items_json) = 'array'
  AND jsonb_array_length(items_json) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(items_json) AS item(value)
    WHERE COALESCE(item.value ->> 'sku', '') !~ '^BRAZ-SEW-'
  );

-- Deliberate stop condition:
-- vendor.active remains FALSE, vendor_product_mappings are untouched, and no
-- vendor_dispatch_jobs or external purchases are created by this migration.

-- AZ Hair Vietnam sell-readiness packet.
-- This records the observed quote/catalog and the narrow launch candidate while
-- keeping selling and dispatch fail-closed until the missing fulfillment proof exists.

CREATE TABLE IF NOT EXISTS vendor_sell_readiness (
  vendor_id INTEGER PRIMARY KEY REFERENCES vendors(id) ON DELETE RESTRICT,
  launch_product_id TEXT NOT NULL,
  launch_scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  catalog_observed BOOLEAN NOT NULL DEFAULT FALSE,
  stock_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  moq_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  fulfillment_sla_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  return_policy_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  sample_approved BOOLEAN NOT NULL DEFAULT FALSE,
  landed_cost_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  exact_shopify_mapping_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  owner_sell_approved BOOLEAN NOT NULL DEFAULT FALSE,
  state TEXT NOT NULL DEFAULT 'evidence_needed'
    CHECK (state IN (
      'evidence_needed',
      'ready_for_exact_mapping',
      'active',
      'blocked'
    )),
  sell_authority BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(launch_scope_json) = 'object'),
  CHECK (jsonb_typeof(evidence_json) = 'array'),
  CHECK (state = 'active' OR sell_authority = FALSE),
  CHECK (
    sell_authority = FALSE OR (
      catalog_observed
      AND stock_confirmed
      AND moq_confirmed
      AND fulfillment_sla_confirmed
      AND return_policy_confirmed
      AND sample_approved
      AND landed_cost_confirmed
      AND exact_shopify_mapping_confirmed
      AND owner_sell_approved
      AND verified_at IS NOT NULL
    )
  )
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
  'az-hair-vietnam',
  vendors.id,
  'manual_wholesale',
  'catalog_observed',
  FALSE,
  '["owner-supplied WhatsApp price sheets show AZ Hair Vietnam bone-straight catalog","A++ Double Drawn and A+++ Super Double Drawn are quoted in USD per 100g","observed matrix spans 6-32 inches across Natural, Light Brown, and Light Blonde","stock, MOQ, shipping SLA, returns, and exact order path are not yet verified"]'::jsonb,
  NOW()
FROM vendors
WHERE vendors.code = 'az-hair-vietnam'
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

INSERT INTO vendor_quotes (
  vendor_id,
  source_message_id,
  quote_reference,
  currency,
  status,
  reply_received_at,
  terms_summary
)
SELECT
  vendors.id,
  'owner-whatsapp-price-sheet-bone-straight-2026-09',
  'AZ Hair bone-straight price sheets',
  'USD',
  'under_review',
  NOW(),
  'A++ Double Drawn and A+++ Super Double Drawn; USD per 100g; 6-32 inches; Natural, Light Brown, Light Blonde. Exact stock, MOQ, shipping, returns, and payment terms remain unverified.'
FROM vendors
WHERE vendors.code = 'az-hair-vietnam'
ON CONFLICT (vendor_id, source_message_id) DO UPDATE
SET quote_reference = EXCLUDED.quote_reference,
    status = CASE
      WHEN vendor_quotes.status IN ('sample_ready', 'rejected', 'expired') THEN vendor_quotes.status
      ELSE EXCLUDED.status
    END,
    terms_summary = EXCLUDED.terms_summary,
    updated_at = NOW();

INSERT INTO vendor_sell_readiness (
  vendor_id,
  launch_product_id,
  launch_scope_json,
  catalog_observed,
  stock_confirmed,
  moq_confirmed,
  fulfillment_sla_confirmed,
  return_policy_confirmed,
  sample_approved,
  landed_cost_confirmed,
  exact_shopify_mapping_confirmed,
  owner_sell_approved,
  state,
  sell_authority,
  evidence_json,
  verified_at
)
SELECT
  vendors.id,
  'bundle-bonestraight',
  '{"product_id":"bundle-bonestraight","quality":"A+++ Super Double Drawn","color":"Natural","weight_grams":100,"lengths_inches":[14,16,18,20,22,24,26,28,30],"channel":"Shopify","mode":"candidate_until_exact_mapping"}'::jsonb,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  'evidence_needed',
  FALSE,
  '["catalog and quote sheet observed","launch candidate intentionally narrowed to A+++ Natural 14-30 inches","supplier inventory availability is unverified","MOQ is unverified","fulfillment SLA is unverified","returns or replacement policy is unverified","sample quality is unapproved","landed cost is unconfirmed","exact Shopify-to-AZ variant mapping is unverified","owner sell approval remains a separate final gate"]'::jsonb,
  NOW()
FROM vendors
WHERE vendors.code = 'az-hair-vietnam'
ON CONFLICT (vendor_id) DO UPDATE
SET launch_product_id = EXCLUDED.launch_product_id,
    launch_scope_json = EXCLUDED.launch_scope_json,
    catalog_observed = TRUE,
    evidence_json = EXCLUDED.evidence_json,
    verified_at = COALESCE(vendor_sell_readiness.verified_at, EXCLUDED.verified_at),
    updated_at = NOW();

-- Deliberate stop condition:
-- AZ remains a private, inactive vendor. This migration creates no active vendor
-- product mapping, publishes no Shopify variant, queues no dispatch, and grants
-- neither sell authority nor purchase authority. Once every readiness proof is
-- verified, the exact mapping can be promoted in a separate owner-approved step.

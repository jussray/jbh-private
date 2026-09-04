-- Records fulfillment middleware separately from supplier/vendor identity.
-- Observation is not dispatch authority: an installed Shopify app cannot route,
-- purchase, or fulfill a JBH order until its exact product mapping is proven.

CREATE TABLE IF NOT EXISTS fulfillment_orchestrator_states (
  code TEXT PRIMARY KEY,
  shopify_app_handle TEXT NOT NULL,
  shopify_app_installation_gid TEXT,
  state TEXT NOT NULL
    CHECK (state IN (
      'installation_observed',
      'mapping_verified',
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

INSERT INTO fulfillment_orchestrator_states (
  code,
  shopify_app_handle,
  shopify_app_installation_gid,
  state,
  dispatch_authority,
  evidence_json,
  verified_at
)
VALUES (
  'dsers',
  'dsers-1',
  'gid://shopify/AppInstallation/732770730227',
  'installation_observed',
  FALSE,
  '["Shopify Admin reports DSers-AliExpress Dropshipping installed on the JBH shop","installation alone does not prove BRAZ-SEW product mapping or supplier dispatch authority","paid BRAZ-SEW orders remain procurement_needed until exact route proof exists"]'::jsonb,
  NOW()
)
ON CONFLICT (code) DO UPDATE
SET shopify_app_handle = EXCLUDED.shopify_app_handle,
    shopify_app_installation_gid = EXCLUDED.shopify_app_installation_gid,
    state = CASE
      WHEN fulfillment_orchestrator_states.state IN (
        'mapping_verified',
        'dispatch_active',
        'blocked'
      ) THEN fulfillment_orchestrator_states.state
      ELSE EXCLUDED.state
    END,
    dispatch_authority = fulfillment_orchestrator_states.dispatch_authority,
    evidence_json = EXCLUDED.evidence_json,
    verified_at = COALESCE(fulfillment_orchestrator_states.verified_at, EXCLUDED.verified_at),
    updated_at = NOW();

-- Deliberate stop condition:
-- This migration records DSers as observed middleware only. It does not activate a
-- vendor, create a vendor-product mapping, enqueue dispatch, or place a purchase.

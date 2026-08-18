-- Private, non-authoritative wig assortment candidates for JBH.
-- Catalog observation is not supplier-variant proof. This migration MUST NOT
-- create vendor_product_mappings, activate vendors, authorize dispatch, change
-- Shopify products, or affect the public storefront.

CREATE TABLE IF NOT EXISTS vendor_assortment_candidates (
  id BIGSERIAL PRIMARY KEY,
  vendor_code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('wig')),
  supplier_product_name TEXT NOT NULL,
  normalized_texture TEXT NOT NULL,
  normalized_construction TEXT NOT NULL,
  source_url TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'catalog_observed'
    CHECK (state IN (
      'catalog_observed',
      'variant_proof_required',
      'ready_for_exact_mapping',
      'rejected'
    )),
  supplier_product_id TEXT,
  supplier_variant_id TEXT,
  supplier_sku TEXT,
  verified_options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_code, supplier_product_name),
  CHECK (
    state <> 'ready_for_exact_mapping'
    OR (
      supplier_product_id IS NOT NULL
      AND supplier_variant_id IS NOT NULL
      AND supplier_sku IS NOT NULL
      AND jsonb_typeof(verified_options_json) = 'array'
      AND jsonb_array_length(verified_options_json) > 0
      AND verified_at IS NOT NULL
    )
  )
);

INSERT INTO vendor_assortment_candidates (
  vendor_code,
  category,
  supplier_product_name,
  normalized_texture,
  normalized_construction,
  source_url,
  state,
  evidence_json
)
VALUES
  ('dropship-beauty','wig','Body Wave Front Lace Wig','body_wave','front_lace','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','HD Body Wave Lace Front Wig','body_wave','hd_front_lace','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Brazilian Body Wave U-Part Wig','body_wave','u_part','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Deep Wave Front Lace Wig','deep_wave','front_lace','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','HD Deep Wave Lace Front Wig','deep_wave','hd_front_lace','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Brazilian Deep Wave U-Part Wig','deep_wave','u_part','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Straight Front Lace Wig','straight','front_lace','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','HD Straight Lace Front Wig','straight','hd_front_lace','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Brazilian Straight U-Part Wig','straight','u_part','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Kinky Straight Transparent Closure Wig','kinky_straight','transparent_closure','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Brazilian Kinky Straight U-Part Wig','kinky_straight','u_part','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb),
  ('dropship-beauty','wig','Brazilian Loose Wave Front Lace Wig','loose_wave','front_lace','https://hello.dropshipbeauty.app/collections/wigs/','variant_proof_required','["observed in current Dropship Beauty wig catalog","exact supplier variant IDs/SKUs/options not yet proven"]'::jsonb)
ON CONFLICT (vendor_code, supplier_product_name) DO UPDATE
SET normalized_texture = EXCLUDED.normalized_texture,
    normalized_construction = EXCLUDED.normalized_construction,
    source_url = EXCLUDED.source_url,
    evidence_json = EXCLUDED.evidence_json,
    state = CASE
      WHEN vendor_assortment_candidates.state IN ('ready_for_exact_mapping','rejected')
        THEN vendor_assortment_candidates.state
      ELSE EXCLUDED.state
    END,
    updated_at = NOW();

-- Deliberate stop condition: candidates cannot route or dispatch orders.
-- Exact supplier variant IDs, SKUs, option values, and verification timestamps
-- must be written before a candidate can advance to ready_for_exact_mapping.

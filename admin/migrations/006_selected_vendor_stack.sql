-- Selected JBH vendor stack and provisional product roles.
-- The owner has selected these seven companies for the operating plan.
-- They are inserted as inactive private vendors. This migration creates no
-- active routing mapping, fulfillment group, dispatch job, purchase, or email.

CREATE TABLE IF NOT EXISTS vendor_selection_intents (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE RESTRICT,
  operating_role TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'selected_contacted'
    CHECK (state IN (
      'selected_contacted',
      'account_confirmed',
      'terms_approved',
      'sample_approved',
      'ready_for_exact_mapping',
      'active',
      'rejected'
    )),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  account_confirmed_at TIMESTAMPTZ,
  terms_approved_at TIMESTAMPTZ,
  sample_approved_at TIMESTAMPTZ,
  exact_mapping_ready_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  owner_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state <> 'active' OR activated_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS vendor_intent_product_assignments (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  assignment_role TEXT NOT NULL
    CHECK (assignment_role IN ('primary', 'secondary', 'backup', 'premium-backup')),
  status TEXT NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('provisional', 'verified', 'rejected', 'promoted')),
  variant_scope_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, product_id, assignment_role)
);

CREATE INDEX IF NOT EXISTS vendor_selection_state_idx
  ON vendor_selection_intents (state, updated_at);

CREATE INDEX IF NOT EXISTS vendor_intent_product_idx
  ON vendor_intent_product_assignments (product_id, status, assignment_role);

INSERT INTO vendors (code, display_name, fulfillment_email, active)
VALUES
  ('dropship-bundles', 'Dropship Bundles', 'Service@DropshipBundles.com', FALSE),
  ('dropship-beauty', 'Dropship Beauty', 'service@dropshipbeauty.com', FALSE),
  ('apohair', 'APOHAIR', 'wholesale@apohair.com', FALSE),
  ('5s-hair', '5S Hair Factory', 'info@5shair.com', FALSE),
  ('az-hair-vietnam', 'AZ Hair Vietnam', 'sale@azhairvietnam.com', FALSE),
  ('jaipur-hair', 'Jaipur Hair', 'info@jaipurhair.com', FALSE),
  ('indique', 'Indique Hair', 'retailers@indiquehair.com', FALSE)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    fulfillment_email = EXCLUDED.fulfillment_email,
    active = vendors.active,
    updated_at = NOW();

INSERT INTO vendor_selection_intents (vendor_id, operating_role, state, selected_at)
SELECT id, role, 'selected_contacted', TIMESTAMPTZ '2026-08-02 22:15:00+00'
FROM (
  VALUES
    ('dropship-bundles', 'primary-us-hair-dropship'),
    ('dropship-beauty', 'primary-beauty-essentials'),
    ('5s-hair', 'primary-bone-straight-factory'),
    ('jaipur-hair', 'primary-indian-temple-hair'),
    ('apohair', 'backup-vietnamese-factory'),
    ('az-hair-vietnam', 'secondary-vietnamese-factory'),
    ('indique', 'premium-indian-backup')
) AS selected(code, role)
JOIN vendors ON vendors.code = selected.code
ON CONFLICT (vendor_id) DO UPDATE
SET operating_role = EXCLUDED.operating_role,
    updated_at = NOW();

INSERT INTO vendor_intent_product_assignments (
  vendor_id,
  product_id,
  assignment_role,
  variant_scope_json
)
SELECT vendors.id, assignments.product_id, assignments.assignment_role, assignments.variants
FROM (
  VALUES
    ('dropship-bundles','bundle-bodywave','primary','["14\"","16\"","18\"","20\"","22\"","24\"","26\""]'::jsonb),
    ('dropship-bundles','bundle-deepwave','primary','["14\"","18\"","22\"","26\""]'::jsonb),
    ('dropship-bundles','bundle-loosewave','primary','["14\"","18\"","22\"","26\""]'::jsonb),
    ('dropship-bundles','bundle-kinkystraight','primary','["14\"","18\"","22\"","26\""]'::jsonb),
    ('dropship-bundles','closure-4x4','primary','["16\""]'::jsonb),
    ('dropship-bundles','closure-5x5','primary','["16\""]'::jsonb),
    ('dropship-bundles','frontal-13x4','primary','["18\""]'::jsonb),
    ('dropship-bundles','wig-glueless-bodywave','primary','["18\""]'::jsonb),
    ('dropship-bundles','wig-13x4-straight','primary','["22\""]'::jsonb),
    ('dropship-bundles','wig-upart-deepwave','primary','["20\""]'::jsonb),
    ('dropship-bundles','wig-13x6-bob','primary','["10\" bob"]'::jsonb),

    ('dropship-beauty','edge-control','primary','["4 oz"]'::jsonb),
    ('dropship-beauty','lace-melt-spray','primary','["2 oz"]'::jsonb),
    ('dropship-beauty','hair-oil','primary','["2 oz"]'::jsonb),

    ('5s-hair','bundle-bonestraight','primary','["14\"","18\"","22\"","26\""]'::jsonb),
    ('jaipur-hair','bundle-royal-indian','primary','["14\"","18\"","22\"","26\""]'::jsonb),

    ('apohair','bundle-bodywave','backup','["14\"","16\"","18\"","20\"","22\"","24\"","26\""]'::jsonb),
    ('apohair','bundle-bonestraight','backup','["14\"","18\"","22\"","26\""]'::jsonb),
    ('apohair','bundle-deepwave','backup','["14\"","18\"","22\"","26\""]'::jsonb),
    ('apohair','bundle-loosewave','backup','["14\"","18\"","22\"","26\""]'::jsonb),
    ('apohair','bundle-kinkystraight','backup','["14\"","18\"","22\"","26\""]'::jsonb),
    ('apohair','closure-4x4','backup','["16\""]'::jsonb),
    ('apohair','closure-5x5','backup','["16\""]'::jsonb),
    ('apohair','frontal-13x4','backup','["18\""]'::jsonb),
    ('apohair','wig-glueless-bodywave','backup','["18\""]'::jsonb),
    ('apohair','wig-13x4-straight','backup','["22\""]'::jsonb),
    ('apohair','wig-upart-deepwave','backup','["20\""]'::jsonb),
    ('apohair','wig-13x6-bob','backup','["10\" bob"]'::jsonb),

    ('az-hair-vietnam','bundle-bodywave','secondary','["14\"","16\"","18\"","20\"","22\"","24\"","26\""]'::jsonb),
    ('az-hair-vietnam','bundle-bonestraight','secondary','["14\"","18\"","22\"","26\""]'::jsonb),
    ('az-hair-vietnam','bundle-loosewave','secondary','["14\"","18\"","22\"","26\""]'::jsonb),
    ('az-hair-vietnam','closure-4x4','secondary','["16\""]'::jsonb),
    ('az-hair-vietnam','closure-5x5','secondary','["16\""]'::jsonb),
    ('az-hair-vietnam','frontal-13x4','secondary','["18\""]'::jsonb),
    ('az-hair-vietnam','wig-glueless-bodywave','secondary','["18\""]'::jsonb),
    ('az-hair-vietnam','wig-13x4-straight','secondary','["22\""]'::jsonb),
    ('az-hair-vietnam','wig-13x6-bob','secondary','["10\" bob"]'::jsonb),

    ('indique','bundle-royal-indian','backup','["14\"","18\"","22\"","26\""]'::jsonb),
    ('indique','closure-4x4','premium-backup','["16\""]'::jsonb),
    ('indique','closure-5x5','premium-backup','["16\""]'::jsonb),
    ('indique','frontal-13x4','premium-backup','["18\""]'::jsonb),
    ('indique','wig-13x4-straight','premium-backup','["22\""]'::jsonb)
) AS assignments(code, product_id, assignment_role, variants)
JOIN vendors ON vendors.code = assignments.code
ON CONFLICT (vendor_id, product_id, assignment_role) DO UPDATE
SET variant_scope_json = EXCLUDED.variant_scope_json,
    updated_at = NOW();

-- Every selected company exists in the private vendor registry, but inactive.
-- Runtime routing still reads only active vendors plus active exact mappings.
-- Provisional intent assignments are not read by the routing engine.

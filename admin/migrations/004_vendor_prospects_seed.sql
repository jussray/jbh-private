-- Private vendor prospect quarantine derived from owner-provided sourcing artifacts.
-- This migration creates no active vendor, product mapping, fulfillment group,
-- dispatch job, external message, credential, or production order.

CREATE TABLE IF NOT EXISTS vendor_prospects (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prospect'
    CHECK (status IN (
      'prospect',
      'contacted',
      'sample_ordered',
      'sample_approved',
      'rejected',
      'promoted'
    )),
  product_candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  contacted_at TIMESTAMPTZ,
  sample_ordered_at TIMESTAMPTZ,
  sample_approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  promoted_vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status = 'promoted' AND promoted_vendor_id IS NOT NULL AND promoted_at IS NOT NULL)
    OR
    (status <> 'promoted' AND promoted_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS vendor_prospects_status_idx
  ON vendor_prospects (status, updated_at);

INSERT INTO vendor_prospects (
  code,
  display_name,
  contact_email,
  website_url,
  status,
  product_candidates_json,
  evidence_json
)
SELECT
  prospect.code,
  prospect.display_name,
  prospect.contact_email,
  prospect.website_url,
  'prospect',
  prospect.product_candidates_json,
  prospect.evidence_json
FROM (
  VALUES
    (
      'dropship-bundles',
      'Dropship Bundles',
      'Service@DropshipBundles.com',
      'https://www.dropshipbundles.com',
      '["bundle-bodywave","bundle-deepwave","bundle-loosewave","bundle-kinkystraight","closure-4x4","closure-5x5","frontal-13x4","wig-glueless-bodywave","wig-13x4-straight","wig-upart-deepwave","wig-13x6-bob"]'::jsonb,
      '["owner outreach kit","official contact verified 2026-08-02"]'::jsonb
    ),
    (
      'dropship-beauty',
      'Dropship Beauty',
      'service@dropshipbeauty.com',
      'https://www.dropshipbeauty.com',
      '["bundle-bodywave","bundle-deepwave","bundle-loosewave","bundle-kinkystraight","closure-4x4","closure-5x5","frontal-13x4","wig-glueless-bodywave","wig-13x4-straight","wig-upart-deepwave","wig-13x6-bob","edge-control","lace-melt-spray","hair-oil"]'::jsonb,
      '["legacy static routing map","owner outreach kit","official contact verified 2026-08-02"]'::jsonb
    ),
    (
      'apohair',
      'APOHAIR',
      'wholesale@apohair.com',
      'https://apohair.com',
      '["bundle-bodywave","bundle-bonestraight","bundle-deepwave","bundle-loosewave","bundle-kinkystraight","closure-4x4","closure-5x5","frontal-13x4","wig-glueless-bodywave","wig-13x4-straight","wig-upart-deepwave","wig-13x6-bob"]'::jsonb,
      '["owner outreach kit","official contact verified 2026-08-02"]'::jsonb
    ),
    (
      '5s-hair',
      '5S Hair Factory',
      'info@5shair.com',
      'https://5shair.com',
      '["bundle-bonestraight","bundle-bodywave","bundle-deepwave","closure-4x4","closure-5x5"]'::jsonb,
      '["owner outreach kit","official contact verified 2026-08-02"]'::jsonb
    ),
    (
      'az-hair-vietnam',
      'AZ Hair Vietnam',
      'sale@azhairvietnam.com',
      'https://www.azhairvietnam.com',
      '["bundle-bodywave","bundle-bonestraight","bundle-loosewave","closure-4x4","closure-5x5","frontal-13x4","wig-glueless-bodywave","wig-13x4-straight","wig-13x6-bob"]'::jsonb,
      '["owner outreach kit","official contact corrected and verified 2026-08-02"]'::jsonb
    ),
    (
      'jaipur-hair',
      'Jaipur Hair',
      'info@jaipurhair.com',
      'https://www.jaipurhair.com',
      '["bundle-royal-indian"]'::jsonb,
      '["legacy static routing map","official contact verified 2026-08-02"]'::jsonb
    ),
    (
      'indique',
      'Indique Hair',
      'retailers@indiquehair.com',
      'https://www.indiquehair.com',
      '["bundle-royal-indian","closure-4x4","closure-5x5","frontal-13x4","wig-13x4-straight"]'::jsonb,
      '["owner outreach kit","official retailer contact verified 2026-08-02"]'::jsonb
    )
) AS prospect(
  code,
  display_name,
  contact_email,
  website_url,
  product_candidates_json,
  evidence_json
)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    contact_email = EXCLUDED.contact_email,
    website_url = EXCLUDED.website_url,
    product_candidates_json = EXCLUDED.product_candidates_json,
    evidence_json = EXCLUDED.evidence_json,
    updated_at = NOW();

-- Promotion is deliberately absent. The owner-only application must explicitly
-- create an inactive/active vendor decision after terms and sample approval,
-- then create exact product + variant mappings in a separate audited action.

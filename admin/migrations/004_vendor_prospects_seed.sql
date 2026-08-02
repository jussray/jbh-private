-- Private vendor prospect evidence derived from owner-provided sourcing artifacts.
-- These seven companies are now owner-selected and contacted. This migration
-- still creates no active product mapping, fulfillment group, dispatch job,
-- external purchase, credential, or production order.

CREATE TABLE IF NOT EXISTS vendor_prospects (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'selected_contacted'
    CHECK (status IN (
      'selected_contacted',
      'replied',
      'terms_review',
      'sample_requested',
      'sample_ordered',
      'sample_approved',
      'rejected',
      'promoted'
    )),
  product_candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  contacted_at TIMESTAMPTZ,
  reply_received_at TIMESTAMPTZ,
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
  evidence_json,
  contacted_at
)
SELECT
  prospect.code,
  prospect.display_name,
  prospect.contact_email,
  prospect.website_url,
  'selected_contacted',
  prospect.product_candidates_json,
  prospect.evidence_json,
  TIMESTAMPTZ '2026-08-02 22:15:00+00'
FROM (
  VALUES
    (
      'dropship-bundles',
      'Dropship Bundles',
      'Service@DropshipBundles.com',
      'https://www.dropshipbundles.com',
      '["bundle-bodywave","bundle-deepwave","bundle-loosewave","bundle-kinkystraight","closure-4x4","closure-5x5","frontal-13x4","wig-glueless-bodywave","wig-13x4-straight","wig-upart-deepwave","wig-13x6-bob"]'::jsonb,
      '["owner-selected","owner outreach kit","official contact verified 2026-08-02","Gmail sent receipt"]'::jsonb
    ),
    (
      'dropship-beauty',
      'Dropship Beauty',
      'service@dropshipbeauty.com',
      'https://www.dropshipbeauty.com',
      '["edge-control","lace-melt-spray","hair-oil"]'::jsonb,
      '["owner-selected","owner outreach kit","official contact verified 2026-08-02","Gmail sent receipt"]'::jsonb
    ),
    (
      'apohair',
      'APOHAIR',
      'wholesale@apohair.com',
      'https://apohair.com',
      '["bundle-bodywave","bundle-bonestraight","bundle-deepwave","bundle-loosewave","bundle-kinkystraight","closure-4x4","closure-5x5","frontal-13x4","wig-glueless-bodywave","wig-13x4-straight","wig-upart-deepwave","wig-13x6-bob"]'::jsonb,
      '["owner-selected","owner outreach kit","official contact verified 2026-08-02","Gmail sent receipt"]'::jsonb
    ),
    (
      '5s-hair',
      '5S Hair Factory',
      'info@5shair.com',
      'https://5shair.com',
      '["bundle-bonestraight"]'::jsonb,
      '["owner-selected","owner outreach kit","official contact verified 2026-08-02","Gmail sent receipt"]'::jsonb
    ),
    (
      'az-hair-vietnam',
      'AZ Hair Vietnam',
      'sale@azhairvietnam.com',
      'https://www.azhairvietnam.com',
      '["bundle-bodywave","bundle-bonestraight","bundle-loosewave","closure-4x4","closure-5x5","frontal-13x4","wig-glueless-bodywave","wig-13x4-straight","wig-13x6-bob"]'::jsonb,
      '["owner-selected","owner outreach kit","official contact corrected and verified 2026-08-02","Gmail sent receipt"]'::jsonb
    ),
    (
      'jaipur-hair',
      'Jaipur Hair',
      'info@jaipurhair.com',
      'https://www.jaipurhair.com',
      '["bundle-royal-indian"]'::jsonb,
      '["owner-selected","legacy static routing map","official contact verified 2026-08-02","Gmail sent receipt"]'::jsonb
    ),
    (
      'indique',
      'Indique Hair',
      'retailers@indiquehair.com',
      'https://www.indiquehair.com',
      '["bundle-royal-indian","closure-4x4","closure-5x5","frontal-13x4","wig-13x4-straight"]'::jsonb,
      '["owner-selected","owner outreach kit","official retailer contact verified 2026-08-02","Gmail sent receipt"]'::jsonb
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
    status = CASE
      WHEN vendor_prospects.status IN ('replied','terms_review','sample_requested','sample_ordered','sample_approved','rejected','promoted')
        THEN vendor_prospects.status
      ELSE 'selected_contacted'
    END,
    product_candidates_json = EXCLUDED.product_candidates_json,
    evidence_json = EXCLUDED.evidence_json,
    contacted_at = COALESCE(vendor_prospects.contacted_at, EXCLUDED.contacted_at),
    updated_at = NOW();

-- Selection and contact are recorded. Promotion remains a separate owner-only
-- decision after terms, samples, and exact product + variant mapping evidence.

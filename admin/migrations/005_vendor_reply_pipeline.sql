-- Owner-only vendor reply and sample-review pipeline.
-- This migration records evidence from vendor conversations. It does not
-- activate a vendor, create a product mapping, queue fulfillment, or send mail.

ALTER TABLE vendor_prospects
  ADD COLUMN IF NOT EXISTS reply_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_summary TEXT,
  ADD COLUMN IF NOT EXISTS pricing_summary TEXT,
  ADD COLUMN IF NOT EXISTS sample_terms TEXT,
  ADD COLUMN IF NOT EXISTS shipping_summary TEXT,
  ADD COLUMN IF NOT EXISTS branding_summary TEXT,
  ADD COLUMN IF NOT EXISTS red_flags TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS owner_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

ALTER TABLE vendor_prospects
  DROP CONSTRAINT IF EXISTS vendor_prospects_status_check;

ALTER TABLE vendor_prospects
  ADD CONSTRAINT vendor_prospects_status_check
  CHECK (status IN (
    'prospect',
    'contacted',
    'replied',
    'terms_review',
    'sample_requested',
    'sample_ordered',
    'sample_approved',
    'rejected',
    'promoted'
  ));

-- These seven outreach messages were sent through the owner's Gmail account on
-- 2026-08-02. This update records only that verified communication event.
UPDATE vendor_prospects
SET status = 'contacted',
    contacted_at = COALESCE(contacted_at, TIMESTAMPTZ '2026-08-02 22:15:00+00'),
    updated_at = NOW()
WHERE code IN (
  'dropship-bundles',
  'dropship-beauty',
  'apohair',
  '5s-hair',
  'az-hair-vietnam',
  'jaipur-hair',
  'indique'
)
  AND status = 'prospect';

CREATE INDEX IF NOT EXISTS vendor_prospects_reply_idx
  ON vendor_prospects (reply_received_at, status, updated_at);

-- Promotion remains outside this pipeline. A sample-approved prospect still
-- cannot route an order until a separate owner action creates a vendor record
-- and exact product + variant mappings.

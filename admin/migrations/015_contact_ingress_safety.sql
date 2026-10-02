-- Private contact-ingress evidence and duplicate protection.
-- Current-main port of the historical contact migration.
-- Number 015 is reserved after the still-active paid-order migration intent 011-014.
-- Source merge alone does not authorize applying this migration to production.
-- Additive only: this migration does not delete or rewrite contact messages.

ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS receipt_id TEXT,
  ADD COLUMN IF NOT EXISTS submission_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS contact_messages_receipt_idx
  ON contact_messages (receipt_id)
  WHERE receipt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contact_messages_submission_fingerprint_idx
  ON contact_messages (submission_fingerprint)
  WHERE submission_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON contact_messages (created_at DESC);

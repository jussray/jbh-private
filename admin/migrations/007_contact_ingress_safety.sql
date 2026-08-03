-- Private contact-ingress evidence and duplicate protection.
-- Apply after admin/migrations/001_init.sql.
-- This migration is additive and does not delete or rewrite contact messages.

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

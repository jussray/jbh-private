-- Source merge alone does not authorize applying this migration to production.
-- Canonical-store migration: extend the pre-existing newsletter table rather
-- than creating a second subscriber source of truth.
-- Existing legacy rows remain unverified (subscribed IS NULL) until a separate
-- mailbox-verification process proves consent. No row is deleted or rewritten.

ALTER TABLE newsletter
  ADD COLUMN IF NOT EXISTS receipt_id UUID,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS subscribed BOOLEAN,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM newsletter
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'newsletter_duplicate_emails_require_reconciliation';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_normalized_idx
  ON newsletter (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_receipt_idx
  ON newsletter (receipt_id)
  WHERE receipt_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'newsletter_subscription_state'
      AND conrelid = 'newsletter'::regclass
  ) THEN
    ALTER TABLE newsletter
      ADD CONSTRAINT newsletter_subscription_state
      CHECK (
        (
          subscribed IS NULL
          AND receipt_id IS NULL
          AND consent_at IS NULL
          AND source IS NULL
          AND unsubscribed_at IS NULL
        )
        OR
        (
          subscribed IS TRUE
          AND receipt_id IS NOT NULL
          AND consent_at IS NOT NULL
          AND source IS NOT NULL
          AND unsubscribed_at IS NULL
        )
        OR
        (
          subscribed IS FALSE
          AND receipt_id IS NOT NULL
          AND consent_at IS NOT NULL
          AND source IS NOT NULL
          AND unsubscribed_at IS NOT NULL
        )
      );
  END IF;
END
$$;

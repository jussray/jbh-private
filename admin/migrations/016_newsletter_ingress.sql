-- Source merge alone does not authorize applying this migration to production.
-- Additive only: creates the private newsletter subscriber record used by jbh-contact-ingress.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  receipt_id UUID NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT newsletter_subscribers_email_normalized
    CHECK (email = lower(email)),
  CONSTRAINT newsletter_subscribers_subscription_state
    CHECK (
      (subscribed = TRUE AND unsubscribed_at IS NULL)
      OR
      (subscribed = FALSE AND unsubscribed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_receipt_idx
  ON newsletter_subscribers (receipt_id);

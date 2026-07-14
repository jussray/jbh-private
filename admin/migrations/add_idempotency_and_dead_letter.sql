-- Juss Beautiful Hair
-- Stripe webhook reliability: idempotency guard and dead-letter queue.
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failed_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INTEGER NOT NULL DEFAULT 1 CHECK (retry_count >= 1),
  last_error TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT failed_webhook_events_resolution_check
    CHECK (
      (resolved = FALSE AND resolved_at IS NULL)
      OR (resolved = TRUE AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS failed_webhook_events_unresolved_idx
  ON failed_webhook_events (failed_at)
  WHERE resolved = FALSE;

COMMIT;

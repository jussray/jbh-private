-- Sandbox-only payment holds; a hold wins over any later paid receipt.
CREATE TABLE IF NOT EXISTS jusspay_sandbox_holds (
  order_id text PRIMARY KEY CHECK (order_id ~ '^jbho_[0-9a-f-]{36}$'),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  payment_intent_id text NOT NULL CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  reason text NOT NULL CHECK (reason IN ('refunded','partially_refunded','disputed')),
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE jusspay_sandbox_receipts
  DROP CONSTRAINT IF EXISTS jusspay_sandbox_receipts_state_check;
ALTER TABLE jusspay_sandbox_receipts
  ADD CONSTRAINT jusspay_sandbox_receipts_state_check
  CHECK (state IN ('awaiting_owner_review','hold'));

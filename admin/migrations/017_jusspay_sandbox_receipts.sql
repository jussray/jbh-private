-- Test-only JussPay receipts; no supplier dispatch authority.
CREATE TABLE IF NOT EXISTS jusspay_sandbox_receipts (
  order_id text PRIMARY KEY CHECK (order_id ~ '^jbho_[0-9a-f-]{36}$'),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  payment_intent_id text NOT NULL CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  state text NOT NULL DEFAULT 'awaiting_owner_review' CHECK (state = 'awaiting_owner_review'),
  receipt_sha256 text NOT NULL CHECK (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now()
);

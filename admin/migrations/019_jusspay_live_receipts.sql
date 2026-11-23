-- Live JussPay receipts are isolated from the test-only receipt tables.
-- This records payment evidence for owner review; it grants no supplier dispatch authority.
CREATE TABLE IF NOT EXISTS jusspay_live_receipts (
  order_id text PRIMARY KEY CHECK (order_id ~ '^jbho_[0-9a-f-]{36}$'),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  payment_intent_id text NOT NULL CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  state text NOT NULL DEFAULT 'awaiting_owner_review'
    CHECK (state IN ('awaiting_owner_review','hold')),
  receipt_sha256 text NOT NULL CHECK (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jusspay_live_holds (
  order_id text PRIMARY KEY CHECK (order_id ~ '^jbho_[0-9a-f-]{36}$'),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  payment_intent_id text NOT NULL CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  reason text NOT NULL CHECK (reason IN ('refunded','partially_refunded','disputed')),
  received_at timestamptz NOT NULL DEFAULT now()
);

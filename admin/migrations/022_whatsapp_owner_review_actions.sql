-- JBH owner review audit: append-once decisions, no customer plaintext.
-- Additive after private WhatsApp migration 020.
CREATE TABLE IF NOT EXISTS jbh_whatsapp_review_actions (
  meta_message_id TEXT PRIMARY KEY REFERENCES jbh_whatsapp_inbox(meta_message_id) ON DELETE RESTRICT,
  resolution TEXT NOT NULL CHECK (resolution IN
    ('no_action_required','handled_externally','followup_required')),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE jbh_whatsapp_review_actions IS
  'Access-authenticated owner review metadata. Does not send a message, authorize a payment, or dispatch a supplier order.';

-- Private provider delivery receipts, additive only.
-- Meta sent/delivered/read/failed != paid order, supplier invoice or fulfilled shipment.
CREATE TABLE IF NOT EXISTS jbh_whatsapp_delivery_receipts (
  meta_message_id TEXT NOT NULL CHECK (meta_message_id ~ '^wamid\\.[A-Za-z0-9._-]{3,200}$'),
  provider_status TEXT NOT NULL CHECK (provider_status IN ('sent','delivered','read','failed')),
  provider_timestamp TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meta_message_id,provider_status)
);
CREATE INDEX IF NOT EXISTS jbh_whatsapp_delivery_receipts_time_idx
  ON jbh_whatsapp_delivery_receipts(observed_at);
COMMENT ON TABLE jbh_whatsapp_delivery_receipts IS
  'Signed Meta message-delivery evidence. Not proof of payment, supplier purchase, or shipment.';

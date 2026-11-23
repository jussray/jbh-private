-- JBH WhatsApp Business connector (private, additive, fail-closed).
-- External WhatsApp numbers are not stored: only keyed contact HMACs.
-- This migration sends no messages, activates no purchases, and grants no opt-ins.
CREATE TABLE IF NOT EXISTS jbh_whatsapp_contacts (
  contact_hash TEXT PRIMARY KEY CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
  audience TEXT NOT NULL CHECK (audience IN ('customer','vendor')),
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
  order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
  consented BOOLEAN NOT NULL DEFAULT FALSE,
  consent_evidence_ref TEXT,
  last_inbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((audience = 'vendor' AND vendor_id IS NOT NULL AND order_id IS NULL) OR
         (audience = 'customer' AND order_id IS NOT NULL AND vendor_id IS NULL)),
  CHECK (NOT consented OR (consent_evidence_ref IS NOT NULL AND length(consent_evidence_ref) >= 8))
);
CREATE TABLE IF NOT EXISTS jbh_whatsapp_inbox (
  meta_message_id TEXT PRIMARY KEY,
  contact_hash TEXT NOT NULL CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
  body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  intent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'owner_review'
    CHECK (status IN ('owner_review','auto_replied','delivery_unconfirmed')),
  meta_reply_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jbh_whatsapp_inbox_contact_idx
  ON jbh_whatsapp_inbox (contact_hash, received_at DESC);
CREATE TABLE IF NOT EXISTS jbh_whatsapp_outbox (
  idempotency_key TEXT PRIMARY KEY,
  contact_hash TEXT NOT NULL REFERENCES jbh_whatsapp_contacts(contact_hash) ON DELETE RESTRICT,
  audience TEXT NOT NULL CHECK (audience IN ('customer','vendor')),
  purpose TEXT NOT NULL CHECK (purpose IN
    ('faq','order_status','supplier_quote_request','supplier_purchase_order')),
  purchase_order_draft_id BIGINT UNIQUE REFERENCES supplier_purchase_order_drafts(id) ON DELETE RESTRICT,
  body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  state TEXT NOT NULL DEFAULT 'sending'
    CHECK (state IN ('sending','provider_accepted','delivery_unconfirmed','delivered','read','failed')),
  meta_message_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((purpose = 'supplier_purchase_order') = (purchase_order_draft_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS jbh_whatsapp_outbox_contact_idx
  ON jbh_whatsapp_outbox (contact_hash, created_at DESC);
COMMENT ON TABLE jbh_whatsapp_outbox IS
  'Private provider-acceptance receipts; not proof of supplier order acceptance, delivery, invoicing or payment.';
-- No automatic consent or vendor activation; no outbound sending from SQL.

-- Proposed additive migration. Apply only to the independently verified private JBH database.
CREATE TABLE jbh_fulfillment_review (
 tenant text NOT NULL CHECK (tenant = 'jussbeautifulhair.com'),
 order_id text NOT NULL,
 canonical_sku text NOT NULL CHECK (canonical_sku ~ '^JBH-[A-Z0-9-]{1,59}$'),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK ((jsonb_typeof(payload) = 'object' AND jsonb_typeof(payload->'tenant') = 'string' AND jsonb_typeof(payload->'orderId') = 'string' AND jsonb_typeof(payload->'canonicalSku') = 'string' AND jsonb_typeof(payload->'status') = 'string' AND payload->>'tenant' = tenant AND payload->>'orderId' = order_id AND payload->>'canonicalSku' = canonical_sku AND payload->>'status' = 'review_only' AND payload->'liveDispatch' = 'false'::jsonb AND payload->'chargesCollected' = 'false'::jsonb) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant,order_id,canonical_sku)
);
REVOKE ALL ON jbh_fulfillment_review FROM PUBLIC;

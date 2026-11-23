import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const bridge=read('../payment-worker/src/whatsapp-bridge.ts');
const entry=read('../payment-worker/src/index.ts');
const policy=read('../payment-worker/src/whatsapp-policy.ts');
const transport=read('../payment-worker/src/whatsapp-transport.ts');
const migration=read('../migrations/020_whatsapp_business_bridge.sql');
const privateEnv=read('../payment-worker/src/shared.ts');

test('Meta webhooks are signature verified before any database actions',()=>{
 assert.match(entry,/pathname === "\/webhooks\/whatsapp"/);
 assert.match(bridge,/verifyMetaSignature\(payload,request\.headers\.get\("X-Hub-Signature-256"\)/);
 assert.ok(bridge.indexOf('verifyMetaSignature(payload')<bridge.indexOf('const sql=neon(e.DATABASE_URL);'));
 assert.match(policy,/crypto\.subtle\.verify\('HMAC'/);
 assert.match(bridge,/JBH_WHATSAPP_WEBHOOK_ENABLED!=="true"/);
 assert.match(bridge,/ON CONFLICT\(meta_message_id\) DO NOTHING/);
});
test('owner-only sends do not accept inbound WhatsApp instructions as payment authority',()=>{
 assert.match(bridge,/if\(!await validateAccess\(request,e\)\)/);
 assert.match(bridge,/sourcePaidOrderVerified:paid,supplierOrderAuthorized:authorized/);
 assert.match(bridge,/o\.payment_status='paid'/);
 assert.match(bridge,/p\.state='authorized' AND p\.owner_authorized_at IS NOT NULL/);
 assert.match(bridge,/c\.dispatch_authority=TRUE/);
 assert.match(bridge,/g\.status IN \('approved','queued_for_dispatch'\)/);
 assert.match(bridge,/ON CONFLICT DO NOTHING RETURNING idempotency_key/);
 assert.match(migration,/purchase_order_draft_id BIGINT UNIQUE/);
});
test('recipients must have evidence-backed WhatsApp opt-in, and numbers remain private',()=>{
 assert.match(migration,/consented BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(migration,/consent_evidence_ref TEXT/);
 assert.match(bridge,/contact\.consented!==true/);
 assert.match(bridge,/REGEXP_REPLACE\(COALESCE\(phone,''\)/);
 assert.match(bridge,/phoneHash\(e\.JBH_WHATSAPP_CONTACT_HASH_KEY!/);
 assert.doesNotMatch(migration,/recipient_phone TEXT|phone_number TEXT|raw_message_text TEXT/);
 assert.match(migration,/body_sha256 TEXT/);
});
test('provider calls stay locked until credentials and explicit switch are present',()=>{
 assert.match(transport,/JBH_WHATSAPP_SEND_ENABLED!=='true'/);
 assert.match(transport,/https:\/\/graph\.facebook\.com\//);
 assert.match(bridge,/JBH_WHATSAPP_SEND_ENABLED!=="true"/);
 assert.match(bridge,/provider_delivery_unconfirmed/);
 assert.match(bridge,/retryAutomatically:false/);
 assert.match(privateEnv,/JBH_WHATSAPP_APP_SECRET\?: string/);
 assert.match(privateEnv,/JBH_WHATSAPP_ACCESS_TOKEN\?: string/);
});
test('business replies are approved FAQs and vendor purchases never expose buyer shipping data',()=>{
 assert.match(policy,/preapproved_response_only/);
 assert.match(bridge,/supplier_purchase_order/);
 assert.match(bridge,/orderPlaced:false/);
 assert.match(bridge,/never buyer identity or shipping address/);
 assert.doesNotMatch(bridge,/customerShippingAddress|creditCardNumber|sendCardDetails/);
});

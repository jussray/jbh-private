import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const bridge=load('../payment-worker/src/whatsapp-bridge.ts');
const store=load('../payment-worker/src/whatsapp-delivery-store.ts');
const migration=load('../migrations/021_whatsapp_delivery_receipts.sql');
test('signed WhatsApp webhook parses and stores Meta delivery receipts after HMAC',()=>{
 assert.ok(bridge.indexOf('verifyMetaSignature(payload')<bridge.indexOf('receipts=normalizeWhatsAppDeliveryEvents'));
 assert.match(bridge,/recordSignedWhatsAppDeliveryReceipt\(e\.DATABASE_URL,receipt\)/);
 assert.match(bridge,/receiptReconciliationPending:true/);
 assert.match(bridge,/reconcileWhatsAppOutboxReceipt\(e\.DATABASE_URL,sent\.messageId\)/);
 assert.match(store,/ON CONFLICT \(meta_message_id,provider_status\) DO NOTHING/);
});
test('provider delivery events are idempotent and do not create purchases or send messages',()=>{
 assert.match(migration,/PRIMARY KEY \(meta_message_id,provider_status\)/);
 assert.match(store,/jbh_whatsapp_outbox AS o/);
 assert.match(store,/WHEN o\.state = 'read'/);
 assert.match(store,/WHEN o\.state = 'delivered'/);
 assert.match(store,/WHEN o\.state = 'failed'/);
 assert.doesNotMatch(store,/sendViaMeta|stripeClient|supplierPurchase|fetch\(/);
 assert.doesNotMatch(migration,/ALTER TABLE orders|UPDATE orders|payment_status|dispatch_authority/);
});

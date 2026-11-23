import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const bridge=read('../payment-worker/src/whatsapp-bridge.ts');
const review=read('../payment-worker/src/whatsapp-owner-review.ts');
const migration=read('../migrations/022_whatsapp_owner_review_actions.sql');
test('readiness and review routes remain behind Cloudflare Access',()=>{
  const auth=bridge.indexOf('if(!await validateAccess(request,e))');
  const routed=bridge.indexOf('return handleWhatsAppOwnerReviewRequest(request,e);');
  assert.ok(auth>=0 && routed>auth);
  assert.match(review,/handleWhatsAppOwnerReviewRequest/);
  assert.match(review,/owner_review_metadata_only/);
});
test('readiness exposes presence flags, not credentials or phone numbers',()=>{
  assert.match(review,/assessWhatsAppReadiness\(env\)/);
  assert.match(review,/databaseReachable:false/);
  assert.match(review,/to_regclass\('public.jbh_whatsapp_delivery_receipts'\)/);
  assert.match(review,/to_regclass\('public.jbh_whatsapp_review_actions'\)/);
  assert.doesNotMatch(review,/SELECT[^\x60]*phone[, ]/);
  assert.doesNotMatch(review,/JSON\.stringify\(env\)|console\.log\(env\)/);
});
test('owner review is non-financial and append-once',()=>{
  assert.match(migration,/meta_message_id TEXT PRIMARY KEY REFERENCES jbh_whatsapp_inbox/);
  assert.match(review,/ON CONFLICT\(meta_message_id\) DO NOTHING/);
  assert.match(review,/supplierOrderPlaced:false/);
  assert.match(review,/customerMessageSent:false/);
  assert.doesNotMatch(review,/sendViaMeta|stripeClient|fetch\(/);
  assert.doesNotMatch(migration,/UPDATE orders|ALTER TABLE orders|supplier_purchase_order_drafts/);
});
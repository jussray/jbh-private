import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWhatsAppDeliveryEvents,reconcileWhatsAppDeliveryState} from '../../.worker-test-dist/whatsapp-delivery-model.js';
const webhook=(statuses,phone='12345678')=>JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:phone},statuses}}]}]});
const receipt=(status,id='wamid.123abcd')=>({id,status,timestamp:'1795392000',recipient_id:'15551234567'});
test('signed Meta payloads normalize delivery status without exposing recipient PII',()=>{
 const r=normalizeWhatsAppDeliveryEvents(webhook([receipt('sent'),receipt('delivered'),receipt('read')]),'12345678');
 assert.deepEqual(r.map(x=>x.status),['sent','delivered','read']);
 assert.equal(r[0].messageId,'wamid.123abcd');
 assert.equal(JSON.stringify(r).includes('15551234567'),false);
});
test('delivery receipts reject other business numbers and duplicate or malformed events',()=>{
 assert.deepEqual(normalizeWhatsAppDeliveryEvents(webhook([receipt('sent')]),'9999999'),[]);
 assert.deepEqual(normalizeWhatsAppDeliveryEvents(webhook([receipt('sent'),receipt('sent'),receipt('unknown')]),'12345678').map(x=>x.status),['sent']);
 assert.throws(()=>normalizeWhatsAppDeliveryEvents('{}','12345678'));
 assert.throws(()=>normalizeWhatsAppDeliveryEvents(webhook(Array.from({length:101},()=>receipt('sent'))),'12345678'));
});
test('out of order receipts never downgrade delivered or read evidence',()=>{
 assert.equal(reconcileWhatsAppDeliveryState('delivered',['sent']),'delivered');
 assert.equal(reconcileWhatsAppDeliveryState('read',['failed']),'read');
 assert.equal(reconcileWhatsAppDeliveryState('provider_accepted',['failed']),'failed');
 assert.equal(reconcileWhatsAppDeliveryState('delivery_unconfirmed',['sent']),'provider_accepted');
 assert.equal(reconcileWhatsAppDeliveryState('failed',['sent']),'failed');
 assert.equal(reconcileWhatsAppDeliveryState('failed',['delivered']),'delivered');
});

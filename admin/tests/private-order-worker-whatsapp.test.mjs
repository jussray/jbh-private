import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyMetaSignature,verifyWebhookChallenge,normalizeInboundWebhook,planWhatsAppReply,
  validateOutgoingMessage,WhatsAppPolicyError} from '../../.worker-test-dist/whatsapp-policy.js';
import {sendViaMeta} from '../../.worker-test-dist/whatsapp-transport.js';

const secret='test-only-meta-secret-not-real';
const body=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',
 value:{metadata:{phone_number_id:'12345678'},messages:[{id:'wamid.test123',from:'15551234567',
 timestamp:'1795392000',type:'text',text:{body:'What is my order status?'}}]}}]}]});
test('Meta handshake requires exact private verification token',()=>{
 assert.equal(verifyWebhookChallenge(new URL('https://jbh.example/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=abc123&hub.challenge=43210'),'abc123'),'43210');
 assert.equal(verifyWebhookChallenge(new URL('https://jbh.example/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=43210'),'abc123'),null);
});
test('Meta signature authenticates the exact raw payload',async()=>{
 const signature='sha256='+createHmac('sha256',secret).update(body).digest('hex');
 assert.equal(await verifyMetaSignature(body,signature,secret),true);
 assert.equal(await verifyMetaSignature(body+' ',signature,secret),false);
 assert.equal(await verifyMetaSignature(body,'sha256=bad',secret),false);
});
test('webhook ignores messages for another business number',()=>{
 assert.equal(normalizeInboundWebhook(body,'12345678').length,1);
 assert.deepEqual(normalizeInboundWebhook(body,'invalid-number'),[]);
});
test('AI assist never guesses about payment, tracking or supplier purchase',()=>{
 for(const phrase of ['Where is my order?','Please refund this','Place a purchase order'])
 assert.equal(planWhatsAppReply(phrase).mode,'owner_review');
 assert.equal(planWhatsAppReply('What are your business hours?',{business_hours:'Check the published hours.'}).mode,'approved_faq');
});
test('WhatsApp respects opt-in and 24-hour window unless template approved',()=>{
 const msg={audience:'customer',purpose:'order_status',recipient:'15551234567',
 body:'Your confirmed order status is available.',consented:true,ownerApproved:true,lastIncomingAt:1795392000000};
 assert.doesNotThrow(()=>validateOutgoingMessage(msg,1795395600000));
 assert.throws(()=>validateOutgoingMessage({...msg,consented:false},1795395600000),WhatsAppPolicyError);
 assert.throws(()=>validateOutgoingMessage(msg,1795492000000),WhatsAppPolicyError);
 assert.doesNotThrow(()=>validateOutgoingMessage({...msg,templateName:'jbh_order_update',templateApproved:true,body:null},1795492000000));
});
test('vendor order message cannot be sent without paid order and supplier authorization',()=>{
 const vendor={audience:'vendor',purpose:'supplier_purchase_order',recipient:'15551234567',
 body:'Approved order notice',consented:true,ownerApproved:true,lastIncomingAt:1795392000000};
 assert.throws(()=>validateOutgoingMessage(vendor,1795395600000));
 assert.throws(()=>validateOutgoingMessage({...vendor,sourcePaidOrderVerified:true},1795395600000));
 assert.doesNotThrow(()=>validateOutgoingMessage({...vendor,sourcePaidOrderVerified:true,supplierOrderAuthorized:true},1795395600000));
});
test('provider send uses fixed Graph domain, requires enablement and never retries',async()=>{
 const e={JBH_WHATSAPP_SEND_ENABLED:'true',JBH_WHATSAPP_ACCESS_TOKEN:'test-token',
 JBH_WHATSAPP_PHONE_NUMBER_ID:'12345678',JBH_WHATSAPP_GRAPH_VERSION:'v24.0'};
 let url='',calls=0;
 const fake=async(u,init)=>{url=u;calls++;assert.equal(JSON.parse(init.body).type,'text');
   return new Response(JSON.stringify({messages:[{id:'wamid.accepted'}]}),{status:200});};
 assert.equal((await sendViaMeta(e,{to:'15551234567',body:'Approved response.'},fake)).messageId,'wamid.accepted');
 assert.equal(url,'https://graph.facebook.com/v24.0/12345678/messages');
 assert.equal(calls,1);
 await assert.rejects(()=>sendViaMeta({...e,JBH_WHATSAPP_SEND_ENABLED:'false'},
    {to:'15551234567',body:'Approved response.'},fake));
 assert.equal(calls,1);
});
test('Meta provider rejection is not treated as message delivery',async()=>{
 const e={JBH_WHATSAPP_SEND_ENABLED:'true',JBH_WHATSAPP_ACCESS_TOKEN:'test-token',
 JBH_WHATSAPP_PHONE_NUMBER_ID:'12345678',JBH_WHATSAPP_GRAPH_VERSION:'v24.0'};
 let calls=0;const bad=async()=>{calls++;return new Response('{}',{status:403});};
 await assert.rejects(()=>sendViaMeta(e,{to:'15551234567',body:'Hello.'},bad));
 assert.equal(calls,1);
});

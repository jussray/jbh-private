import assert from "node:assert/strict";
import test from "node:test";
import { liveReceiptSecret, parseLiveReceipt, verifyLiveReceiptSignature, liveReceiptAcknowledgment } from "../../.worker-test-dist/jusspay-live-receipt-model.js";
const receipt={eventId:"evt_fixture",livemode:true,orderId:"jbho_11111111-1111-4111-8111-111111111111",paymentIntentId:"pi_fixture",state:"awaiting_owner_dispatch"};
const secret="live-fixture-"+ "a".repeat(40);
test("live receiver accepts exact receipt, not sandbox, PII or malformed fields",()=>{
 assert.deepEqual(parseLiveReceipt(receipt),receipt);
 for(const change of [{livemode:false},{email:"buyer@example.test"},{state:"dispatched"},{eventId:"evt_"},{paymentIntentId:"bad"},{orderId:"bad"}])assert.equal(parseLiveReceipt({...receipt,...change}),null);
});
test("live signature binds exact bytes and is not accepted with a sandbox key",async()=>{
 const raw=JSON.stringify(receipt), enc=new TextEncoder();
 const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=Buffer.from(await crypto.subtle.sign("HMAC",k,enc.encode(raw))).toString("hex");
 assert.equal(await verifyLiveReceiptSignature(raw,sig,secret),true);
 assert.equal(await verifyLiveReceiptSignature(raw+" ",sig,secret),false);
 assert.equal(await verifyLiveReceiptSignature(raw,sig,"sandbox-"+ "b".repeat(40)),false);
});
test("acknowledgment identifies the exact stored event and never grants dispatch authority",()=>{
 assert.deepEqual(liveReceiptAcknowledgment(receipt,{state:"hold",duplicate:true}),{schema:"jbh-private/jusspay-live-receipt@v1",received:true,livemode:true,orderId:receipt.orderId,eventId:receipt.eventId,state:"hold",duplicate:true});
 assert.equal(liveReceiptAcknowledgment(receipt,{state:"dispatched",duplicate:false}),null);
});

test("live secret gate rejects missing, disabled, reused sandbox and oversized credentials",()=>{
 const env={JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED:"true",JBH_JUSSPAY_LIVE_RECEIPT_SECRET:secret,JBH_JUSSPAY_RECEIPT_SECRET:"sandbox-"+ "b".repeat(40)};
 assert.equal(liveReceiptSecret(env),secret);
 for(const patch of [{JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED:"false"},{JBH_JUSSPAY_LIVE_RECEIPT_SECRET:undefined},{JBH_JUSSPAY_LIVE_RECEIPT_SECRET:"short"},{JBH_JUSSPAY_RECEIPT_SECRET:secret},{JBH_JUSSPAY_LIVE_RECEIPT_SECRET:"x".repeat(513)}])assert.equal(liveReceiptSecret({...env,...patch}),null);
});
test("hold events cannot be acknowledged as awaiting owner review",()=>{
 for(const state of ["refunded","partially_refunded","disputed"]){
   assert.equal(liveReceiptAcknowledgment({...receipt,state},{state:"awaiting_owner_review",duplicate:false}),null);
   assert.equal(liveReceiptAcknowledgment({...receipt,state},{state:"hold",duplicate:false}).state,"hold");
 }
});

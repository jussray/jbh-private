// Private JBH WhatsApp Business ingress and owner-verified delivery.
// AI assistance is advisory; provider messages cannot create payments or supplier purchases.
import { neon } from "@neondatabase/serverless";
import {validateAccess} from "./access";
import {type Env, json, text, readBoundedText} from "./shared";
import {verifyWebhookChallenge,verifyMetaSignature,normalizeInboundWebhook,planWhatsAppReply,
  validateOutgoingMessage,WhatsAppPolicyError} from "./whatsapp-policy";
import {sendViaMeta} from "./whatsapp-transport";
import {handleWhatsAppOwnerReviewRequest} from "./whatsapp-owner-review";
import {normalizeWhatsAppDeliveryEvents} from "./whatsapp-delivery-model";
import {recordSignedWhatsAppDeliveryReceipt,reconcileWhatsAppOutboxReceipt} from "./whatsapp-delivery-store";

type WaEnv=Env & {
  JBH_WHATSAPP_WEBHOOK_ENABLED?:string; JBH_WHATSAPP_SEND_ENABLED?:string;
  JBH_WHATSAPP_AUTO_REPLY_ENABLED?:string; JBH_WHATSAPP_APP_SECRET?:string;
  JBH_WHATSAPP_VERIFY_TOKEN?:string; JBH_WHATSAPP_PHONE_NUMBER_ID?:string;
  JBH_WHATSAPP_CONTACT_HASH_KEY?:string; JBH_WHATSAPP_ACCESS_TOKEN?:string;
  JBH_WHATSAPP_GRAPH_VERSION?:string; JBH_WHATSAPP_APPROVED_FAQS_JSON?:string;
  JBH_WHATSAPP_APPROVED_TEMPLATES_JSON?:string;
};
const PRIVATE_HEADERS={"Cache-Control":"private, no-store, max-age=0"};
const PHONE=/^[1-9]\d{6,14}$/;
const REFERENCE=/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,179}$/;
const REQUEST_KEY=/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
function configured(e:WaEnv){return !!e.DATABASE_URL &&
  typeof e.JBH_WHATSAPP_CONTACT_HASH_KEY==="string"&&e.JBH_WHATSAPP_CONTACT_HASH_KEY.length>=32;}
function object(v:unknown):Record<string,unknown>|null{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;}
async function digest(value:string):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function phoneHash(keyString:string,phone:string):Promise<string>{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(keyString),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(phone)));
  return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function approvedFaq(e:WaEnv):Record<string,string>{
  try{
    const raw=object(JSON.parse(e.JBH_WHATSAPP_APPROVED_FAQS_JSON||"{}"))||{};
    return Object.fromEntries(Object.entries(raw).filter(([k,v])=>
      /^[a-z_]{3,48}$/.test(k)&&typeof v==="string"&&v.length>0&&v.length<=1000)) as Record<string,string>;
  }catch{return {};}
}
function approvedTemplate(e:WaEnv,name:string):boolean{
  try{
    const names=JSON.parse(e.JBH_WHATSAPP_APPROVED_TEMPLATES_JSON||"[]");
    return Array.isArray(names)&&names.includes(name);
  }catch{return false;}
}
async function webhook(request:Request,e:WaEnv):Promise<Response>{
  if(e.JBH_WHATSAPP_WEBHOOK_ENABLED!=="true")return json({error:"not_found"},404);
  if(request.method==="GET"){
    const challenge=verifyWebhookChallenge(new URL(request.url),e.JBH_WHATSAPP_VERIFY_TOKEN||"");
    return challenge===null?text("Forbidden",403):text(challenge,200,{"Content-Type":"text/plain"});
  }
  if(request.method!=="POST")return text("Method not allowed",405,{Allow:"GET, POST"});
  if(!e.JBH_WHATSAPP_APP_SECRET||!e.JBH_WHATSAPP_PHONE_NUMBER_ID||!configured(e))
    return json({error:"not_configured"},503);
  let payload:string;
  try{payload=await readBoundedText(request,65536);}catch{return json({error:"invalid_body"},400);}
  if(!await verifyMetaSignature(payload,request.headers.get("X-Hub-Signature-256"),e.JBH_WHATSAPP_APP_SECRET))
    return json({error:"invalid_signature"},401);
  let events,receipts;
  try{
    events=normalizeInboundWebhook(payload,e.JBH_WHATSAPP_PHONE_NUMBER_ID);
    receipts=normalizeWhatsAppDeliveryEvents(payload,e.JBH_WHATSAPP_PHONE_NUMBER_ID);
  }catch{return json({error:"invalid_webhook"},400);}
  try{
    const sql=neon(e.DATABASE_URL);
    // Only signed Meta delivery events, never an inbound customer instruction.
    for(const receipt of receipts)
      await recordSignedWhatsAppDeliveryReceipt(e.DATABASE_URL,receipt);
    for(const event of events){
      const contactHash=await phoneHash(e.JBH_WHATSAPP_CONTACT_HASH_KEY!,event.waId);
      const messageHash=await digest(event.text);
      const decision=planWhatsAppReply(event.text,approvedFaq(e));
      const inserted=await sql`
        INSERT INTO jbh_whatsapp_inbox(meta_message_id,contact_hash,body_sha256,intent,status)
        VALUES (${event.eventId},${contactHash},${messageHash},${decision.reason},'owner_review')
        ON CONFLICT(meta_message_id) DO NOTHING RETURNING meta_message_id
      `;
      if(!inserted.length)continue; // Do not reply twice to a retried webhook.
      if(/^\s*(stop|unsubscribe|cancel messages)\s*$/i.test(event.text)){
        await sql`UPDATE jbh_whatsapp_contacts SET consented=FALSE,updated_at=NOW()
          WHERE contact_hash=${contactHash}`;
        continue;
      }
      // Signed Meta event timestamp may update the service window, never a future timestamp.
      await sql`UPDATE jbh_whatsapp_contacts SET
          last_inbound_at=TO_TIMESTAMP(${event.timestamp}/1000.0),updated_at=NOW()
          WHERE contact_hash=${contactHash}
          AND TO_TIMESTAMP(${event.timestamp}/1000.0)<=NOW()+INTERVAL '1 minute'
          AND (last_inbound_at IS NULL OR last_inbound_at<TO_TIMESTAMP(${event.timestamp}/1000.0))`;
      if(event.kind!=="text"||decision.mode!=="approved_faq"||
         e.JBH_WHATSAPP_SEND_ENABLED!=="true"||e.JBH_WHATSAPP_AUTO_REPLY_ENABLED!=="true")continue;
      const contacts=await sql`SELECT audience,consented,
        EXTRACT(EPOCH FROM last_inbound_at)*1000 AS last_inbound_ms
        FROM jbh_whatsapp_contacts WHERE contact_hash=${contactHash}`;
      const contact=contacts[0];
      if(contact?.audience!=="customer"||contact?.consented!==true)continue;
      try{
        validateOutgoingMessage({audience:"customer",purpose:"faq",recipient:event.waId,
          body:decision.answer,consented:true,lastIncomingAt:Number(contact.last_inbound_ms),
          ownerApproved:true});
        const sent=await sendViaMeta(e,{to:event.waId,body:decision.answer});
        await sql`UPDATE jbh_whatsapp_inbox SET status='auto_replied',meta_reply_id=${sent.messageId}
          WHERE meta_message_id=${event.eventId}`;
      }catch{
        await sql`UPDATE jbh_whatsapp_inbox SET status='delivery_unconfirmed'
          WHERE meta_message_id=${event.eventId}`;
      }
    }
    return json({received:true});
  }catch{return json({error:"private_message_store_unavailable"},503);}
}
async function registerContact(request:Request,e:WaEnv):Promise<Response>{
  const b=object(JSON.parse(await readBoundedText(request,8192)));
  const allowed=["recipient","audience","consented","evidenceRef","vendorId","orderId"];
  if(!b||Object.keys(b).some(k=>!allowed.includes(k))||
     typeof b.recipient!=="string"||!PHONE.test(b.recipient)||
     !["customer","vendor"].includes(String(b.audience))||b.consented!==true||
     typeof b.evidenceRef!=="string"||!REFERENCE.test(b.evidenceRef))
    return json({error:"invalid_contact"},400);
  const vendorId=b.audience==="vendor"&&Number.isSafeInteger(b.vendorId)&&Number(b.vendorId)>0?Number(b.vendorId):null;
  const orderId=b.audience==="customer"&&Number.isSafeInteger(b.orderId)&&Number(b.orderId)>0?Number(b.orderId):null;
  // Opted-in prospective customers may ask FAQs before placing an order.
  // A supplied order ID must still be real and belong to the exact phone number.
  if((b.audience==="vendor"&&(!vendorId||b.orderId!=null))||
     (b.audience==="customer"&&(b.vendorId!=null||(b.orderId!=null&&!orderId))))
    return json({error:"contact_authority_required"},400);
  const sql=neon(e.DATABASE_URL);
  if(vendorId){
    const vendor=await sql`SELECT id FROM vendors WHERE id=${vendorId}`;
    if(!vendor.length)return json({error:"vendor_not_found"},404);
  }
  if(orderId){
    const buyer=await sql`SELECT id FROM orders WHERE id=${orderId} AND
      REGEXP_REPLACE(COALESCE(phone,''),'[^0-9]','','g')=${b.recipient as string}`;
    if(!buyer.length)return json({error:"customer_contact_mismatch"},403);
  }
  const hash=await phoneHash(e.JBH_WHATSAPP_CONTACT_HASH_KEY!,b.recipient);
  const created=await sql`INSERT INTO jbh_whatsapp_contacts
    (contact_hash,audience,vendor_id,order_id,consented,consent_evidence_ref)
    VALUES (${hash},${b.audience as string},${vendorId},${orderId},TRUE,${b.evidenceRef})
    ON CONFLICT(contact_hash) DO NOTHING RETURNING contact_hash`;
  return json({registered:created.length===1,alreadyRegistered:created.length===0});
}
async function sendApproved(request:Request,e:WaEnv):Promise<Response>{
  if(e.JBH_WHATSAPP_SEND_ENABLED!=="true")return json({error:"sending_disabled"},503);
  const b=object(JSON.parse(await readBoundedText(request,8192)));
  const allowed=["recipient","audience","purpose","idempotencyKey","orderId","purchaseOrderDraftId","body","templateName","templateLanguage"];
  if(!b||Object.keys(b).some(k=>!allowed.includes(k))||
     typeof b.recipient!=="string"||!PHONE.test(b.recipient)||
     !REQUEST_KEY.test(String(b.idempotencyKey||"")))return json({error:"invalid_send_request"},400);
  const to=b.recipient,role=String(b.audience||""),purpose=String(b.purpose||"");
  const contactHash=await phoneHash(e.JBH_WHATSAPP_CONTACT_HASH_KEY!,to);
  const sql=neon(e.DATABASE_URL);
  const records=await sql`SELECT audience,consented,vendor_id,order_id,
    EXTRACT(EPOCH FROM last_inbound_at)*1000 AS last_inbound_ms
    FROM jbh_whatsapp_contacts WHERE contact_hash=${contactHash}`;
  const contact=records[0];
  if(!contact||contact.audience!==role||contact.consented!==true)return json({error:"recipient_not_authorized"},403);
  let body=typeof b.body==="string"?b.body:null,paid=false,authorized=false,poId:number|null=null;
  if(purpose==="order_status"){
    if(role!=="customer"||contact.order_id!==b.orderId)return json({error:"order_contact_mismatch"},403);
    const orders=await sql`SELECT id,status,payment_status FROM orders WHERE id=${contact.order_id}`;
    if(!orders.length)return json({error:"order_not_found"},404);
    const order=orders[0];
    if(!/^[a-z_]{3,32}$/.test(order.status)||!["paid","unpaid","refunded","partially_refunded"].includes(order.payment_status))
      return json({error:"order_state_unverified"},409);
    body="Juss Beautiful Hair order "+order.id+": status "+order.status+"; payment "+order.payment_status+". Reply if you need assistance.";
  }
  if(purpose==="supplier_quote_request"&&(role!=="vendor"||!contact.vendor_id))
    return json({error:"vendor_not_authorized"},403);
  if(purpose==="supplier_purchase_order"){
    if(role!=="vendor"||!Number.isSafeInteger(b.purchaseOrderDraftId))
      return json({error:"purchase_order_not_authorized"},403);
    const orders=await sql`SELECT p.id FROM supplier_purchase_order_drafts p
      JOIN orders o ON o.id=p.order_id AND o.payment_status='paid'
      JOIN vendor_fulfillment_groups g ON g.id=p.fulfillment_group_id
      JOIN vendor_connection_states c ON c.vendor_id=p.vendor_id AND c.dispatch_authority=TRUE
        AND c.state='dispatch_active' AND c.verified_at IS NOT NULL
      WHERE p.id=${b.purchaseOrderDraftId as number} AND p.vendor_id=${contact.vendor_id}
        AND p.state='authorized' AND p.owner_authorized_at IS NOT NULL
        AND g.status IN ('approved','queued_for_dispatch')`;
    if(!orders.length)return json({error:"purchase_order_not_authorized"},409);
    paid=true;authorized=true;poId=Number(orders[0].id);
    // Supplier receives a reference only, never buyer identity or shipping address from AI.
    body="Juss Beautiful Hair: approved purchase-order reference "+poId+". Reply to coordinate secure fulfillment and invoicing.";
  }
  const template=typeof b.templateName==="string"?b.templateName:null;
  const message={audience:role as 'customer'|'vendor',purpose:purpose as 'faq'|'order_status'|'supplier_quote_request'|'supplier_purchase_order',
    recipient:to,body:template?null:body,templateName:template,templateApproved:!!template&&approvedTemplate(e,template),
    consented:true,lastIncomingAt:contact.last_inbound_ms==null?null:Number(contact.last_inbound_ms),
    ownerApproved:true,sourcePaidOrderVerified:paid,supplierOrderAuthorized:authorized};
  try{validateOutgoingMessage(message);}catch(err){
    return json({error:err instanceof WhatsAppPolicyError?err.code:"invalid_message"},409);
  }
  const hash=await digest(JSON.stringify({contactHash,purpose,body:message.body,template}));
  // Claim BEFORE calling Meta: duplicate delivery attempts are never automatic.
  const claimed=await sql`INSERT INTO jbh_whatsapp_outbox
    (idempotency_key,contact_hash,audience,purpose,purchase_order_draft_id,body_sha256,state)
    VALUES (${b.idempotencyKey as string},${contactHash},${role},${purpose},${poId},${hash},'sending')
    ON CONFLICT DO NOTHING RETURNING idempotency_key`;
  if(!claimed.length)return json({error:"duplicate_or_delivery_unknown"},409);
  try{
    const sent=await sendViaMeta(e,{to,body:message.body||undefined,
      templateName:template||undefined,templateLanguage:typeof b.templateLanguage==="string"?b.templateLanguage:undefined});
    await sql`UPDATE jbh_whatsapp_outbox SET state='provider_accepted',
      meta_message_id=${sent.messageId},updated_at=NOW() WHERE idempotency_key=${b.idempotencyKey as string}`;
    // Delivery callbacks can race ahead of Meta's HTTP response.
    // If reconciliation fails, never resend or downgrade a verified delivery.
    try{await reconcileWhatsAppOutboxReceipt(e.DATABASE_URL,sent.messageId);}
    catch{return json({providerAccepted:true,messageId:sent.messageId,receiptReconciliationPending:true,orderPlaced:false});}
    return json({providerAccepted:true,messageId:sent.messageId,orderPlaced:false});
  }catch{
    await sql`UPDATE jbh_whatsapp_outbox SET state='delivery_unconfirmed',updated_at=NOW()
      WHERE idempotency_key=${b.idempotencyKey as string}`;
    return json({error:"provider_delivery_unconfirmed",retryAutomatically:false},502);
  }
}
export async function handleWhatsAppRequest(request:Request,env:Env):Promise<Response>{
  const e=env as WaEnv,path=new URL(request.url).pathname;
  if(path==="/webhooks/whatsapp")return webhook(request,e);
  if(!await validateAccess(request,e))return json({error:"unauthorized"},401,PRIVATE_HEADERS);
  if(path==="/api/admin/whatsapp/readiness" || path==="/api/admin/whatsapp/review" || path==="/api/admin/whatsapp/review/resolve")
    return handleWhatsAppOwnerReviewRequest(request,e);
  if(request.method!=="POST")return text("Method not allowed",405,{...PRIVATE_HEADERS,Allow:"POST"});
  if(!configured(e))return json({error:"whatsapp_not_configured"},503,PRIVATE_HEADERS);
  try{
    if(path==="/api/admin/whatsapp/contacts")return await registerContact(request,e);
    if(path==="/api/admin/whatsapp/send-approved")return await sendApproved(request,e);
    return json({error:"not_found"},404);
  }catch{return json({error:"whatsapp_private_request_failed"},503,PRIVATE_HEADERS);}
}

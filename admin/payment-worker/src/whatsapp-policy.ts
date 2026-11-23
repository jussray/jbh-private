// Private JBH WhatsApp messaging policy. No purchases, payment capture, or model inference.
export class WhatsAppPolicyError extends Error {
  constructor(readonly code: string) { super(code); this.name='WhatsAppPolicyError'; }
}
const PHONE=/^[1-9]\d{6,14}$/;
const META_ID=/^wamid\.[A-Za-z0-9._-]{3,200}$/;
const TEMPLATE=/^[a-z][a-z0-9_]{1,127}$/;
const MAX_AGE=24*60*60*1000;

export function verifyWebhookChallenge(url: URL, secret: string): string|null {
  const p=url.searchParams, token=p.get('hub.verify_token'), challenge=p.get('hub.challenge');
  if(!secret||p.get('hub.mode')!=='subscribe'||token!==secret || !challenge ||
     !/^\d{1,32}$/.test(challenge)) return null;
  return challenge;
}
export async function verifyMetaSignature(raw: string, signature: string|null, appSecret: string):Promise<boolean>{
  if(!appSecret||!signature||!/^sha256=[0-9a-f]{64}$/.test(signature))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(appSecret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.slice(7).match(/.{2}/g)!,x=>parseInt(x,16)),new TextEncoder().encode(raw));
}
export type InboundWhatsAppEvent={eventId:string;waId:string;timestamp:number;kind:'text'|'unsupported';text:string};
export function normalizeInboundWebhook(raw:string,expectedPhoneId:string):InboundWhatsAppEvent[]{
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw new WhatsAppPolicyError('invalid_webhook_json');}
  const body=value as {object?:unknown;entry?:unknown};
  if(!body||body.object!=='whatsapp_business_account'||!Array.isArray(body.entry))throw new WhatsAppPolicyError('invalid_webhook_payload');
  const normalized:InboundWhatsAppEvent[]=[];
  for(const entry of body.entry.slice(0,25)){
    const changes=Array.isArray(entry?.changes)?entry.changes:[];
    for(const change of changes.slice(0,25)){
      if(change?.field!=='messages'||change.value?.metadata?.phone_number_id!==expectedPhoneId)continue;
      const messages=Array.isArray(change.value?.messages)?change.value.messages:[];
      for(const msg of messages.slice(0,100)){
        if(normalized.length>=100)throw new WhatsAppPolicyError('too_many_webhook_events');
        const ts=Number(msg?.timestamp);
        if(typeof msg?.id!=='string'||!META_ID.test(msg.id)||typeof msg?.from!=='string'||!PHONE.test(msg.from)||!Number.isSafeInteger(ts)||ts<=0)continue;
        normalized.push({eventId:msg.id,waId:msg.from,timestamp:ts*1000,
          kind:msg.type==='text'&&typeof msg.text?.body==='string'?'text':'unsupported',
          text:msg.type==='text'&&typeof msg.text?.body==='string'?msg.text.body.slice(0,2048):''});
      }
    }
  }
  return normalized;
}
const RESTRICTED=/\b(order|paid|payment|receipt|tracking|track|where|shipped|delivered|refund|discount|coupon|wholesale|supplier|purchase|invoice|place|buy|ship today|in stock|available now|guarantee)\b/i;
export function planWhatsAppReply(text:string,approvedFaq:Record<string,string>={}){
  if(typeof text!=='string'||!text.trim()||text.length>2048)return{mode:'owner_review' as const,reason:'empty_or_long_message'};
  if(RESTRICTED.test(text))return {mode:'owner_review' as const,reason:'financial_order_or_vendor_action'};
  const normalized=text.trim().toLowerCase().replace(/[?!.]/g,'');
  const approved:Record<string,string>={
    'what are your business hours':'business_hours',
    'what is your return policy':'return_policy',
    'how do i care for my hair':'hair_care',
  };
  const key=approved[normalized];
  const response=key&&Object.hasOwn(approvedFaq,key)?approvedFaq[key]:null;
  if(response&&typeof response==='string'&&response.trim()&&response.length<=1000)
    return{mode:'approved_faq' as const,answer:response,reason:'preapproved_response_only'};
  return{mode:'owner_review' as const,reason:'unapproved_fact_or_unknown_request'};
}
export type OutgoingWhatsAppMessage={
 audience:'customer'|'vendor';purpose:'faq'|'order_status'|'supplier_quote_request'|'supplier_purchase_order';
 recipient:string;body?:string|null;templateName?:string|null;templateApproved?:boolean;
 consented:boolean;lastIncomingAt?:number|null;ownerApproved:boolean;
 sourcePaidOrderVerified?:boolean;supplierOrderAuthorized?:boolean;
};
export function validateOutgoingMessage(msg:OutgoingWhatsAppMessage,now=Date.now()):void{
  if(!msg||!PHONE.test(msg.recipient)||!msg.consented||!msg.ownerApproved)throw new WhatsAppPolicyError('recipient_not_approved');
  if(!Number.isFinite(now))throw new WhatsAppPolicyError('invalid_clock');
  if(!['customer','vendor'].includes(msg.audience)|| !['faq','order_status','supplier_quote_request','supplier_purchase_order'].includes(msg.purpose)||
     (msg.audience==='customer'&&!['faq','order_status'].includes(msg.purpose))||
     (msg.audience==='vendor'&&!['supplier_quote_request','supplier_purchase_order'].includes(msg.purpose)))
     throw new WhatsAppPolicyError('invalid_message_purpose');
  if(msg.purpose==='supplier_purchase_order'&&(!msg.sourcePaidOrderVerified||!msg.supplierOrderAuthorized))
    throw new WhatsAppPolicyError('supplier_order_not_authorized');
  const recent=typeof msg.lastIncomingAt==='number'&&msg.lastIncomingAt<=now&&now-msg.lastIncomingAt<MAX_AGE;
  const hasTemplate=typeof msg.templateName==='string'&&TEMPLATE.test(msg.templateName)&&msg.templateApproved===true;
  if(!recent&&!hasTemplate)throw new WhatsAppPolicyError('approved_template_required');
  if(hasTemplate){if(msg.body!=null)throw new WhatsAppPolicyError('template_text_conflict');}
  else if(typeof msg.body!=='string'||!msg.body.trim()||msg.body.length>4096)throw new WhatsAppPolicyError('invalid_reply_text');
}

// Meta WhatsApp Cloud API. Caller must prove consent, owner approval and idempotency.
export type MetaTransportEnv = {
  JBH_WHATSAPP_SEND_ENABLED?: string; JBH_WHATSAPP_ACCESS_TOKEN?: string;
  JBH_WHATSAPP_PHONE_NUMBER_ID?: string; JBH_WHATSAPP_GRAPH_VERSION?: string;
};
export type MetaSendRequest={to:string;body?:string;templateName?:string;templateLanguage?:string};
const ID=/^\d{6,25}$/;
const PHONE=/^[1-9]\d{6,14}$/;
const VERSION=/^v\d{1,2}\.\d{1,2}$/;
const TEMPLATE=/^[a-z][a-z0-9_]{1,127}$/;
const LANGUAGE=/^[a-z]{2}_[A-Z]{2}$/;
export class MetaTransportError extends Error {
  constructor(readonly code: string){super(code);this.name='MetaTransportError';}
}
export async function sendViaMeta(env:MetaTransportEnv,req:MetaSendRequest,fetchFn:typeof fetch=fetch):Promise<{messageId:string}>{
  if(env.JBH_WHATSAPP_SEND_ENABLED!=='true')throw new MetaTransportError('send_disabled');
  const token=env.JBH_WHATSAPP_ACCESS_TOKEN||'';
  const id=env.JBH_WHATSAPP_PHONE_NUMBER_ID||'';
  const version=env.JBH_WHATSAPP_GRAPH_VERSION||'';
  if(token.length<8||!ID.test(id)||!VERSION.test(version))throw new MetaTransportError('provider_not_configured');
  if(!PHONE.test(req.to))throw new MetaTransportError('invalid_recipient');
  let payload:{messaging_product:string;recipient_type:string;to:string;type:string;text?:{preview_url:boolean;body:string};template?:{name:string;language:{code:string}}};
  if(req.templateName){
    if(!TEMPLATE.test(req.templateName)||!LANGUAGE.test(req.templateLanguage||'')||req.body!=null)
      throw new MetaTransportError('invalid_template');
    payload={messaging_product:'whatsapp',recipient_type:'individual',to:req.to,type:'template',template:{name:req.templateName,language:{code:req.templateLanguage!}}};
  } else {
    if(typeof req.body!=='string'||!req.body.trim()||req.body.length>4096)
      throw new MetaTransportError('invalid_text');
    payload={messaging_product:'whatsapp',recipient_type:'individual',to:req.to,type:'text',text:{preview_url:false,body:req.body}};
  }
  let response:Response;
  try{
    response=await fetchFn('https://graph.facebook.com/'+version+'/'+id+'/messages',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),
    });
  }catch{throw new MetaTransportError('provider_delivery_unconfirmed');}
  if(!response.ok)throw new MetaTransportError('provider_rejected_request');
  let parsed:unknown;
  try{parsed=await response.json();}catch{throw new MetaTransportError('provider_delivery_unconfirmed');}
  const messageId=(parsed as {messages?:{id?:string}[]})?.messages?.[0]?.id;
  if(typeof messageId!=='string'||!/^wamid\.[A-Za-z0-9._-]{3,200}$/.test(messageId))
    throw new MetaTransportError('provider_delivery_unconfirmed');
  return {messageId};
}

/** JBH private owner-only readiness status: presence, never the credential value. */
export type WhatsAppBindings = Partial<Record<
  'DATABASE_URL'|'JBH_WHATSAPP_APP_SECRET'|'JBH_WHATSAPP_VERIFY_TOKEN'|
  'JBH_WHATSAPP_PHONE_NUMBER_ID'|'JBH_WHATSAPP_ACCESS_TOKEN'|
  'JBH_WHATSAPP_CONTACT_HASH_KEY'|'JBH_WHATSAPP_GRAPH_VERSION'|
  'JBH_WHATSAPP_WEBHOOK_ENABLED'|'JBH_WHATSAPP_SEND_ENABLED'|
  'JBH_WHATSAPP_AUTO_REPLY_ENABLED',string>>;

const NUMBER_ID=/^\d{6,25}$/;
const VERSION=/^v\d{1,2}\.\d{1,2}$/;
const MESSAGE_ID=/^wamid\.[A-Za-z0-9._-]{3,200}$/;
const RESOLUTIONS=new Set(['no_action_required','handled_externally','followup_required']);
export function assessWhatsAppReadiness(env: WhatsAppBindings) {
  const credentialPresence={
    database:typeof env.DATABASE_URL==='string' && env.DATABASE_URL.length>0,
    metaAppSecret:typeof env.JBH_WHATSAPP_APP_SECRET==='string'&&env.JBH_WHATSAPP_APP_SECRET.length>=8,
    verifyToken:typeof env.JBH_WHATSAPP_VERIFY_TOKEN==='string'&&env.JBH_WHATSAPP_VERIFY_TOKEN.length>=8,
    phoneNumberId:NUMBER_ID.test(env.JBH_WHATSAPP_PHONE_NUMBER_ID||''),
    accessToken:typeof env.JBH_WHATSAPP_ACCESS_TOKEN==='string'&&env.JBH_WHATSAPP_ACCESS_TOKEN.length>=8,
    hashKey:typeof env.JBH_WHATSAPP_CONTACT_HASH_KEY==='string'&&env.JBH_WHATSAPP_CONTACT_HASH_KEY.length>=32,
    graphVersion:VERSION.test(env.JBH_WHATSAPP_GRAPH_VERSION||''),
  };
  const mapped:Record<keyof typeof credentialPresence,string>={
    database:'DATABASE_URL',metaAppSecret:'JBH_WHATSAPP_APP_SECRET',verifyToken:'JBH_WHATSAPP_VERIFY_TOKEN',
    phoneNumberId:'JBH_WHATSAPP_PHONE_NUMBER_ID',accessToken:'JBH_WHATSAPP_ACCESS_TOKEN',
    hashKey:'JBH_WHATSAPP_CONTACT_HASH_KEY',graphVersion:'JBH_WHATSAPP_GRAPH_VERSION',
  };
  const missingBindings=Object.entries(credentialPresence).filter(([_,present])=>!present)
    .map(([key])=>mapped[key as keyof typeof credentialPresence]);
  return {
    mode:'owner_only_readiness' as const,
    credentialPresence, missingBindings,
    liveWebhookEnabled:env.JBH_WHATSAPP_WEBHOOK_ENABLED==='true',
    liveSendEnabled:env.JBH_WHATSAPP_SEND_ENABLED==='true',
    autoRepliesEnabled:env.JBH_WHATSAPP_AUTO_REPLY_ENABLED==='true',
    supplierPurchasesEnabled:false,
    verifiedProviderConnection:false,
    migrationsVerified:false,
  };
}
export type WhatsAppReviewAction={eventId:string;resolution:'no_action_required'|'handled_externally'|'followup_required'};
export function validateWhatsAppReviewAction(data:unknown): WhatsAppReviewAction {
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('invalid_review_action');
  const x=data as Record<string,unknown>;
  if(Object.keys(x).sort().join(',')!=='eventId,resolution'||
     typeof x.eventId!=='string'||!MESSAGE_ID.test(x.eventId)||
     typeof x.resolution!=='string'||!RESOLUTIONS.has(x.resolution))throw new Error('invalid_review_action');
  return {eventId:x.eventId,resolution:x.resolution as WhatsAppReviewAction['resolution']};
}
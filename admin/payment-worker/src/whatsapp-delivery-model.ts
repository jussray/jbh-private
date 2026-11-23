// Meta's signed status events are delivery evidence, never payment or fulfillment proof.
export type WhatsAppDeliveryStatus = 'sent'|'delivered'|'read'|'failed';
export type WhatsAppDeliveryEvent = Readonly<{messageId:string; status:WhatsAppDeliveryStatus; timestamp:number}>;
const MESSAGE_ID=/^wamid\.[A-Za-z0-9._-]{3,200}$/;
const STATES=new Set<WhatsAppDeliveryStatus>(['sent','delivered','read','failed']);
export function normalizeWhatsAppDeliveryEvents(raw:string,phoneId:string):WhatsAppDeliveryEvent[]{
  let payload:unknown;
  try{payload=JSON.parse(raw);}catch{throw new Error('invalid_whatsapp_delivery_payload');}
  const data=payload as {object?:unknown;entry?:unknown};
  if(!data||data.object!=='whatsapp_business_account'||!Array.isArray(data.entry))
    throw new Error('invalid_whatsapp_delivery_payload');
  const result:WhatsAppDeliveryEvent[]=[],seen=new Set<string>();
  for(const entry of data.entry.slice(0,25)){
    const e=entry as {changes?:unknown}|null;
    const changes:unknown[]=Array.isArray(e?.changes)?e.changes:[];
    for(const change of changes.slice(0,25)){
      const c=change as {field?:unknown;value?:{metadata?:{phone_number_id?:unknown};statuses?:unknown}}|null;
      if(c?.field!=='messages'||c.value?.metadata?.phone_number_id!==phoneId)continue;
      const statuses:unknown[]=Array.isArray(c.value?.statuses)?c.value.statuses:[];
      if(statuses.length>100)throw new Error('too_many_delivery_events');
      for(const item of statuses){
        if(result.length>=100)throw new Error('too_many_delivery_events');
        const r=item as {id?:unknown;status?:unknown;timestamp?:unknown}|null;
        const id=r?.id,status=r?.status,seconds=Number(r?.timestamp);
        if(typeof id!=='string'||!MESSAGE_ID.test(id)||
           !STATES.has(status as WhatsAppDeliveryStatus)||!Number.isSafeInteger(seconds)||seconds<=0)continue;
        const key=id+':'+status;
        if(!seen.has(key)){seen.add(key);result.push({messageId:id,status:status as WhatsAppDeliveryStatus,timestamp:seconds*1000});}
      }
    }
  }
  return result;
}
export function reconcileWhatsAppDeliveryState(
  current:'sending'|'provider_accepted'|'delivery_unconfirmed'|'delivered'|'read'|'failed',
  receipts:readonly WhatsAppDeliveryStatus[],
){
  if(current==='read'||receipts.includes('read'))return 'read';
  if(current==='delivered'||receipts.includes('delivered'))return 'delivered';
  if(current==='failed'||receipts.includes('failed'))return 'failed';
  if(current==='provider_accepted'||receipts.includes('sent'))return 'provider_accepted';
  return current;
}

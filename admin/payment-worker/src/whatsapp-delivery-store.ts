// Provider delivery callbacks can arrive before or after /messages returns.
// Persist signed receipts independently and reconcile monotonically without retries.
import {neon} from "@neondatabase/serverless";
import type {WhatsAppDeliveryEvent} from "./whatsapp-delivery-model";
const MESSAGE_ID=/^wamid\.[A-Za-z0-9._-]{3,200}$/;
export async function reconcileWhatsAppOutboxReceipt(databaseUrl:string,messageId:string):Promise<void>{
  if(!databaseUrl||!MESSAGE_ID.test(messageId))throw new Error('invalid_delivery_receipt');
  const sql=neon(databaseUrl);
  await sql`
    UPDATE jbh_whatsapp_outbox AS o
    SET state = CASE
      WHEN o.state = 'read' OR EXISTS (
        SELECT 1 FROM jbh_whatsapp_delivery_receipts r
        WHERE r.meta_message_id = ${messageId} AND r.provider_status = 'read'
      ) THEN 'read'
      WHEN o.state = 'delivered' OR EXISTS (
        SELECT 1 FROM jbh_whatsapp_delivery_receipts r
        WHERE r.meta_message_id = ${messageId} AND r.provider_status = 'delivered'
      ) THEN 'delivered'
      WHEN o.state = 'failed' OR EXISTS (
        SELECT 1 FROM jbh_whatsapp_delivery_receipts r
        WHERE r.meta_message_id = ${messageId} AND r.provider_status = 'failed'
      ) THEN 'failed'
      WHEN o.state = 'provider_accepted' OR EXISTS (
        SELECT 1 FROM jbh_whatsapp_delivery_receipts r
        WHERE r.meta_message_id = ${messageId} AND r.provider_status = 'sent'
      ) THEN 'provider_accepted'
      ELSE o.state
    END, updated_at = NOW()
    WHERE o.meta_message_id = ${messageId}
  `;
}

export async function recordSignedWhatsAppDeliveryReceipt(databaseUrl:string,r:WhatsAppDeliveryEvent):Promise<void>{
  if(!databaseUrl||!r||!MESSAGE_ID.test(r.messageId)||
     !['sent','delivered','read','failed'].includes(r.status)||
     !Number.isSafeInteger(r.timestamp)||r.timestamp<=0)
    throw new Error('invalid_delivery_receipt');
  const sql=neon(databaseUrl);
  await sql`
    INSERT INTO jbh_whatsapp_delivery_receipts(meta_message_id,provider_status,provider_timestamp)
    VALUES (${r.messageId},${r.status},TO_TIMESTAMP(${r.timestamp}/1000.0))
    ON CONFLICT (meta_message_id,provider_status) DO NOTHING
  `;
  await reconcileWhatsAppOutboxReceipt(databaseUrl,r.messageId);
}

// Cloudflare Access owner-only readiness and review metadata.
// No external WhatsApp send, customer message text, phone number, purchase, or refund here.
import {neon} from "@neondatabase/serverless";
import {type Env,json,readBoundedText,text} from "./shared";
import {assessWhatsAppReadiness,validateWhatsAppReviewAction} from "./whatsapp-review-model";
const PRIVATE={"Cache-Control":"private, no-store, max-age=0"};
type SQL=ReturnType<typeof neon>;
const checks=(sql:SQL)=>sql`
  SELECT
    (to_regclass('public.vendor_variant_offers') IS NOT NULL) AS quotes,
    (to_regclass('public.supplier_purchase_order_drafts') IS NOT NULL) AS purchase_order_drafts,
    (to_regclass('public.jbh_whatsapp_contacts') IS NOT NULL) AS contacts,
    (to_regclass('public.jbh_whatsapp_inbox') IS NOT NULL) AS inbox,
    (to_regclass('public.jbh_whatsapp_outbox') IS NOT NULL) AS outbox,
    (to_regclass('public.jbh_whatsapp_delivery_receipts') IS NOT NULL) AS delivery_receipts,
    (to_regclass('public.jbh_whatsapp_review_actions') IS NOT NULL) AS review_actions
  `;

export async function handleWhatsAppOwnerReviewRequest(request:Request,env:Env):Promise<Response>{
  // Auth is checked in handleWhatsAppRequest BEFORE invoking this handler.
  const path=new URL(request.url).pathname;
  if(path==="/api/admin/whatsapp/readiness"){
    if(request.method!=="GET")return text("Method not allowed",405,{...PRIVATE,Allow:"GET"});
    const readiness=assessWhatsAppReadiness(env);
    if(!env.DATABASE_URL)
      return json({...readiness,databaseReachable:false,migrationTables:{},
        migrationsVerified:false},200,PRIVATE);
    try{
      const result=await checks(neon(env.DATABASE_URL));
      const raw=result[0]||{},migrationTables={
        quotes:raw.quotes===true,purchaseOrderDrafts:raw.purchase_order_drafts===true,
        contacts:raw.contacts===true,inbox:raw.inbox===true,outbox:raw.outbox===true,
        deliveryReceipts:raw.delivery_receipts===true,reviewActions:raw.review_actions===true,
      };
      return json({...readiness,databaseReachable:true,migrationTables,
        migrationsVerified:Object.values(migrationTables).every(Boolean)},200,PRIVATE);
    }catch{return json({...readiness,databaseReachable:false,migrationTables:{},
      migrationsVerified:false},200,PRIVATE);}
  }
  if(!env.DATABASE_URL)return json({error:"whatsapp_database_not_configured"},503,PRIVATE);
  const sql=neon(env.DATABASE_URL);
  if(path==="/api/admin/whatsapp/review"){
    if(request.method!=="GET")return text("Method not allowed",405,{...PRIVATE,Allow:"GET"});
    try{
      const data=await sql`
        SELECT i.meta_message_id AS "eventId",i.intent AS "reason",
               i.status AS "replyStatus",i.received_at AS "receivedAt",
               COALESCE(c.audience,'unknown') AS "audience",
               COALESCE(a.resolution,'pending') AS "reviewResolution"
        FROM jbh_whatsapp_inbox i
        LEFT JOIN jbh_whatsapp_contacts c ON c.contact_hash=i.contact_hash
        LEFT JOIN jbh_whatsapp_review_actions a ON a.meta_message_id=i.meta_message_id
        WHERE i.received_at>=NOW()-INTERVAL '30 days'
        ORDER BY i.received_at DESC LIMIT 50
      `;

      return json({mode:"owner_review_metadata_only",contentAvailable:false,
        supplierPurchasesEnabled:false,autoMessageSent:false,
        records:data},200,PRIVATE);
    }catch{return json({error:"whatsapp_review_store_unavailable"},503,PRIVATE);}
  }
  if(path==="/api/admin/whatsapp/review/resolve"){
    if(request.method!=="POST")return text("Method not allowed",405,{...PRIVATE,Allow:"POST"});
    try{
      const action=validateWhatsAppReviewAction(JSON.parse(await readBoundedText(request,2048)));
      const result=await sql`
        INSERT INTO jbh_whatsapp_review_actions (meta_message_id,resolution)
        SELECT meta_message_id,${action.resolution}
        FROM jbh_whatsapp_inbox WHERE meta_message_id=${action.eventId}
        ON CONFLICT(meta_message_id) DO NOTHING
        RETURNING meta_message_id
      `;

      if(!result.length)return json({error:"review_missing_or_already_recorded"},409,PRIVATE);
      return json({reviewRecorded:true,eventId:action.eventId,
        resolution:action.resolution,customerMessageSent:false,
        supplierOrderPlaced:false},200,PRIVATE);
    }catch(error){
      if(error instanceof SyntaxError||(error instanceof Error&&error.message==="invalid_review_action"))
        return json({error:"invalid_review_action"},400,PRIVATE);
      return json({error:"whatsapp_review_store_unavailable"},503,PRIVATE);
    }
  }
  return json({error:"not_found"},404,PRIVATE);
}
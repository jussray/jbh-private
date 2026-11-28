import { neon } from "@neondatabase/serverless";
import { type Env, json, readBoundedText } from "./shared";
import { liveReceiptSecret, parseLiveReceipt, verifyLiveReceiptSignature, liveReceiptAcknowledgment } from "./jusspay-live-receipt-model";

export async function handleJussPayLiveReceipt(request: Request, env: Env): Promise<Response> {
  if (env.JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED !== "true") return json({error:"not_found"},404);
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);
  const secret=liveReceiptSecret(env);
  if (!env.DATABASE_URL || !secret) {
    return json({error:"not_configured"},503);
  }
  let raw: string;
  try { raw=await readBoundedText(request,4096); }
  catch { return json({error:"invalid_body"},400); }
  if (!await verifyLiveReceiptSignature(raw,request.headers.get("x-jbh-jusspay-signature")||"",secret)) {
    return json({error:"invalid_signature"},401);
  }
  let value: unknown;
  try {value=JSON.parse(raw);} catch {return json({error:"invalid_body"},400);}
  const receipt=parseLiveReceipt(value);
  if(!receipt)return json({error:"invalid_receipt"},400);
  try {
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,"0")).join("");
    const sql=neon(env.DATABASE_URL);
    const rows=await sql`SELECT receipt_state, duplicate FROM public.record_jusspay_live_receipt(${receipt.orderId},${receipt.eventId},${receipt.paymentIntentId},${receipt.state},${hash})`;
    const ack=rows.length===1?liveReceiptAcknowledgment(receipt,{state:rows[0].receipt_state,duplicate:rows[0].duplicate}):null;
    return ack?json(ack):json({error:"receipt_storage_unavailable"},503);
  }catch(error){
    if(error && typeof error==="object" && "code" in error && error.code==="23505")return json({error:"receipt_conflict"},409);
    return json({error:"receipt_storage_unavailable"},503);
  }
}

/** Authenticated configuration/privilege probe. No test row or payment is created. */
export async function handleJussPayLiveReceiptReadiness(request: Request, env: Env): Promise<Response> {
  if (env.JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED !== "true") return json({error:"not_found"},404);
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);
  const secret=liveReceiptSecret(env);
  if (!env.DATABASE_URL || !secret ||
      !/^[a-f0-9]{40}$/.test(env.RELEASE_SHA||"")) return json({error:"not_configured"},503);
  let raw:string;
  try {raw=await readBoundedText(request,1024);}catch{return json({error:"invalid_body"},400);}
  if(!await verifyLiveReceiptSignature(raw,request.headers.get("x-jbh-jusspay-signature")||"",secret))return json({error:"invalid_signature"},401);
  if(raw!==JSON.stringify({schema:"jbh-private/jusspay-live-readiness@v1"}))return json({error:"invalid_body"},400);
  try {
    const sql=neon(env.DATABASE_URL);
    const rows=await sql`
      SELECT
        to_regclass('public.jusspay_live_order_receipt_state') IS NOT NULL
        AND to_regclass('public.jusspay_live_receipt_events') IS NOT NULL
        AND to_regprocedure('public.record_jusspay_live_receipt(text,text,text,text,text)') IS NOT NULL
        AND has_table_privilege(current_user,to_regclass('public.jusspay_live_order_receipt_state'),'SELECT')
        AND has_table_privilege(current_user,to_regclass('public.jusspay_live_order_receipt_state'),'INSERT')
        AND has_table_privilege(current_user,to_regclass('public.jusspay_live_order_receipt_state'),'UPDATE')
        AND has_table_privilege(current_user,to_regclass('public.jusspay_live_receipt_events'),'SELECT')
        AND has_table_privilege(current_user,to_regclass('public.jusspay_live_receipt_events'),'INSERT')
        AND has_function_privilege(current_user,to_regprocedure('public.record_jusspay_live_receipt(text,text,text,text,text)'),'EXECUTE')
        AS ready
    `;
    if(rows[0]?.ready!==true)return json({error:"receipt_schema_unavailable"},503);
    return json({schema:"jbh-private/jusspay-live-readiness@v1",livemode:true,configured:true,releaseSha:env.RELEASE_SHA});
  }catch{return json({error:"receipt_schema_unavailable"},503);}
}

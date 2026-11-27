import { neon } from "@neondatabase/serverless";
import { type Env, json, readBoundedText } from "./shared";
import { parseLiveReceipt, verifyLiveReceiptSignature, liveReceiptAcknowledgment } from "./jusspay-live-receipt-model";

export async function handleJussPayLiveReceipt(request: Request, env: Env): Promise<Response> {
  if (env.JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED !== "true") return json({error:"not_found"},404);
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);
  const secret=env.JBH_JUSSPAY_LIVE_RECEIPT_SECRET;
  if (!env.DATABASE_URL || !secret || secret.length < 32 || secret===env.JBH_JUSSPAY_RECEIPT_SECRET) {
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

export function liveReceiptSecret(env: {JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED?:string;JBH_JUSSPAY_LIVE_RECEIPT_SECRET?:string;JBH_JUSSPAY_RECEIPT_SECRET?:string}):string|null {
  const key=env.JBH_JUSSPAY_LIVE_RECEIPT_SECRET;
  return env.JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED==="true"&&typeof key==="string"&&key.length>=32&&key.length<=512&&key!==env.JBH_JUSSPAY_RECEIPT_SECRET?key:null;
}
const ORDER = /^jbho_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT = /^evt_[A-Za-z0-9_]{1,180}$/;
const PI = /^pi_[A-Za-z0-9_]{1,180}$/;
const STATES = ["awaiting_owner_dispatch", "refunded", "partially_refunded", "disputed"] as const;
export type LiveReceipt = { eventId: string; livemode: true; orderId: string; paymentIntentId: string; state: typeof STATES[number] };
export function parseLiveReceipt(value: unknown): LiveReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const b = value as Record<string, unknown>;
  if (Object.keys(b).sort().join(",") !== "eventId,livemode,orderId,paymentIntentId,state" ||
      b["livemode"] !== true || typeof b["eventId"] !== "string" || !EVENT.test(b["eventId"]) ||
      typeof b["orderId"] !== "string" || !ORDER.test(b["orderId"]) ||
      typeof b["paymentIntentId"] !== "string" || !PI.test(b["paymentIntentId"]) ||
      !STATES.includes(b["state"] as LiveReceipt["state"])) return null;
  return {eventId:b["eventId"],livemode:true,orderId:b["orderId"],paymentIntentId:b["paymentIntentId"],state:b["state"] as LiveReceipt["state"]};
}
export async function verifyLiveReceiptSignature(raw: string, signature: string, secret: string): Promise<boolean> {
  if (secret.length < 32 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,Uint8Array.from(signature.match(/../g)!,x=>parseInt(x,16)),enc.encode(raw));
}
export function liveReceiptAcknowledgment(receipt: LiveReceipt, result: {state:unknown;duplicate:unknown}) {
  if ((result.state !== "hold" && result.state !== "awaiting_owner_review") || typeof result.duplicate !== "boolean" ||
      (receipt.state !== "awaiting_owner_dispatch" && result.state !== "hold")) return null;
  return {schema:"jbh-private/jusspay-live-receipt@v1",received:true,livemode:true,orderId:receipt.orderId,eventId:receipt.eventId,state:result.state,duplicate:result.duplicate};
}

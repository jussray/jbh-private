import { neon } from "@neondatabase/serverless";
import { type Env, json, readBoundedText } from "./shared";

const ORDER = /^jbho_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT = /^evt_[A-Za-z0-9_]+$/;
const PI = /^pi_[A-Za-z0-9_]+$/;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");

export async function handleJussPaySandboxReceipt(request: Request, env: Env): Promise<Response> {
  if (env.JBH_JUSSPAY_RECEIPTS_ENABLED !== "true") return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.DATABASE_URL || !env.JBH_JUSSPAY_RECEIPT_SECRET || env.JBH_JUSSPAY_RECEIPT_SECRET.length < 32) {
    return json({ error: "not_configured" }, 503);
  }
  let raw: string;
  try { raw = await readBoundedText(request, 4096); } catch { return json({ error: "invalid_body" }, 400); }
  const signature = request.headers.get("x-jbh-jusspay-signature") || "";
  if (!/^[0-9a-f]{64}$/.test(signature)) return json({ error: "invalid_signature" }, 401);
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.JBH_JUSSPAY_RECEIPT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(signature.match(/../g)!, x => parseInt(x, 16)), encoder.encode(raw));
  if (!valid) return json({ error: "invalid_signature" }, 401);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_body" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
  const b = body as Record<string, unknown>;
  if (Object.keys(b).sort().join(",") !== "eventId,livemode,orderId,paymentIntentId,state" ||
      b.livemode !== false || b.state !== "awaiting_owner_dispatch" ||
      typeof b.orderId !== "string" || !ORDER.test(b.orderId) ||
      typeof b.eventId !== "string" || !EVENT.test(b.eventId) ||
      typeof b.paymentIntentId !== "string" || !PI.test(b.paymentIntentId)) {
    return json({ error: "invalid_receipt" }, 400);
  }
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(raw))));
  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      INSERT INTO jusspay_sandbox_receipts (order_id, event_id, payment_intent_id, receipt_sha256)
      VALUES (${b.orderId}, ${b.eventId}, ${b.paymentIntentId}, ${digest})
      ON CONFLICT DO NOTHING
      RETURNING order_id
    `;
    if (rows.length) return json({ received: true, state: "awaiting_owner_review", duplicate: false });
    const existing = await sql`
      SELECT order_id, event_id, payment_intent_id, receipt_sha256
      FROM jusspay_sandbox_receipts WHERE order_id = ${b.orderId} OR event_id = ${b.eventId}
    `;
    if (existing.length !== 1 || existing[0].order_id !== b.orderId ||
        existing[0].event_id !== b.eventId || existing[0].payment_intent_id !== b.paymentIntentId ||
        existing[0].receipt_sha256 !== digest) return json({ error: "receipt_conflict" }, 409);
    return json({ received: true, state: "awaiting_owner_review", duplicate: true });
  } catch {
    return json({ error: "receipt_storage_unavailable" }, 503);
  }
}

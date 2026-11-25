import { neon } from "@neondatabase/serverless";
import { type Env, json, readBoundedText } from "./shared";

const ORDER = /^jbho_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT = /^evt_[A-Za-z0-9_]+$/;
const PI = /^pi_[A-Za-z0-9_]+$/;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");

export async function handleJussPayLiveReceipt(request: Request, env: Env): Promise<Response> {
  if (env.JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED !== "true") return json({ error: "not_found" }, 404);
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
      b.livemode !== true || !["awaiting_owner_dispatch","refunded","partially_refunded","disputed"].includes(b.state as string) ||
      typeof b.orderId !== "string" || !ORDER.test(b.orderId) ||
      typeof b.eventId !== "string" || !EVENT.test(b.eventId) ||
      typeof b.paymentIntentId !== "string" || !PI.test(b.paymentIntentId)) {
    return json({ error: "invalid_receipt" }, 400);
  }
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(raw))));
  try {
    const sql = neon(env.DATABASE_URL);
    // Both live receipt tables share one bounded transaction and lock order.
    // A concurrent hold cannot slip between the paid insert and its readback.
    if (b.state !== "awaiting_owner_dispatch") {
      const [, , holds] = await sql.transaction([
        sql`SET LOCAL lock_timeout = '5s'`,
        sql`LOCK TABLE jusspay_live_receipts, jusspay_live_holds IN SHARE ROW EXCLUSIVE MODE`,
        sql`
          INSERT INTO jusspay_live_holds (order_id, event_id, payment_intent_id, reason)
          SELECT ${b.orderId}, ${b.eventId}, ${b.paymentIntentId}, ${b.state}
          WHERE NOT EXISTS (
            SELECT 1 FROM jusspay_live_receipts p
            WHERE p.event_id = ${b.eventId}
               OR (p.order_id = ${b.orderId} AND p.payment_intent_id <> ${b.paymentIntentId})
          ) AND NOT EXISTS (
            SELECT 1 FROM jusspay_live_holds h
            WHERE h.event_id = ${b.eventId} AND h.order_id <> ${b.orderId}
          )
          ON CONFLICT (order_id) DO UPDATE SET
            event_id = EXCLUDED.event_id,
            reason = CASE
              WHEN jusspay_live_holds.reason = 'disputed' OR EXCLUDED.reason = 'disputed' THEN 'disputed'
              WHEN jusspay_live_holds.reason = 'refunded' OR EXCLUDED.reason = 'refunded' THEN 'refunded'
              ELSE 'partially_refunded'
            END
          WHERE jusspay_live_holds.payment_intent_id = EXCLUDED.payment_intent_id
          RETURNING order_id, reason
        `,
        sql`
          UPDATE jusspay_live_receipts p SET state = 'hold'
          WHERE p.order_id = ${b.orderId} AND p.payment_intent_id = ${b.paymentIntentId}
            AND EXISTS (SELECT 1 FROM jusspay_live_holds h
              WHERE h.order_id = p.order_id AND h.event_id = ${b.eventId}
                AND h.payment_intent_id = ${b.paymentIntentId})
            AND NOT EXISTS (SELECT 1 FROM jusspay_live_receipts WHERE event_id = ${b.eventId})
        `,
      ], { isolationLevel: "ReadCommitted" });
      if (holds.length !== 1) return json({ error: "receipt_conflict" }, 409);
      return json({ received: true, state: "hold", reason: holds[0].reason, duplicate: false });
    }
    const [, , rows, , held, existing] = await sql.transaction([
      sql`SET LOCAL lock_timeout = '5s'`,
      sql`LOCK TABLE jusspay_live_receipts, jusspay_live_holds IN SHARE ROW EXCLUSIVE MODE`,
      sql`
        INSERT INTO jusspay_live_receipts (order_id, event_id, payment_intent_id, receipt_sha256, state)
        SELECT ${b.orderId}, ${b.eventId}, ${b.paymentIntentId}, ${digest},
          CASE WHEN EXISTS (SELECT 1 FROM jusspay_live_holds h WHERE h.order_id = ${b.orderId}
            AND h.payment_intent_id = ${b.paymentIntentId}) THEN 'hold' ELSE 'awaiting_owner_review' END
        WHERE NOT EXISTS (SELECT 1 FROM jusspay_live_holds h
          WHERE h.event_id = ${b.eventId} OR (h.order_id = ${b.orderId} AND h.payment_intent_id <> ${b.paymentIntentId}))
        ON CONFLICT DO NOTHING
        RETURNING order_id
      `,
      // Repair only an exact historical paid receipt if a matching hold exists.
      sql`UPDATE jusspay_live_receipts p SET state = 'hold'
        WHERE p.order_id = ${b.orderId} AND p.event_id = ${b.eventId}
          AND p.payment_intent_id = ${b.paymentIntentId} AND p.receipt_sha256 = ${digest}
          AND EXISTS (SELECT 1 FROM jusspay_live_holds h WHERE h.order_id = p.order_id
            AND h.payment_intent_id = p.payment_intent_id AND h.event_id <> p.event_id)
          AND NOT EXISTS (SELECT 1 FROM jusspay_live_holds WHERE event_id = ${b.eventId})`,
      sql`SELECT order_id, event_id, payment_intent_id FROM jusspay_live_holds WHERE order_id = ${b.orderId} OR event_id = ${b.eventId}`,
      sql`SELECT order_id, event_id, payment_intent_id, receipt_sha256, state FROM jusspay_live_receipts WHERE order_id = ${b.orderId} OR event_id = ${b.eventId}`,
    ], { isolationLevel: "ReadCommitted" });
    if (held.length) {
      if (held.length !== 1 || held[0].order_id !== b.orderId ||
          held[0].payment_intent_id !== b.paymentIntentId || held[0].event_id === b.eventId ||
          existing.length !== 1 || existing[0].state !== "hold" || existing[0].order_id !== b.orderId ||
          existing[0].payment_intent_id !== b.paymentIntentId || existing[0].event_id !== b.eventId ||
          existing[0].receipt_sha256 !== digest) return json({ error: "receipt_conflict" }, 409);
      return json({ received: true, state: "hold", duplicate: !rows.length });
    }
    if (existing.length !== 1 || existing[0].order_id !== b.orderId ||
        existing[0].event_id !== b.eventId || existing[0].payment_intent_id !== b.paymentIntentId ||
        existing[0].receipt_sha256 !== digest) return json({ error: "receipt_conflict" }, 409);
    return json({ received: true, state: existing[0].state, duplicate: !rows.length });
  } catch {
    return json({ error: "receipt_storage_unavailable" }, 503);
  }
}

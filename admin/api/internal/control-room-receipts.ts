import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const ALLOWED_EVENTS = new Set([
  "paid_order_recorded",
  "vendor_review_required",
  "vendor_groups_ready",
  "owner_approved",
  "fulfillment_queued",
  "completed",
]);

function bearerToken(req: VercelRequest): string | null {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length);
}

function secretsMatch(left: string | null, right: string): boolean {
  if (!left) return false;
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function receiptEndpoint(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.pathname !== "/ingest/hair-commerce-receipts") return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function safeFailure(error: unknown): string {
  if (error instanceof Error) return error.name.slice(0, 80) || "Error";
  return "UnknownError";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return res.status(503).json({ error: "Receipt dispatcher is not configured" });
  }
  if (!secretsMatch(bearerToken(req), cronSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const target = process.env.CONTROL_ROOM_RECEIPT_URL?.trim();
  const targetToken = process.env.CONTROL_ROOM_RECEIPT_TOKEN?.trim();
  const hashSalt = process.env.CONTROL_ROOM_RECEIPT_HASH_SALT?.trim();
  const exactCommitSha = (
    process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? ""
  ).trim();
  const endpoint = target ? receiptEndpoint(target) : null;

  if (
    !databaseUrl ||
    !endpoint ||
    !targetToken ||
    !hashSalt ||
    hashSalt.length < 16 ||
    !COMMIT_SHA.test(exactCommitSha)
  ) {
    return res.status(503).json({ error: "Receipt dispatcher bindings are incomplete" });
  }

  const sql = neon(databaseUrl);
  let rows: Array<Record<string, unknown>>;
  try {
    rows = (await sql`
      SELECT
        id,
        receipt_id::text AS receipt_id,
        order_id,
        event_type,
        group_count,
        unresolved_count,
        created_at
      FROM control_room_receipt_outbox
      WHERE sent_at IS NULL
        AND attempt_count < 20
      ORDER BY id
      LIMIT 25
    `) as Array<Record<string, unknown>>;
  } catch {
    return res.status(503).json({ error: "Receipt outbox unavailable" });
  }

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const id = Number(row.id);
    const orderId = Number(row.order_id);
    const receiptId = String(row.receipt_id ?? "");
    const event = String(row.event_type ?? "");
    const groupCount = Number(row.group_count);
    const unresolvedCount = Number(row.unresolved_count);
    const occurredAt = new Date(String(row.created_at ?? ""));

    if (
      !Number.isSafeInteger(id) ||
      !Number.isSafeInteger(orderId) ||
      !ALLOWED_EVENTS.has(event) ||
      !Number.isSafeInteger(groupCount) ||
      !Number.isSafeInteger(unresolvedCount) ||
      Number.isNaN(occurredAt.getTime())
    ) {
      failed += 1;
      await sql`
        UPDATE control_room_receipt_outbox
        SET attempt_count = attempt_count + 1,
            last_error = 'invalid_outbox_row'
        WHERE id = ${id}
          AND sent_at IS NULL
      `;
      continue;
    }

    const orderRefHash = createHmac("sha256", hashSalt)
      .update(`jbh-order:${orderId}`)
      .digest("hex");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-jbh-receipt-token": targetToken,
        },
        body: JSON.stringify({
          receiptId,
          sourceRepo: "jussray/jbh-private",
          orderRefHash,
          event,
          groupCount,
          unresolvedCount,
          occurredAt: occurredAt.toISOString(),
          exactCommitSha: exactCommitSha.toLowerCase(),
        }),
      });

      if (!response.ok) {
        failed += 1;
        await sql`
          UPDATE control_room_receipt_outbox
          SET attempt_count = attempt_count + 1,
              last_error = ${`http_${response.status}`},
              created_at = created_at
          WHERE id = ${id}
            AND sent_at IS NULL
        `;
        continue;
      }

      await sql`
        UPDATE control_room_receipt_outbox
        SET sent_at = NOW(),
            last_error = NULL
        WHERE id = ${id}
          AND sent_at IS NULL
      `;
      sent += 1;
    } catch (error) {
      failed += 1;
      await sql`
        UPDATE control_room_receipt_outbox
        SET attempt_count = attempt_count + 1,
            last_error = ${safeFailure(error)}
        WHERE id = ${id}
          AND sent_at IS NULL
      `;
    }
  }

  return res.status(200).json({ processed: rows.length, sent, failed });
}

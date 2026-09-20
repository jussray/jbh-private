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

type ReceiptSource = "legacy" | "shopify_physical";
type ReceiptCandidate = {
  source: ReceiptSource;
  id: number;
  receiptId: string;
  orderRef: string;
  event: string;
  groupCount: number;
  unresolvedCount: number;
  occurredAt: Date;
  collectedValueCents?: number;
  currency?: "USD";
};

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

function collectedCentsFromLegacyTotal(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= 100_000_000
    ? cents
    : null;
}

function validCandidate(candidate: ReceiptCandidate): boolean {
  if (!Number.isSafeInteger(candidate.id) || candidate.id <= 0) return false;
  if (!candidate.receiptId || !candidate.orderRef) return false;
  if (!ALLOWED_EVENTS.has(candidate.event)) return false;
  if (!Number.isSafeInteger(candidate.groupCount) || candidate.groupCount < 0) return false;
  if (!Number.isSafeInteger(candidate.unresolvedCount) || candidate.unresolvedCount < 0) return false;
  if (Number.isNaN(candidate.occurredAt.getTime())) return false;

  if (candidate.event === "paid_order_recorded") {
    return (
      Number.isSafeInteger(candidate.collectedValueCents) &&
      (candidate.collectedValueCents ?? 0) >= 1 &&
      (candidate.collectedValueCents ?? 0) <= 100_000_000 &&
      candidate.currency === "USD"
    );
  }

  return candidate.collectedValueCents === undefined && candidate.currency === undefined;
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
  let legacyRows: Array<Record<string, unknown>>;
  let physicalRows: Array<Record<string, unknown>>;
  try {
    legacyRows = (await sql`
      SELECT
        outbox.id,
        outbox.receipt_id::text AS receipt_id,
        outbox.order_id,
        outbox.event_type,
        outbox.group_count,
        outbox.unresolved_count,
        outbox.created_at,
        orders.total
      FROM control_room_receipt_outbox AS outbox
      JOIN orders ON orders.id = outbox.order_id
      WHERE outbox.sent_at IS NULL
        AND outbox.attempt_count < 20
      ORDER BY outbox.id
      LIMIT 25
    `) as Array<Record<string, unknown>>;

    physicalRows = (await sql`
      SELECT
        id,
        receipt_id::text AS receipt_id,
        shopify_order_id,
        event_type,
        collected_value_cents,
        currency,
        created_at
      FROM shopify_physical_control_room_receipt_outbox
      WHERE sent_at IS NULL
        AND attempt_count < 20
      ORDER BY id
      LIMIT 25
    `) as Array<Record<string, unknown>>;
  } catch {
    return res.status(503).json({ error: "Receipt outbox unavailable" });
  }

  const candidates: ReceiptCandidate[] = [
    ...legacyRows.map((row) => {
      const event = String(row.event_type ?? "");
      const paidCents = event === "paid_order_recorded"
        ? collectedCentsFromLegacyTotal(row.total)
        : undefined;
      return {
        source: "legacy" as const,
        id: Number(row.id),
        receiptId: String(row.receipt_id ?? ""),
        orderRef: String(row.order_id ?? ""),
        event,
        groupCount: Number(row.group_count),
        unresolvedCount: Number(row.unresolved_count),
        occurredAt: new Date(String(row.created_at ?? "")),
        collectedValueCents: paidCents === null ? undefined : paidCents,
        currency: event === "paid_order_recorded" && paidCents !== null ? "USD" as const : undefined,
      };
    }),
    ...physicalRows.map((row) => ({
      source: "shopify_physical" as const,
      id: Number(row.id),
      receiptId: String(row.receipt_id ?? ""),
      orderRef: String(row.shopify_order_id ?? ""),
      event: String(row.event_type ?? ""),
      groupCount: 0,
      unresolvedCount: 0,
      occurredAt: new Date(String(row.created_at ?? "")),
      collectedValueCents: Number(row.collected_value_cents),
      currency: row.currency === "USD" ? "USD" as const : undefined,
    })),
  ];

  let sent = 0;
  let failed = 0;

  const markFailure = async (candidate: ReceiptCandidate, reason: string) => {
    if (candidate.source === "legacy") {
      await sql`
        UPDATE control_room_receipt_outbox
        SET attempt_count = attempt_count + 1,
            last_error = ${reason}
        WHERE id = ${candidate.id}
          AND sent_at IS NULL
      `;
      return;
    }

    await sql`
      UPDATE shopify_physical_control_room_receipt_outbox
      SET attempt_count = attempt_count + 1,
          last_error = ${reason}
      WHERE id = ${candidate.id}
        AND sent_at IS NULL
    `;
  };

  const markSent = async (candidate: ReceiptCandidate) => {
    if (candidate.source === "legacy") {
      await sql`
        UPDATE control_room_receipt_outbox
        SET sent_at = NOW(),
            last_error = NULL
        WHERE id = ${candidate.id}
          AND sent_at IS NULL
      `;
      return;
    }

    await sql`
      UPDATE shopify_physical_control_room_receipt_outbox
      SET sent_at = NOW(),
          last_error = NULL
      WHERE id = ${candidate.id}
        AND sent_at IS NULL
    `;
  };

  for (const candidate of candidates) {
    if (!validCandidate(candidate)) {
      failed += 1;
      await markFailure(candidate, "invalid_outbox_row");
      continue;
    }

    const orderRefHash = createHmac("sha256", hashSalt)
      .update(
        candidate.source === "shopify_physical"
          ? `jbh-shopify-order:${candidate.orderRef}`
          : `jbh-order:${candidate.orderRef}`,
      )
      .digest("hex");

    const moneyFields = candidate.event === "paid_order_recorded"
      ? {
          collectedValueCents: candidate.collectedValueCents,
          currency: candidate.currency,
        }
      : {};

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-jbh-receipt-token": targetToken,
        },
        body: JSON.stringify({
          receiptId: candidate.receiptId,
          sourceRepo: "jussray/jbh-private",
          orderRefHash,
          event: candidate.event,
          groupCount: candidate.groupCount,
          unresolvedCount: candidate.unresolvedCount,
          occurredAt: candidate.occurredAt.toISOString(),
          exactCommitSha: exactCommitSha.toLowerCase(),
          ...moneyFields,
        }),
      });

      if (!response.ok) {
        failed += 1;
        await markFailure(candidate, `http_${response.status}`);
        continue;
      }

      await markSent(candidate);
      sent += 1;
    } catch (error) {
      failed += 1;
      await markFailure(candidate, safeFailure(error));
    }
  }

  return res.status(200).json({
    processed: candidates.length,
    sent,
    failed,
    sources: {
      legacy: legacyRows.length,
      shopifyPhysical: physicalRows.length,
    },
  });
}

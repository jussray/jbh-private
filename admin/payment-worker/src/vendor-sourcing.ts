import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { validateAccess } from "./access";
import {
  type Env,
  json,
  MAX_ADMIN_BODY_BYTES,
  readBoundedText,
  safeErrorCode,
  SafeProcessingError,
  text,
} from "./shared";

const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/);
const moneySchema = z.number().int().min(0).max(100_000_000);

const quoteItemSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  variant: z.string().trim().min(1).max(200),
  vendorSku: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(1000),
  unitCostCents: moneySchema,
  sampleCandidate: z.boolean().optional().default(true),
});

const quoteInputSchema = z.object({
  vendorId: z.number().int().positive(),
  sourceMessageId: z.string().trim().min(1).max(250).optional(),
  sourceThreadId: z.string().trim().min(1).max(250).optional(),
  quoteReference: z.string().trim().min(1).max(250).optional(),
  currency: currencySchema.default("USD"),
  replyReceivedAt: z.string().datetime({ offset: true }),
  termsSummary: z.string().trim().max(5000).optional(),
  shippingSummary: z.string().trim().max(5000).optional(),
  returnSummary: z.string().trim().max(5000).optional(),
  brandingSummary: z.string().trim().max(5000).optional(),
  paymentSummary: z.string().trim().max(5000).optional(),
  minimumOrderCents: moneySchema.optional(),
  quotedShippingCents: moneySchema.default(0),
  quotedDutiesCents: moneySchema.default(0),
  validUntil: z.string().date().optional(),
  items: z.array(quoteItemSchema).min(1).max(100),
});

const sampleItemSchema = z.object({
  quoteItemId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(1000),
});

const sampleRequestSchema = z
  .object({
    quoteId: z.number().int().positive(),
    shipToKind: z.enum(["owner", "business"]),
    shipToReference: z.string().trim().min(1).max(250),
    shippingCents: moneySchema.default(0),
    dutiesCents: moneySchema.default(0),
    items: z.array(sampleItemSchema).min(1).max(100),
  })
  .superRefine((value, context) => {
    const ids = value.items.map((item) => item.quoteItemId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Duplicate quote item",
      });
    }
  });

const approvalSchema = z.object({
  expectedTotalCents: moneySchema,
  approvalNote: z.string().trim().min(3).max(1000),
});

function privateHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}

async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  const raw = await readBoundedText(request, MAX_ADMIN_BODY_BYTES);
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new SafeProcessingError("invalid_request");
  return parsed.data;
}

async function listSourcing(env: Env): Promise<Response> {
  if (!env.DATABASE_URL) {
    return json({ error: "Vendor sourcing unavailable" }, 503, privateHeaders());
  }
  const sql = neon(env.DATABASE_URL);
  const [vendors, quotes, sampleRequests] = await Promise.all([
    sql`
      SELECT id, code, display_name, fulfillment_email, active, created_at, updated_at
      FROM vendors
      ORDER BY display_name
      LIMIT 100
    `,
    sql`
      SELECT
        q.id,
        q.vendor_id,
        q.source_message_id,
        q.source_thread_id,
        q.quote_reference,
        q.currency,
        q.status,
        q.reply_received_at,
        q.terms_summary,
        q.shipping_summary,
        q.return_summary,
        q.branding_summary,
        q.payment_summary,
        q.minimum_order_cents,
        q.quoted_shipping_cents,
        q.quoted_duties_cents,
        q.valid_until,
        q.created_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', qi.id,
              'productId', qi.product_id,
              'variant', qi.variant,
              'vendorSku', qi.vendor_sku,
              'quantity', qi.quantity,
              'unitCostCents', qi.unit_cost_cents,
              'sampleCandidate', qi.sample_candidate
            ) ORDER BY qi.id
          ) FILTER (WHERE qi.id IS NOT NULL),
          '[]'::jsonb
        ) AS items
      FROM vendor_quotes q
      LEFT JOIN vendor_quote_items qi ON qi.quote_id = q.id
      GROUP BY q.id
      ORDER BY q.reply_received_at DESC, q.id DESC
      LIMIT 100
    `,
    sql`
      SELECT
        id,
        vendor_id,
        quote_id,
        status,
        ship_to_kind,
        ship_to_reference,
        currency,
        subtotal_cents,
        shipping_cents,
        duties_cents,
        total_cents,
        items_json,
        owner_approval_note,
        owner_approved_at,
        created_at,
        updated_at
      FROM vendor_sample_order_requests
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `,
  ]);
  return json({ vendors, quotes, sampleRequests }, 200, privateHeaders());
}

async function createQuote(request: Request, env: Env): Promise<Response> {
  if (!env.DATABASE_URL) {
    return json({ error: "Vendor sourcing unavailable" }, 503, privateHeaders());
  }
  const input = await parseBody(request, quoteInputSchema);
  const sql = neon(env.DATABASE_URL);
  const vendorRows = (await sql`
    SELECT id FROM vendors WHERE id = ${input.vendorId} LIMIT 1
  `) as unknown as Array<{ id: number }>;
  if (!vendorRows[0]) {
    return json({ error: "Vendor not found" }, 404, privateHeaders());
  }

  const itemRecords = input.items.map((item) => ({
    product_id: item.productId,
    variant: item.variant,
    vendor_sku: item.vendorSku,
    quantity: item.quantity,
    unit_cost_cents: item.unitCostCents,
    sample_candidate: item.sampleCandidate,
  }));

  const rows = (await sql`
    WITH inserted_quote AS (
      INSERT INTO vendor_quotes (
        vendor_id,
        source_message_id,
        source_thread_id,
        quote_reference,
        currency,
        status,
        reply_received_at,
        terms_summary,
        shipping_summary,
        return_summary,
        branding_summary,
        payment_summary,
        minimum_order_cents,
        quoted_shipping_cents,
        quoted_duties_cents,
        valid_until
      ) VALUES (
        ${input.vendorId},
        ${input.sourceMessageId ?? null},
        ${input.sourceThreadId ?? null},
        ${input.quoteReference ?? null},
        ${input.currency},
        'received',
        ${input.replyReceivedAt}::timestamptz,
        ${input.termsSummary ?? null},
        ${input.shippingSummary ?? null},
        ${input.returnSummary ?? null},
        ${input.brandingSummary ?? null},
        ${input.paymentSummary ?? null},
        ${input.minimumOrderCents ?? null},
        ${input.quotedShippingCents},
        ${input.quotedDutiesCents},
        ${input.validUntil ?? null}::date
      )
      RETURNING id, vendor_id, status, currency, reply_received_at
    ),
    inserted_items AS (
      INSERT INTO vendor_quote_items (
        quote_id,
        product_id,
        variant,
        vendor_sku,
        quantity,
        unit_cost_cents,
        sample_candidate
      )
      SELECT
        quote.id,
        item.product_id,
        item.variant,
        item.vendor_sku,
        item.quantity,
        item.unit_cost_cents,
        item.sample_candidate
      FROM inserted_quote quote
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(itemRecords)}::jsonb) AS item(
        product_id TEXT,
        variant TEXT,
        vendor_sku TEXT,
        quantity INTEGER,
        unit_cost_cents INTEGER,
        sample_candidate BOOLEAN
      )
      RETURNING quote_id
    )
    SELECT
      quote.id,
      quote.vendor_id,
      quote.status,
      quote.currency,
      quote.reply_received_at,
      (SELECT COUNT(*)::INTEGER FROM inserted_items) AS item_count
    FROM inserted_quote quote
  `) as unknown as Array<Record<string, unknown>>;

  return json({ quote: rows[0] }, 201, privateHeaders());
}

async function createSampleRequest(request: Request, env: Env): Promise<Response> {
  if (!env.DATABASE_URL) {
    return json({ error: "Vendor sourcing unavailable" }, 503, privateHeaders());
  }
  const input = await parseBody(request, sampleRequestSchema);
  const sql = neon(env.DATABASE_URL);
  const requested = input.items.map((item) => ({
    quote_item_id: item.quoteItemId,
    quantity: item.quantity,
  }));

  const rows = (await sql`
    WITH requested AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(requested)}::jsonb) AS item(
        quote_item_id INTEGER,
        quantity INTEGER
      )
    )
    SELECT
      qi.id,
      qi.product_id,
      qi.variant,
      qi.vendor_sku,
      qi.unit_cost_cents,
      requested.quantity,
      q.vendor_id,
      q.currency,
      q.status AS quote_status
    FROM requested
    JOIN vendor_quote_items qi ON qi.id = requested.quote_item_id
    JOIN vendor_quotes q ON q.id = qi.quote_id
    WHERE q.id = ${input.quoteId}
    ORDER BY qi.id
  `) as unknown as Array<{
    id: number;
    product_id: string;
    variant: string;
    vendor_sku: string;
    unit_cost_cents: number;
    quantity: number;
    vendor_id: number;
    currency: string;
    quote_status: string;
  }>;

  if (rows.length !== input.items.length) {
    return json({ error: "Quote items do not match the quote" }, 409, privateHeaders());
  }
  if (rows.some((row) => ["rejected", "expired"].includes(row.quote_status))) {
    return json({ error: "Quote is not eligible for a sample" }, 409, privateHeaders());
  }

  const vendorId = rows[0].vendor_id;
  const currency = rows[0].currency;
  if (rows.some((row) => row.vendor_id !== vendorId || row.currency !== currency)) {
    return json({ error: "Sample items span multiple quotes" }, 409, privateHeaders());
  }

  const items = rows.map((row) => ({
    quoteItemId: row.id,
    productId: row.product_id,
    variant: row.variant,
    vendorSku: row.vendor_sku,
    quantity: row.quantity,
    unitCostCents: Number(row.unit_cost_cents),
    lineTotalCents: Number(row.unit_cost_cents) * row.quantity,
  }));
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const totalCents = subtotalCents + input.shippingCents + input.dutiesCents;

  const inserted = (await sql`
    INSERT INTO vendor_sample_order_requests (
      vendor_id,
      quote_id,
      status,
      ship_to_kind,
      ship_to_reference,
      currency,
      subtotal_cents,
      shipping_cents,
      duties_cents,
      total_cents,
      items_json
    ) VALUES (
      ${vendorId},
      ${input.quoteId},
      'awaiting_owner_approval',
      ${input.shipToKind},
      ${input.shipToReference},
      ${currency},
      ${subtotalCents},
      ${input.shippingCents},
      ${input.dutiesCents},
      ${totalCents},
      ${JSON.stringify(items)}::jsonb
    )
    RETURNING id, vendor_id, quote_id, status, currency, subtotal_cents,
              shipping_cents, duties_cents, total_cents, items_json, created_at
  `) as unknown as Array<Record<string, unknown>>;

  return json({ sampleRequest: inserted[0] }, 201, privateHeaders());
}

async function markReadyForOwnerCheckout(
  request: Request,
  env: Env,
  requestId: number,
): Promise<Response> {
  if (!env.DATABASE_URL) {
    return json({ error: "Vendor sourcing unavailable" }, 503, privateHeaders());
  }
  const input = await parseBody(request, approvalSchema);
  const sql = neon(env.DATABASE_URL);
  const rows = (await sql`
    UPDATE vendor_sample_order_requests
    SET status = 'ready_for_owner_checkout',
        owner_approval_note = ${input.approvalNote},
        owner_approved_at = NOW(),
        updated_at = NOW()
    WHERE id = ${requestId}
      AND status = 'awaiting_owner_approval'
      AND total_cents = ${input.expectedTotalCents}
      AND jsonb_array_length(items_json) > 0
      AND length(trim(ship_to_reference)) > 0
    RETURNING id, vendor_id, quote_id, status, currency, total_cents,
              owner_approval_note, owner_approved_at, updated_at
  `) as unknown as Array<Record<string, unknown>>;
  if (!rows[0]) {
    return json(
      { error: "Sample request is incomplete, changed, or not awaiting approval" },
      409,
      privateHeaders(),
    );
  }
  return json({ sampleRequest: rows[0] }, 200, privateHeaders());
}

export async function handleVendorSourcingRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!(await validateAccess(request, env))) {
    return json({ error: "Unauthorized" }, 401, privateHeaders());
  }

  const { pathname } = new URL(request.url);
  const readyMatch = pathname.match(
    /^\/api\/admin\/vendor-sourcing\/sample-requests\/(\d+)\/ready$/,
  );

  try {
    if (readyMatch) {
      if (request.method !== "PATCH") {
        return text("Method not allowed", 405, {
          ...privateHeaders(),
          Allow: "PATCH",
        });
      }
      return markReadyForOwnerCheckout(request, env, Number(readyMatch[1]));
    }

    if (pathname === "/api/admin/vendor-sourcing/quotes") {
      if (request.method !== "POST") {
        return text("Method not allowed", 405, {
          ...privateHeaders(),
          Allow: "POST",
        });
      }
      return createQuote(request, env);
    }

    if (pathname === "/api/admin/vendor-sourcing/sample-requests") {
      if (request.method !== "POST") {
        return text("Method not allowed", 405, {
          ...privateHeaders(),
          Allow: "POST",
        });
      }
      return createSampleRequest(request, env);
    }

    if (pathname === "/api/admin/vendor-sourcing") {
      if (request.method !== "GET") {
        return text("Method not allowed", 405, {
          ...privateHeaders(),
          Allow: "GET",
        });
      }
      return listSourcing(env);
    }

    return json({ error: "Not found" }, 404, privateHeaders());
  } catch (error) {
    const code = safeErrorCode(error);
    const oversized = code === "payload_too_large";
    const invalid = code === "invalid_request" || error instanceof SyntaxError;
    console.error(`[ADMIN] vendor sourcing failed (${code})`);
    return json(
      {
        error: oversized
          ? "Request too large"
          : invalid
            ? "Invalid vendor sourcing request"
            : "Unable to update vendor sourcing",
      },
      oversized ? 413 : invalid ? 400 : 500,
      privateHeaders(),
    );
  }
}

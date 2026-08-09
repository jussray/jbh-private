import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { validateAccess } from "./access";
import {
  type Env,
  json,
  MAX_ADMIN_BODY_BYTES,
  readBoundedText,
  safeErrorCode,
  text,
} from "./shared";

const statusSchema = z.enum([
  "procurement_needed",
  "supplier_ordered",
  "supplier_confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

type ProcurementStatus = z.infer<typeof statusSchema>;

const updateSchema = z.object({
  status: statusSchema,
  supplierCode: z.string().trim().min(1).max(80).optional(),
  supplierOrderReference: z.string().trim().min(1).max(160).optional(),
  trackingNumber: z.string().trim().min(1).max(160).optional(),
  trackingCarrier: z.string().trim().min(1).max(80).optional(),
});

const allowedTransitions: Record<ProcurementStatus, ProcurementStatus[]> = {
  procurement_needed: ["supplier_ordered", "cancelled"],
  supplier_ordered: ["supplier_confirmed", "shipped", "cancelled"],
  supplier_confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

function privateHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}

async function listProcurementOrders(env: Env): Promise<Response> {
  if (!env.DATABASE_URL) {
    return json({ error: "Order storage unavailable" }, 503, privateHeaders());
  }
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT id, shopify_order_id, shopify_order_gid, order_name,
           customer_email, customer_name, customer_phone,
           shipping_address_json, items_json, subtotal_cents, total_cents,
           currency, payment_status, procurement_status, supplier_code,
           supplier_order_reference, tracking_number, tracking_carrier,
           ordered_at, confirmed_at, shipped_at, delivered_at,
           created_at, updated_at
    FROM shopify_physical_orders
    ORDER BY created_at DESC
    LIMIT 500
  `;
  return json({ orders: rows }, 200, privateHeaders());
}

async function updateProcurementStatus(
  request: Request,
  env: Env,
  orderId: number,
): Promise<Response> {
  if (request.method !== "PATCH") {
    return text("Method not allowed", 405, {
      ...privateHeaders(),
      Allow: "PATCH",
    });
  }
  if (!env.DATABASE_URL) {
    return json({ error: "Order storage unavailable" }, 503, privateHeaders());
  }

  let input: z.infer<typeof updateSchema>;
  try {
    const raw = await readBoundedText(request, MAX_ADMIN_BODY_BYTES);
    const parsed = updateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return json({ error: "Invalid procurement update" }, 400, privateHeaders());
    }
    input = parsed.data;
  } catch (error) {
    const oversized = safeErrorCode(error) === "payload_too_large";
    return json(
      { error: oversized ? "Request too large" : "Invalid request" },
      oversized ? 413 : 400,
      privateHeaders(),
    );
  }

  if (
    input.status === "supplier_ordered" &&
    (!input.supplierCode || !input.supplierOrderReference)
  ) {
    return json(
      { error: "Supplier code and supplier order reference are required" },
      400,
      privateHeaders(),
    );
  }
  if (input.status === "shipped" && !input.trackingNumber) {
    return json(
      { error: "Tracking number is required before marking shipped" },
      400,
      privateHeaders(),
    );
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const existing = (await sql`
      SELECT id, procurement_status
      FROM shopify_physical_orders
      WHERE id = ${orderId}
      LIMIT 1
    `) as unknown as Array<{ id: number; procurement_status: ProcurementStatus }>;
    const current = existing[0];
    if (!current) return json({ error: "Order not found" }, 404, privateHeaders());

    if (current.procurement_status !== input.status) {
      const allowed = allowedTransitions[current.procurement_status] ?? [];
      if (!allowed.includes(input.status)) {
        return json(
          {
            error: "Invalid procurement status transition",
            currentStatus: current.procurement_status,
          },
          409,
          privateHeaders(),
        );
      }
    }

    const rows = await sql`
      UPDATE shopify_physical_orders
      SET procurement_status = ${input.status},
          supplier_code = COALESCE(${input.supplierCode ?? null}, supplier_code),
          supplier_order_reference = COALESCE(
            ${input.supplierOrderReference ?? null},
            supplier_order_reference
          ),
          tracking_number = COALESCE(${input.trackingNumber ?? null}, tracking_number),
          tracking_carrier = COALESCE(${input.trackingCarrier ?? null}, tracking_carrier),
          ordered_at = CASE
            WHEN ${input.status} = 'supplier_ordered' THEN COALESCE(ordered_at, NOW())
            ELSE ordered_at
          END,
          confirmed_at = CASE
            WHEN ${input.status} = 'supplier_confirmed' THEN COALESCE(confirmed_at, NOW())
            ELSE confirmed_at
          END,
          shipped_at = CASE
            WHEN ${input.status} = 'shipped' THEN COALESCE(shipped_at, NOW())
            ELSE shipped_at
          END,
          delivered_at = CASE
            WHEN ${input.status} = 'delivered' THEN COALESCE(delivered_at, NOW())
            ELSE delivered_at
          END,
          updated_at = NOW()
      WHERE id = ${orderId}
      RETURNING id, shopify_order_id, order_name, procurement_status,
                supplier_code, supplier_order_reference, tracking_number,
                tracking_carrier, ordered_at, confirmed_at, shipped_at,
                delivered_at, updated_at
    `;
    return json({ order: rows[0] }, 200, privateHeaders());
  } catch (error) {
    console.error(
      `[SHOPIFY_PROCUREMENT] update failed (${safeErrorCode(error)})`,
    );
    return json({ error: "Unable to update procurement order" }, 500, privateHeaders());
  }
}

export async function handleShopifyProcurementAdminRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!(await validateAccess(request, env))) {
    return json({ error: "Unauthorized" }, 401, privateHeaders());
  }

  const { pathname } = new URL(request.url);
  if (pathname === "/api/admin/procurement-orders") {
    if (request.method !== "GET") {
      return text("Method not allowed", 405, {
        ...privateHeaders(),
        Allow: "GET",
      });
    }
    try {
      return await listProcurementOrders(env);
    } catch (error) {
      console.error(
        `[SHOPIFY_PROCUREMENT] read failed (${safeErrorCode(error)})`,
      );
      return json({ error: "Unable to read procurement orders" }, 500, privateHeaders());
    }
  }

  const statusMatch = pathname.match(
    /^\/api\/admin\/procurement-orders\/(\d+)\/status$/,
  );
  if (statusMatch) {
    return updateProcurementStatus(request, env, Number(statusMatch[1]));
  }

  return json({ error: "Not found" }, 404, privateHeaders());
}

import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { validateAccess } from "./access";
import {
  type Env,
  json,
  MAX_ADMIN_BODY_BYTES,
  MAX_ADMIN_ORDERS,
  readBoundedText,
  safeErrorCode,
  SafeProcessingError,
  text,
} from "./shared";

const vendorStatusSchema = z.enum([
  "unassigned",
  "ready",
  "ordered",
  "confirmed",
  "shipped",
]);

const storedItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(500),
  variant: z.string().trim().max(500),
  price: z.number().min(0).max(1_000_000),
  qty: z.number().int().min(1).max(999),
  image: z.string().max(2000).optional().default(""),
  assignedVendorId: z.string().max(100).optional().default(""),
  routeId: z.string().max(100).optional().default(""),
  vendorSku: z.string().max(200).optional().default(""),
  vendorUnitCost: z.number().min(0).max(1_000_000).optional().default(0),
  vendorStatus: vendorStatusSchema.optional().default("unassigned"),
});

const storedItemsSchema = z.array(storedItemSchema).min(1).max(100);

const routingUpdateSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1).max(100),
        assignedVendorId: z.string().trim().max(100),
        routeId: z.string().trim().max(100),
        vendorSku: z.string().trim().max(200),
        vendorUnitCost: z.number().min(0).max(1_000_000),
        vendorStatus: vendorStatusSchema,
      }),
    )
    .min(1)
    .max(100),
});

type VendorStatus =
  | "unassigned"
  | "ready"
  | "ordered"
  | "confirmed"
  | "shipped";

interface StoredItem {
  id: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
  image: string;
  assignedVendorId: string;
  routeId: string;
  vendorSku: string;
  vendorUnitCost: number;
  vendorStatus: VendorStatus;
}

interface RoutingUpdateItem {
  itemId: string;
  assignedVendorId: string;
  routeId: string;
  vendorSku: string;
  vendorUnitCost: number;
  vendorStatus: VendorStatus;
}

interface RoutingUpdate {
  items: RoutingUpdateItem[];
}

const orderStatusSchema = z.object({
  status: z.enum([
    "pending",
    "new",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]),
});

interface OrderRow {
  id: number;
  customer_name: string;
  email: string;
  phone: string;
  address_json: unknown;
  items_json: unknown;
  subtotal: number | string;
  shipping: number | string;
  total: number | string;
  notes: string | null;
  status: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_status: string;
  created_at: string | Date;
}

function privateHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function serializeOrder(row: OrderRow) {
  const items = storedItemsSchema.parse(decodeJson(row.items_json)) as StoredItem[];
  return {
    id: row.id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    source: "website",
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    address: decodeJson(row.address_json),
    items,
    subtotal: Number(row.subtotal),
    shipping: Number(row.shipping),
    total: Number(row.total),
    status: row.status,
    paymentStatus: row.payment_status,
    notes: row.notes ?? "",
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
  };
}

async function listOrders(env: Env): Promise<ReturnType<typeof serializeOrder>[]> {
  if (!env.DATABASE_URL) throw new SafeProcessingError("database_not_configured");
  const sql = neon(env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, customer_name, email, phone, address_json, items_json,
           subtotal, shipping, total, notes, status, stripe_session_id,
           stripe_payment_intent_id, payment_status, created_at
    FROM orders
    ORDER BY created_at DESC
    LIMIT ${MAX_ADMIN_ORDERS}
  `) as unknown as OrderRow[];
  return rows.map(serializeOrder);
}

async function updateVendorRouting(
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

  let input: RoutingUpdate;
  try {
    const raw = await readBoundedText(request, MAX_ADMIN_BODY_BYTES);
    const parsed = routingUpdateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return json(
        { error: "Invalid vendor routing update" },
        400,
        privateHeaders(),
      );
    }
    input = parsed.data as RoutingUpdate;
  } catch (error) {
    const oversized = safeErrorCode(error) === "payload_too_large";
    return json(
      { error: oversized ? "Request too large" : "Invalid request" },
      oversized ? 413 : 400,
      privateHeaders(),
    );
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const rows = (await sql`
      SELECT items_json
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `) as unknown as Array<{ items_json: unknown }>;
    if (!rows[0]) {
      return json({ error: "Order not found" }, 404, privateHeaders());
    }

    const items = storedItemsSchema.parse(
      decodeJson(rows[0].items_json),
    ) as StoredItem[];
    const updates = new Map(input.items.map((item) => [item.itemId, item]));
    for (const itemId of updates.keys()) {
      if (!items.some((item) => item.id === itemId)) {
        return json(
          { error: "Vendor route references an unknown order item" },
          409,
          privateHeaders(),
        );
      }
    }

    const merged = items.map((item) => {
      const update = updates.get(item.id);
      if (!update) return item;
      if (!update.assignedVendorId && update.vendorStatus !== "unassigned") {
        throw new SafeProcessingError("vendor_required_for_status");
      }
      return {
        ...item,
        assignedVendorId: update.assignedVendorId,
        routeId: update.routeId,
        vendorSku: update.vendorSku,
        vendorUnitCost: update.vendorUnitCost,
        vendorStatus: update.vendorStatus,
      };
    });

    const mergedJson = JSON.stringify(merged);
    const updated = (await sql`
      UPDATE orders
      SET items_json = ${mergedJson}::jsonb,
          status = CASE
            WHEN status IN ('pending', 'new', 'paid') THEN 'processing'
            ELSE status
          END
      WHERE id = ${orderId}
      RETURNING id, status, items_json
    `) as unknown as Array<{
      id: number;
      status: string;
      items_json: unknown;
    }>;
    if (!updated[0]) {
      return json({ error: "Order not found" }, 404, privateHeaders());
    }

    return json(
      {
        id: updated[0].id,
        status: updated[0].status,
        items: storedItemsSchema.parse(
          decodeJson(updated[0].items_json),
        ) as StoredItem[],
      },
      200,
      privateHeaders(),
    );
  } catch (error) {
    console.error(
      `[ADMIN] vendor routing update failed (${safeErrorCode(error)})`,
    );
    const conflict = safeErrorCode(error) === "vendor_required_for_status";
    return json(
      {
        error: conflict
          ? "A vendor is required for this route status"
          : "Unable to update vendor routing",
      },
      conflict ? 409 : 500,
      privateHeaders(),
    );
  }
}

async function updateOrderStatus(
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

  try {
    const raw = await readBoundedText(request, MAX_ADMIN_BODY_BYTES);
    const parsed = orderStatusSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return json({ error: "Invalid order status" }, 400, privateHeaders());
    }

    const sql = neon(env.DATABASE_URL);
    const updated = (await sql`
      UPDATE orders
      SET status = ${parsed.data.status}
      WHERE id = ${orderId}
      RETURNING id, status
    `) as unknown as Array<{ id: number; status: string }>;
    if (!updated[0]) {
      return json({ error: "Order not found" }, 404, privateHeaders());
    }
    return json(updated[0], 200, privateHeaders());
  } catch (error) {
    const oversized = safeErrorCode(error) === "payload_too_large";
    console.error(`[ADMIN] order status update failed (${safeErrorCode(error)})`);
    return json(
      {
        error: oversized
          ? "Request too large"
          : "Unable to update order status",
      },
      oversized ? 413 : 500,
      privateHeaders(),
    );
  }
}

export async function handleAdminRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!(await validateAccess(request, env))) {
    return json({ error: "Unauthorized" }, 401, privateHeaders());
  }

  const { pathname } = new URL(request.url);
  const vendorRouteMatch = pathname.match(
    /^\/api\/admin\/orders\/(\d+)\/vendor-route$/,
  );
  if (vendorRouteMatch) {
    return updateVendorRouting(request, env, Number(vendorRouteMatch[1]));
  }

  const statusMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
  if (statusMatch) {
    return updateOrderStatus(request, env, Number(statusMatch[1]));
  }

  if (request.method !== "GET") {
    return text("Method not allowed", 405, {
      ...privateHeaders(),
      Allow: "GET",
    });
  }

  try {
    const orders = await listOrders(env);

    if (pathname === "/api/admin/vendor-orders") {
      const vendorOrders = orders.flatMap((order) =>
        order.items
          .filter((item) => item.assignedVendorId)
          .map((item) => ({
            orderId: order.id,
            createdAt: order.createdAt,
            customerName: order.customerName,
            email: order.email,
            phone: order.phone,
            address: order.address,
            orderStatus: order.status,
            item,
          })),
      );
      return json({ vendorOrders }, 200, privateHeaders());
    }

    if (pathname === "/api/admin/orders/export") {
      return json(
        {
          exportType: "jbh-private-orders",
          version: 1,
          exportedAt: new Date().toISOString(),
          orders,
        },
        200,
        {
          ...privateHeaders(),
          "Content-Disposition":
            'attachment; filename="jbh-private-orders.json"',
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'",
        },
      );
    }

    if (pathname === "/api/admin/orders") {
      return json({ orders }, 200, privateHeaders());
    }

    return json({ error: "Not found" }, 404, privateHeaders());
  } catch (error) {
    console.error(`[ADMIN] order read failed (${safeErrorCode(error)})`);
    return json({ error: "Unable to read orders" }, 500, privateHeaders());
  }
}

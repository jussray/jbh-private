import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { checkAdmin } from "../_lib/admin";
import { db, schema } from "../_lib/db";
import { storage } from "../_lib/storage";
import {
  getPrivateVendorRoutingState,
  refreshOrderVendorStatus,
  routePaidOrder,
} from "../_lib/vendor-routing";

const positiveId = z.number().int().positive();

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register_vendor"),
    code: z.string().trim().min(2).max(50).regex(/^[a-z0-9][a-z0-9-]*$/),
    displayName: z.string().trim().min(2).max(120),
    fulfillmentEmail: z.string().trim().email().max(254).nullable().optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("map_product"),
    productId: z.string().trim().min(1).max(100),
    variant: z.string().trim().min(1).max(100),
    vendorId: positiveId,
  }),
  z.object({ action: z.literal("route_order"), orderId: positiveId }),
  z.object({
    action: z.literal("approve_group"),
    orderId: positiveId,
    groupId: positiveId,
  }),
  z.object({
    action: z.literal("override_group"),
    orderId: positiveId,
    groupId: positiveId,
    vendorId: positiveId,
  }),
  z.object({
    action: z.literal("queue_dispatch"),
    orderId: positiveId,
    groupId: positiveId,
  }),
  z.object({
    action: z.literal("resolve_exception"),
    orderId: positiveId,
    exceptionId: positiveId,
  }),
]);

function numericQuery(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveException(orderId: number, exceptionId: number) {
  const [resolved] = await db
    .update(schema.vendorRoutingExceptions)
    .set({ resolvedAt: sql`NOW()` })
    .where(
      and(
        eq(schema.vendorRoutingExceptions.id, exceptionId),
        eq(schema.vendorRoutingExceptions.orderId, orderId),
      ),
    )
    .returning();
  return resolved;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await checkAdmin(req, res))) return;

  if (req.method === "GET") {
    const orderId = numericQuery(req.query.orderId);
    try {
      if (!orderId) {
        return res.status(200).json({ vendors: await storage.listVendors() });
      }
      return res.status(200).json(await getPrivateVendorRoutingState(orderId));
    } catch (error) {
      if (error instanceof Error && error.message === "order_not_found") {
        return res.status(404).json({ error: "Order not found" });
      }
      return res.status(500).json({ error: "Unable to load vendor routing" });
    }
  }

  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid vendor routing command" });
  }

  try {
    switch (parsed.data.action) {
      case "register_vendor": {
        const vendor = await storage.upsertVendor({
          code: parsed.data.code,
          displayName: parsed.data.displayName,
          fulfillmentEmail: parsed.data.fulfillmentEmail ?? null,
          active: parsed.data.active,
        });
        return res.status(200).json({ vendor });
      }
      case "map_product": {
        const vendor = await storage.getActiveVendor(parsed.data.vendorId);
        if (!vendor) return res.status(400).json({ error: "Vendor is not active" });
        const mapping = await storage.upsertVendorMapping(parsed.data);
        return res.status(200).json({ mapping });
      }
      case "route_order":
        return res.status(200).json(await routePaidOrder(parsed.data.orderId));
      case "approve_group": {
        const group = await storage.approveFulfillmentGroup(
          parsed.data.orderId,
          parsed.data.groupId,
        );
        if (!group) {
          return res.status(409).json({ error: "Group is not awaiting approval" });
        }
        await refreshOrderVendorStatus(parsed.data.orderId);
        return res.status(200).json(
          await getPrivateVendorRoutingState(parsed.data.orderId),
        );
      }
      case "override_group": {
        const group = await storage.overrideFulfillmentVendor(parsed.data);
        if (!group) {
          return res.status(409).json({ error: "Group cannot be overridden" });
        }
        await refreshOrderVendorStatus(parsed.data.orderId);
        return res.status(200).json(
          await getPrivateVendorRoutingState(parsed.data.orderId),
        );
      }
      case "queue_dispatch": {
        const group = await storage.queueFulfillmentDispatch(
          parsed.data.orderId,
          parsed.data.groupId,
        );
        if (!group) {
          return res.status(409).json({ error: "Group must be approved first" });
        }
        await refreshOrderVendorStatus(parsed.data.orderId);
        return res.status(200).json(
          await getPrivateVendorRoutingState(parsed.data.orderId),
        );
      }
      case "resolve_exception": {
        const exception = await resolveException(
          parsed.data.orderId,
          parsed.data.exceptionId,
        );
        if (!exception) return res.status(404).json({ error: "Exception not found" });
        await refreshOrderVendorStatus(parsed.data.orderId);
        return res.status(200).json(
          await getPrivateVendorRoutingState(parsed.data.orderId),
        );
      }
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    if (["order_not_found", "order_not_paid"].includes(code)) {
      return res.status(409).json({ error: code });
    }
    if (["vendor_not_active", "vendor_group_conflict"].includes(code)) {
      return res.status(409).json({ error: code });
    }
    return res.status(500).json({ error: "Vendor routing command failed" });
  }
}

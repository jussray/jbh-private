import { z } from "zod";
import { storage, type ActiveVendorMapping } from "./storage";

const routingItemSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    variant: z.string().trim().min(1).max(100),
    qty: z.number().int().min(1).max(100),
  })
  .passthrough();

const routingItemsSchema = z.array(routingItemSchema).min(1).max(100);

type RoutingItem = z.infer<typeof routingItemSchema>;

type RoutingGroup = {
  vendorId: number;
  items: RoutingItem[];
};

export type VendorRoutingPlan = {
  groups: RoutingGroup[];
  missing: Array<{ productId: string; variant: string }>;
};

function mappingKey(productId: string, variant: string): string {
  return `${productId}\u0000${variant}`;
}

export function buildVendorRoutingPlan(
  itemsJson: unknown,
  mappings: ActiveVendorMapping[],
): VendorRoutingPlan {
  const items = routingItemsSchema.parse(itemsJson);
  const mappingByItem = new Map<string, ActiveVendorMapping>();

  for (const mapping of mappings) {
    const key = mappingKey(mapping.productId, mapping.variant);
    if (mappingByItem.has(key)) {
      throw new Error("duplicate_active_vendor_mapping");
    }
    mappingByItem.set(key, mapping);
  }

  const grouped = new Map<number, RoutingItem[]>();
  const missing = new Map<string, { productId: string; variant: string }>();

  for (const item of items) {
    const mapping = mappingByItem.get(mappingKey(item.id, item.variant));
    if (!mapping) {
      missing.set(mappingKey(item.id, item.variant), {
        productId: item.id,
        variant: item.variant,
      });
      continue;
    }

    const vendorItems = grouped.get(mapping.vendorId) ?? [];
    vendorItems.push(item);
    grouped.set(mapping.vendorId, vendorItems);
  }

  return {
    groups: [...grouped.entries()]
      .sort(([left], [right]) => left - right)
      .map(([vendorId, vendorItems]) => ({
        vendorId,
        items: vendorItems,
      })),
    missing: [...missing.values()].sort((left, right) =>
      `${left.productId}\u0000${left.variant}`.localeCompare(
        `${right.productId}\u0000${right.variant}`,
      ),
    ),
  };
}

export async function getPrivateVendorRoutingState(orderId: number) {
  const order = await storage.getOrder(orderId);
  if (!order) throw new Error("order_not_found");

  const [groups, exceptions, dispatchJobs] = await Promise.all([
    storage.listFulfillmentGroups(orderId),
    storage.listRoutingExceptions(orderId),
    storage.listDispatchJobs(orderId),
  ]);

  return {
    order: {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
    },
    groups,
    exceptions,
    dispatchJobs,
  };
}

export async function refreshOrderVendorStatus(orderId: number): Promise<void> {
  const order = await storage.getOrder(orderId);
  if (!order) throw new Error("order_not_found");
  if (["cancelled", "delivered"].includes(order.status)) return;

  const [groups, exceptions] = await Promise.all([
    storage.listFulfillmentGroups(orderId),
    storage.listRoutingExceptions(orderId),
  ]);
  const unresolved = exceptions.some((entry) => !entry.resolvedAt);

  let status = "vendor_review";
  if (unresolved || groups.length === 0) {
    status = "needs_vendor_review";
  } else if (groups.every((group) => group.status === "queued_for_dispatch")) {
    status = "fulfillment_queued";
  } else if (
    groups.every((group) =>
      ["approved", "queued_for_dispatch"].includes(group.status),
    )
  ) {
    status = "ready_to_dispatch";
  }

  if (order.status !== status) {
    await storage.updateOrderStatus(orderId, status);
  }
}

export async function routePaidOrder(orderId: number) {
  const order = await storage.getOrder(orderId);
  if (!order) throw new Error("order_not_found");
  if (order.paymentStatus !== "paid") throw new Error("order_not_paid");
  if (["cancelled", "delivered"].includes(order.status)) {
    return getPrivateVendorRoutingState(orderId);
  }

  const mappings = await storage.listActiveVendorMappings();
  const plan = buildVendorRoutingPlan(order.itemsJson, mappings);
  const existingGroups = await storage.listFulfillmentGroups(orderId);
  const plannedVendorIds = new Set(plan.groups.map((group) => group.vendorId));

  for (const existing of existingGroups) {
    if (!plannedVendorIds.has(existing.vendorId)) {
      await storage.createRoutingException({
        orderId,
        productId: "__order__",
        variant: "__routing__",
        reason: "routing_plan_changed_after_group_creation",
      });
    }
  }

  for (const group of plan.groups) {
    await storage.createFulfillmentGroup({
      orderId,
      vendorId: group.vendorId,
      itemsJson: group.items,
    });
    for (const item of group.items) {
      await storage.resolveRoutingException({
        orderId,
        productId: item.id,
        variant: item.variant,
      });
    }
  }

  for (const missing of plan.missing) {
    await storage.createRoutingException({
      orderId,
      productId: missing.productId,
      variant: missing.variant,
      reason: "vendor_mapping_missing",
    });
  }

  await refreshOrderVendorStatus(orderId);
  return getPrivateVendorRoutingState(orderId);
}

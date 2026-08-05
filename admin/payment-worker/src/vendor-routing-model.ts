export type VendorStatus =
  | "unassigned"
  | "ready"
  | "ordered"
  | "confirmed"
  | "shipped";

export interface RoutableOrderItem {
  id: string;
  lineItemId?: string;
  variant: string;
  assignedVendorId: string;
  routeId: string;
  vendorSku: string;
  vendorUnitCost: number;
  vendorStatus: VendorStatus;
}

export interface VendorRoutingPatch {
  itemId: string;
  assignedVendorId: string;
  routeId: string;
  vendorSku: string;
  vendorUnitCost: number;
  vendorStatus: VendorStatus;
}

export class VendorRoutingModelError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "VendorRoutingModelError";
  }
}

function fallbackLineItemId(orderId: number, index: number): string {
  return `order:${orderId}:line:${index + 1}`;
}

export function normalizeOrderLineItems<T extends RoutableOrderItem>(
  orderId: number,
  items: T[],
): Array<T & { lineItemId: string }> {
  const used = new Set<string>();

  return items.map((item, index) => {
    let lineItemId = item.lineItemId?.trim() || fallbackLineItemId(orderId, index);
    if (used.has(lineItemId)) {
      lineItemId = fallbackLineItemId(orderId, index);
    }
    if (used.has(lineItemId)) {
      throw new VendorRoutingModelError("duplicate_line_item_identity");
    }
    used.add(lineItemId);
    return { ...item, lineItemId };
  });
}

export function applyVendorRoutingUpdates<T extends RoutableOrderItem>(
  orderId: number,
  items: T[],
  updates: VendorRoutingPatch[],
): Array<T & { lineItemId: string }> {
  const normalized = normalizeOrderLineItems(orderId, items);
  const updatesByLine = new Map<string, VendorRoutingPatch>();

  for (const update of updates) {
    if (updatesByLine.has(update.itemId)) {
      throw new VendorRoutingModelError("duplicate_routing_update");
    }
    updatesByLine.set(update.itemId, update);
  }

  for (const lineItemId of updatesByLine.keys()) {
    if (!normalized.some((item) => item.lineItemId === lineItemId)) {
      throw new VendorRoutingModelError("unknown_order_line");
    }
  }

  return normalized.map((item) => {
    const update = updatesByLine.get(item.lineItemId);
    if (!update) return item;
    if (!update.assignedVendorId && update.vendorStatus !== "unassigned") {
      throw new VendorRoutingModelError("vendor_required_for_status");
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
}

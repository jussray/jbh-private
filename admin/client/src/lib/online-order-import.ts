import { z } from "zod";
import {
  routeOrder,
  type LocalOrder,
  type OwnerVault,
} from "./private-admin-vault";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ORDERS = 5_000;

const text = (max: number) => z.string().trim().max(max);

const onlineOrderSchema = z.object({
  id: text(100).min(1),
  createdAt: text(50),
  source: z.literal("website"),
  customerName: text(500).min(1),
  email: text(320),
  phone: text(100),
  address: z.object({
    street: text(500),
    city: text(500),
    state: text(30),
    zip: text(20),
  }),
  items: z
    .array(
      z.object({
        id: text(100).min(1),
        name: text(500).min(1),
        variant: text(500),
        price: z.number().finite().min(0).max(1_000_000),
        qty: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
  shipping: z.number().finite().min(0).max(1_000_000),
  status: z.literal("paid"),
});

const exportSchema = z.object({
  exportType: z.literal("jbh-online-orders-export"),
  version: z.literal(1),
  exportedAt: text(50),
  orders: z.array(onlineOrderSchema).max(MAX_ORDERS),
});

function safeIso(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

export function importOnlineOrders(
  raw: string,
  byteLength: number,
  vault: OwnerVault,
): { vault: OwnerVault; added: number; skipped: number } {
  if (byteLength > MAX_IMPORT_BYTES) {
    throw new Error("Import blocked: file exceeds the 2 MB online-order limit.");
  }

  const parsed = exportSchema.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) {
    throw new Error("The selected file is not a valid JBH online-order export.");
  }

  const existingIds = new Set(vault.orders.map((order) => order.id));
  const imported: LocalOrder[] = [];
  let skipped = 0;

  for (const source of parsed.data.orders) {
    if (existingIds.has(source.id)) {
      skipped += 1;
      continue;
    }

    const items = source.items.map((item) => ({
      ...item,
      assignedVendorId: "",
      routeId: "",
      vendorSku: "",
      vendorUnitCost: 0,
      vendorStatus: "unassigned" as const,
    }));
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const order: LocalOrder = {
      id: source.id,
      createdAt: safeIso(source.createdAt),
      source: "website",
      customerName: source.customerName,
      email: source.email,
      phone: source.phone,
      address: source.address,
      items,
      subtotal,
      shipping: source.shipping,
      total: subtotal + source.shipping,
      status: "paid",
      notes: "",
      paymentLink: "",
    };

    imported.push(routeOrder(order, vault.routes, vault.vendors));
    existingIds.add(source.id);
  }

  return {
    vault: { ...vault, orders: [...imported, ...vault.orders] },
    added: imported.length,
    skipped,
  };
}

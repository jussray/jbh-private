import { z } from "zod";
import {
  routeOrder,
  type LocalOrder,
  type OwnerVault,
} from "./private-admin-vault";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ORDERS = 5_000;
const MAX_MONEY = 1_000_000;

const text = (max: number) => z.string().trim().max(max);
const money = z.number().finite().min(0).max(MAX_MONEY);

const onlineOrderSchema = z.object({
  id: z
    .string()
    .regex(
      /^WEB-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  createdAt: z.string().datetime({ offset: true }),
  source: z.literal("website"),
  customerName: text(500).min(1),
  email: z.string().trim().email().max(320),
  phone: text(100),
  address: z.object({
    street: text(500).min(1),
    city: text(500).min(1),
    state: text(30).min(1),
    zip: text(20).min(1),
  }),
  items: z
    .array(
      z.object({
        id: text(100).min(1),
        name: text(500).min(1),
        variant: text(500),
        price: money,
        qty: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
  subtotal: money,
  shipping: money,
  total: money,
  status: z.literal("paid"),
});

const exportSchema = z.object({
  exportType: z.literal("jbh-online-orders-export"),
  version: z.literal(1),
  exportedAt: z.string().datetime({ offset: true }),
  orders: z.array(onlineOrderSchema).max(MAX_ORDERS),
});

function toCents(value: number): number {
  return Math.round(value * 100);
}

export function importOnlineOrders(
  raw: string,
  byteLength: number,
  vault: OwnerVault,
): { vault: OwnerVault; added: number; skipped: number } {
  if (byteLength > MAX_IMPORT_BYTES) {
    throw new Error("Import blocked: file exceeds the 2 MB online-order limit.");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  const parsed = exportSchema.safeParse(decoded);
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

    const itemSubtotalCents = source.items.reduce(
      (sum, item) => sum + toCents(item.price) * item.qty,
      0,
    );
    const declaredSubtotalCents = toCents(source.subtotal);
    const shippingCents = toCents(source.shipping);
    const declaredTotalCents = toCents(source.total);
    if (
      itemSubtotalCents !== declaredSubtotalCents ||
      declaredTotalCents !== declaredSubtotalCents + shippingCents
    ) {
      throw new Error(
        `Import blocked: order ${source.id} does not match the paid ledger totals.`,
      );
    }

    const items = source.items.map((item) => ({
      ...item,
      price: toCents(item.price) / 100,
      assignedVendorId: "",
      routeId: "",
      vendorSku: "",
      vendorUnitCost: 0,
      vendorStatus: "unassigned" as const,
    }));
    const order: LocalOrder = {
      id: source.id,
      createdAt: new Date(source.createdAt).toISOString(),
      source: "website",
      customerName: source.customerName,
      email: source.email,
      phone: source.phone,
      address: source.address,
      items,
      subtotal: declaredSubtotalCents / 100,
      shipping: shippingCents / 100,
      total: declaredTotalCents / 100,
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

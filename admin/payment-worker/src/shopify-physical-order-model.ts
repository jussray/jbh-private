import { z } from "zod";

export const SHOPIFY_PAID_TOPIC = "orders/paid";
export const HAIR_MATCH_SKU = "JBH-MATCH-25";

export class ShopifyPhysicalOrderModelError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ShopifyPhysicalOrderModelError";
  }
}

type CatalogEntry = {
  productCode: string;
  variant: string;
  unitPriceCents: number;
};

export const PHYSICAL_CATALOG_BY_SKU: Record<string, CatalogEntry> = {
  "JBH-BW-14": { productCode: "bundle-bodywave", variant: '14"', unitPriceCents: 7500 },
  "JBH-BW-16": { productCode: "bundle-bodywave", variant: '16"', unitPriceCents: 8500 },
  "JBH-BW-18": { productCode: "bundle-bodywave", variant: '18"', unitPriceCents: 9000 },
  "JBH-BW-20": { productCode: "bundle-bodywave", variant: '20"', unitPriceCents: 10000 },
  "JBH-BW-22": { productCode: "bundle-bodywave", variant: '22"', unitPriceCents: 11000 },
  "JBH-BW-24": { productCode: "bundle-bodywave", variant: '24"', unitPriceCents: 12500 },
  "JBH-BW-26": { productCode: "bundle-bodywave", variant: '26"', unitPriceCents: 14000 },
  "JBH-BS-14": { productCode: "bundle-bonestraight", variant: '14"', unitPriceCents: 7500 },
  "JBH-BS-18": { productCode: "bundle-bonestraight", variant: '18"', unitPriceCents: 9000 },
  "JBH-BS-22": { productCode: "bundle-bonestraight", variant: '22"', unitPriceCents: 11000 },
  "JBH-BS-26": { productCode: "bundle-bonestraight", variant: '26"', unitPriceCents: 14000 },
  "JBH-DW-14": { productCode: "bundle-deepwave", variant: '14"', unitPriceCents: 8000 },
  "JBH-DW-18": { productCode: "bundle-deepwave", variant: '18"', unitPriceCents: 9500 },
  "JBH-DW-22": { productCode: "bundle-deepwave", variant: '22"', unitPriceCents: 11500 },
  "JBH-DW-26": { productCode: "bundle-deepwave", variant: '26"', unitPriceCents: 14500 },
  "JBH-LW-14": { productCode: "bundle-loosewave", variant: '14"', unitPriceCents: 8000 },
  "JBH-LW-18": { productCode: "bundle-loosewave", variant: '18"', unitPriceCents: 9500 },
  "JBH-LW-22": { productCode: "bundle-loosewave", variant: '22"', unitPriceCents: 11500 },
  "JBH-LW-26": { productCode: "bundle-loosewave", variant: '26"', unitPriceCents: 14500 },
  "JBH-KS-14": { productCode: "bundle-kinkystraight", variant: '14"', unitPriceCents: 8500 },
  "JBH-KS-18": { productCode: "bundle-kinkystraight", variant: '18"', unitPriceCents: 10000 },
  "JBH-KS-22": { productCode: "bundle-kinkystraight", variant: '22"', unitPriceCents: 12000 },
  "JBH-KS-26": { productCode: "bundle-kinkystraight", variant: '26"', unitPriceCents: 15500 },
  "JBH-RI-14": { productCode: "bundle-royal-indian", variant: '14"', unitPriceCents: 11000 },
  "JBH-RI-18": { productCode: "bundle-royal-indian", variant: '18"', unitPriceCents: 13500 },
  "JBH-RI-22": { productCode: "bundle-royal-indian", variant: '22"', unitPriceCents: 16000 },
  "JBH-RI-26": { productCode: "bundle-royal-indian", variant: '26"', unitPriceCents: 19500 },
  "JBH-C44-16": { productCode: "closure-4x4", variant: '16"', unitPriceCents: 6500 },
  "JBH-C55-16": { productCode: "closure-5x5", variant: '16"', unitPriceCents: 8500 },
  "JBH-F134-18": { productCode: "frontal-13x4", variant: '18"', unitPriceCents: 12500 },
  "JBH-WG-BW-18": { productCode: "wig-glueless-bodywave", variant: '18"', unitPriceCents: 16500 },
  "JBH-WG-ST-22": { productCode: "wig-13x4-straight", variant: '22"', unitPriceCents: 21500 },
  "JBH-WG-UP-DW-20": { productCode: "wig-upart-deepwave", variant: '20"', unitPriceCents: 14500 },
  "JBH-WG-BOB-10": { productCode: "wig-13x6-bob", variant: '10" bob', unitPriceCents: 13500 },
  "JBH-EDGE-4OZ": { productCode: "edge-control", variant: "4 oz", unitPriceCents: 1000 },
  "JBH-LACE-2OZ": { productCode: "lace-melt-spray", variant: "2 oz", unitPriceCents: 1500 },
  "JBH-OIL-2OZ": { productCode: "hair-oil", variant: "2 oz", unitPriceCents: 1800 },

  // Supplier-connected Shopify SKUs are aliases only. They preserve provider
  // identity while normalizing paid orders back to JBH product codes. The
  // prices below are non-authorizing continuity references to the live Shopify
  // catalog observed on 2026-09-19. Signed Shopify paid-order line prices are
  // the payment truth; these references must never reject an already-paid order.
  "BRAZ-SEW-BW-10": { productCode: "bundle-bodywave", variant: '10"', unitPriceCents: 6000 },
  "BRAZ-SEW-BW-12": { productCode: "bundle-bodywave", variant: '12"', unitPriceCents: 7000 },
  "BRAZ-SEW-BW-14": { productCode: "bundle-bodywave", variant: '14"', unitPriceCents: 7500 },
  "BRAZ-SEW-BW-16": { productCode: "bundle-bodywave", variant: '16"', unitPriceCents: 8500 },
  "BRAZ-SEW-BW-18": { productCode: "bundle-bodywave", variant: '18"', unitPriceCents: 9000 },
  "BRAZ-SEW-BW-20": { productCode: "bundle-bodywave", variant: '20"', unitPriceCents: 10500 },
  "BRAZ-SEW-BW-22": { productCode: "bundle-bodywave", variant: '22"', unitPriceCents: 11500 },
  "BRAZ-SEW-BW-24": { productCode: "bundle-bodywave", variant: '24"', unitPriceCents: 12500 },
  "BRAZ-SEW-BW-26": { productCode: "bundle-bodywave", variant: '26"', unitPriceCents: 14500 },
  "BRAZ-SEW-BW-28": { productCode: "bundle-bodywave", variant: '28"', unitPriceCents: 15000 },
  "BRAZ-SEW-BW-30": { productCode: "bundle-bodywave", variant: '30"', unitPriceCents: 17000 },
  "BRAZ-SEW-BW-32": { productCode: "bundle-bodywave", variant: '32"', unitPriceCents: 18000 },
  "BRAZ-SEW-DW-10": { productCode: "bundle-deepwave", variant: '10"', unitPriceCents: 6500 },
  "BRAZ-SEW-DW-12": { productCode: "bundle-deepwave", variant: '12"', unitPriceCents: 7000 },
  "BRAZ-SEW-DW-14": { productCode: "bundle-deepwave", variant: '14"', unitPriceCents: 8000 },
  "BRAZ-SEW-DW-16": { productCode: "bundle-deepwave", variant: '16"', unitPriceCents: 8500 },
  "BRAZ-SEW-DW-18": { productCode: "bundle-deepwave", variant: '18"', unitPriceCents: 9500 },
  "BRAZ-SEW-DW-20": { productCode: "bundle-deepwave", variant: '20"', unitPriceCents: 11000 },
  "BRAZ-SEW-DW-22": { productCode: "bundle-deepwave", variant: '22"', unitPriceCents: 11500 },
  "BRAZ-SEW-DW-24": { productCode: "bundle-deepwave", variant: '24"', unitPriceCents: 12500 },
  "BRAZ-SEW-DW-26": { productCode: "bundle-deepwave", variant: '26"', unitPriceCents: 14500 },
  "BRAZ-SEW-DW-28": { productCode: "bundle-deepwave", variant: '28"', unitPriceCents: 15500 },
  "BRAZ-SEW-DW-30": { productCode: "bundle-deepwave", variant: '30"', unitPriceCents: 17000 },
  "BRAZ-SEW-DW-32": { productCode: "bundle-deepwave", variant: '32"', unitPriceCents: 18500 },
  "BRAZ-SEW-LW-10": { productCode: "bundle-loosewave", variant: '10"', unitPriceCents: 6500 },
  "BRAZ-SEW-LW-12": { productCode: "bundle-loosewave", variant: '12"', unitPriceCents: 7000 },
  "BRAZ-SEW-LW-14": { productCode: "bundle-loosewave", variant: '14"', unitPriceCents: 8000 },
  "BRAZ-SEW-LW-16": { productCode: "bundle-loosewave", variant: '16"', unitPriceCents: 8500 },
  "BRAZ-SEW-LW-18": { productCode: "bundle-loosewave", variant: '18"', unitPriceCents: 9500 },
  "BRAZ-SEW-LW-20": { productCode: "bundle-loosewave", variant: '20"', unitPriceCents: 11000 },
  "BRAZ-SEW-LW-22": { productCode: "bundle-loosewave", variant: '22"', unitPriceCents: 11500 },
  "BRAZ-SEW-LW-24": { productCode: "bundle-loosewave", variant: '24"', unitPriceCents: 12500 },
  "BRAZ-SEW-LW-26": { productCode: "bundle-loosewave", variant: '26"', unitPriceCents: 14500 },
  "BRAZ-SEW-LW-28": { productCode: "bundle-loosewave", variant: '28"', unitPriceCents: 15500 },
  "BRAZ-SEW-LW-30": { productCode: "bundle-loosewave", variant: '30"', unitPriceCents: 17000 },
  "BRAZ-SEW-LW-32": { productCode: "bundle-loosewave", variant: '32"', unitPriceCents: 18500 },
  "BRAZ-SEW-KS-14": { productCode: "bundle-kinkystraight", variant: '14"', unitPriceCents: 8500 },
  "BRAZ-SEW-KS-16": { productCode: "bundle-kinkystraight", variant: '16"', unitPriceCents: 9500 },
  "BRAZ-SEW-KS-18": { productCode: "bundle-kinkystraight", variant: '18"', unitPriceCents: 10500 },
  "BRAZ-SEW-KS-20": { productCode: "bundle-kinkystraight", variant: '20"', unitPriceCents: 11000 },
  "BRAZ-SEW-KS-22": { productCode: "bundle-kinkystraight", variant: '22"', unitPriceCents: 12000 },
  "BRAZ-SEW-KS-24": { productCode: "bundle-kinkystraight", variant: '24"', unitPriceCents: 14000 },
  "BRAZ-SEW-KS-26": { productCode: "bundle-kinkystraight", variant: '26"', unitPriceCents: 15500 },
  "BRAZ-SEW-KS-28": { productCode: "bundle-kinkystraight", variant: '28"', unitPriceCents: 16500 },
};

// Fresh Shopify fulfillment-location proof on 2026-09-25 showed that Dropship
// Beauty currently owns 158 active JBH supplier SKUs. Keep this allowlist exact
// and finite: unknown SKU families and out-of-range variants still fail closed.
function addSupplierLengthAliases(
  prefix: string,
  productCode: string,
  lengths: readonly number[],
): void {
  for (const length of lengths) {
    const sku = `${prefix}-${length}`;
    if (PHYSICAL_CATALOG_BY_SKU[sku]) continue;
    PHYSICAL_CATALOG_BY_SKU[sku] = {
      productCode,
      variant: `${length}\"`,
      unitPriceCents: 0,
    };
  }
}

function addSupplierDealAliases(
  prefix: string,
  productCode: string,
  starts: readonly number[],
): void {
  for (const start of starts) {
    const middle = start + 2;
    const end = start + 4;
    const sku = `${prefix}-${start}-${middle}-${end}`;
    if (PHYSICAL_CATALOG_BY_SKU[sku]) continue;
    PHYSICAL_CATALOG_BY_SKU[sku] = {
      productCode,
      variant: `${start}\"/${middle}\"/${end}\"`,
      unitPriceCents: 0,
    };
  }
}

const EVEN_LENGTHS_10_32 = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32] as const;
const EVEN_LENGTHS_12_30 = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30] as const;
const EVEN_LENGTHS_12_26 = [12, 14, 16, 18, 20, 22, 24, 26] as const;
const KINKY_STRAIGHT_LENGTHS = [14, 16, 18, 20, 22, 24, 26, 28] as const;
const AFRO_KINKY_LENGTHS = [12, 14, 16, 18, 20, 22] as const;
const DEAL_STARTS_10_28 = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28] as const;

addSupplierLengthAliases("BRAZ-SEW-BW", "bundle-bodywave", EVEN_LENGTHS_10_32);
addSupplierLengthAliases("BRAZ-SEW-DW", "bundle-deepwave", EVEN_LENGTHS_10_32);
addSupplierLengthAliases("BRAZ-SEW-LW", "bundle-loosewave", EVEN_LENGTHS_10_32);
addSupplierLengthAliases("BRAZ-SEW-ST", "bundle-straight", EVEN_LENGTHS_10_32);
addSupplierLengthAliases("BRAZ-SEW-KS", "bundle-kinkystraight", KINKY_STRAIGHT_LENGTHS);
addSupplierLengthAliases("BRAZ-SEW-KC", "bundle-kinkycurly", EVEN_LENGTHS_10_32);
addSupplierLengthAliases("BRAZ-SEW-AK", "bundle-afrokinky", AFRO_KINKY_LENGTHS);
addSupplierLengthAliases("BRAZ-SEW-SW", "bundle-spanishwave", EVEN_LENGTHS_12_30);
addSupplierLengthAliases("613-BRAZ-SEW-BW", "bundle-blonde-bodywave", EVEN_LENGTHS_12_26);

addSupplierDealAliases("BRAZ-SEW-BW", "bundle-deal-bodywave", DEAL_STARTS_10_28);
addSupplierDealAliases("BRAZ-SEW-DW", "bundle-deal-deepwave", DEAL_STARTS_10_28);
addSupplierDealAliases("BRAZ-SEW-LW", "bundle-deal-loosewave", DEAL_STARTS_10_28);
addSupplierDealAliases("BRAZ-SEW-ST", "bundle-deal-straight", DEAL_STARTS_10_28);
addSupplierDealAliases("BRAZ-SEW-AK", "bundle-deal-afrokinky", [12, 14, 16]);

addSupplierLengthAliases("BRAZ-TRANS-CLO-DW", "closure-deepwave-4x4-transparent", [12, 14, 16, 18]);
addSupplierLengthAliases("BRAZ-TRANS-CLO-ST", "closure-straight-4x4-transparent", [12, 14, 16, 18]);
addSupplierLengthAliases("BRAZ-TRANS-CLO-LW", "closure-loosewave-4x4-transparent", [14, 16, 18]);
addSupplierLengthAliases("BRAZ-TRANS-CLO-BW", "closure-bodywave-4x4-transparent", [12, 14, 16, 18]);
addSupplierLengthAliases("BRAZ-TRANS-FRO-ST", "frontal-straight-13x4-transparent", [14, 16, 18, 20]);
addSupplierLengthAliases("BRAZ-TRANS-FRO-LW", "frontal-loosewave-13x4-transparent", [14, 16, 18, 20]);

const moneyString = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const identifier = z.union([
  z.number().int().positive().transform(String),
  z.string().trim().regex(/^\d+$/),
]);

const shippingAddressSchema = z
  .object({
    name: z.string().trim().max(160).nullable().optional(),
    first_name: z.string().trim().max(100).nullable().optional(),
    last_name: z.string().trim().max(100).nullable().optional(),
    company: z.string().trim().max(160).nullable().optional(),
    address1: z.string().trim().min(1).max(200),
    address2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(1).max(120),
    province: z.string().trim().max(120).nullable().optional(),
    province_code: z.string().trim().max(20).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    country_code: z.string().trim().min(2).max(3),
    zip: z.string().trim().min(3).max(24),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .passthrough();

const shopifyOrderSchema = z
  .object({
    id: identifier,
    admin_graphql_api_id: z.string().trim().max(160).optional(),
    name: z.string().trim().max(80).nullable().optional(),
    currency: z.string().trim().length(3),
    financial_status: z.string().trim().max(40),
    email: z.string().trim().email().max(254).nullable().optional(),
    contact_email: z.string().trim().email().max(254).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    customer: z
      .object({
        email: z.string().trim().email().max(254).nullable().optional(),
        first_name: z.string().trim().max(100).nullable().optional(),
        last_name: z.string().trim().max(100).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    shipping_address: shippingAddressSchema.nullable().optional(),
    subtotal_price: moneyString.optional(),
    current_subtotal_price: moneyString.optional(),
    total_price: moneyString.optional(),
    current_total_price: moneyString.optional(),
    line_items: z
      .array(
        z
          .object({
            id: identifier,
            product_id: identifier.nullable().optional(),
            variant_id: identifier.nullable().optional(),
            title: z.string().trim().min(1).max(240),
            variant_title: z.string().trim().max(160).nullable().optional(),
            sku: z.string().trim().max(120).nullable().optional(),
            quantity: z.number().int().min(1).max(20),
            price: moneyString,
          })
          .passthrough(),
      )
      .min(1)
      .max(40),
  })
  .passthrough();

export interface NormalizedPaidPhysicalOrder {
  shopifyOrderId: string;
  shopifyOrderGid: string | null;
  orderName: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  shippingAddressJson: string;
  itemsJson: string;
  subtotalCents: number;
  totalCents: number;
  currency: "USD";
}

export type NormalizedShopifyPaidResult =
  | { kind: "physical"; order: NormalizedPaidPhysicalOrder }
  | { kind: "ignored_service"; shopifyOrderId: string };

function cents(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new ShopifyPhysicalOrderModelError("invalid_money");
  }
  return Math.round(amount * 100);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value);
  return btoa(binary);
}

export async function verifyShopifyWebhookHmac(
  rawBody: string,
  provided: string,
  secret: string,
): Promise<boolean> {
  if (!provided || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return constantTimeEqual(provided, base64(digest));
}

export function normalizedShopDomain(value: string): string | null {
  const domain = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) return null;
  return domain;
}

export function normalizePaidShopifyPhysicalOrder(
  payload: unknown,
): NormalizedShopifyPaidResult {
  const parsed = shopifyOrderSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ShopifyPhysicalOrderModelError("invalid_shopify_order");
  }
  const order = parsed.data;

  if (order.currency.toUpperCase() !== "USD") {
    throw new ShopifyPhysicalOrderModelError("unsupported_currency");
  }
  if (order.financial_status !== "paid") {
    throw new ShopifyPhysicalOrderModelError("order_not_paid");
  }

  const skus = order.line_items.map((line) => line.sku?.trim() ?? "");
  const serviceLines = skus.filter((sku) => sku === HAIR_MATCH_SKU).length;
  if (serviceLines === order.line_items.length) {
    return { kind: "ignored_service", shopifyOrderId: order.id };
  }
  if (serviceLines > 0) {
    throw new ShopifyPhysicalOrderModelError("mixed_service_and_physical_cart");
  }

  if (!order.shipping_address) {
    throw new ShopifyPhysicalOrderModelError("missing_shipping_address");
  }

  const normalizedItems = order.line_items.map((line) => {
    const sku = line.sku?.trim() ?? "";
    const catalog = PHYSICAL_CATALOG_BY_SKU[sku];
    if (!catalog) {
      throw new ShopifyPhysicalOrderModelError("unsupported_physical_sku");
    }
    const linePriceCents = cents(line.price);
    return {
      lineItemId: line.id,
      productId: line.product_id ?? null,
      variantId: line.variant_id ?? null,
      sku,
      productCode: catalog.productCode,
      canonicalVariant: catalog.variant,
      title: line.title,
      variantTitle: line.variant_title ?? null,
      quantity: line.quantity,
      unitPriceCents: linePriceCents,
      procurementStatus: "procurement_needed",
    };
  });

  const subtotalValue = order.current_subtotal_price ?? order.subtotal_price;
  const totalValue = order.current_total_price ?? order.total_price;
  if (!subtotalValue || !totalValue) {
    throw new ShopifyPhysicalOrderModelError("missing_shopify_totals");
  }
  const subtotalCents = cents(subtotalValue);
  const totalCents = cents(totalValue);
  const providerGrossCents = normalizedItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  if (subtotalCents < 0 || subtotalCents > providerGrossCents) {
    throw new ShopifyPhysicalOrderModelError("shopify_subtotal_mismatch");
  }
  if (totalCents < 1 || totalCents < subtotalCents) {
    throw new ShopifyPhysicalOrderModelError("shopify_total_mismatch");
  }

  const customerEmail = (
    order.email ?? order.contact_email ?? order.customer?.email ?? ""
  )
    .trim()
    .toLowerCase() || null;

  const address = order.shipping_address;
  const customerName =
    address.name?.trim() ||
    [address.first_name, address.last_name]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ") ||
    [order.customer?.first_name, order.customer?.last_name]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ") ||
    null;
  const customerPhone = (
    order.phone ?? order.customer?.phone ?? address.phone ?? ""
  ).trim() || null;

  if (!customerEmail && !customerPhone) {
    throw new ShopifyPhysicalOrderModelError("missing_customer_contact");
  }

  return {
    kind: "physical",
    order: {
      shopifyOrderId: order.id,
      shopifyOrderGid: order.admin_graphql_api_id ?? null,
      orderName: order.name?.trim() || null,
      customerEmail,
      customerName,
      customerPhone,
      shippingAddressJson: JSON.stringify({
        name: customerName,
        company: address.company ?? null,
        address1: address.address1,
        address2: address.address2 ?? null,
        city: address.city,
        province: address.province ?? null,
        provinceCode: address.province_code ?? null,
        country: address.country ?? null,
        countryCode: address.country_code.toUpperCase(),
        zip: address.zip,
        phone: address.phone ?? null,
      }),
      itemsJson: JSON.stringify(normalizedItems),
      subtotalCents,
      totalCents,
      currency: "USD",
    },
  };
}

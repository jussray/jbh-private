import { z } from "zod";

export const SHOPIFY_PAID_TOPIC = "orders/paid";
export const HAIR_MATCH_VARIANT_ID = "50196622344435";
export const HAIR_MATCH_SUBTOTAL_CENTS = 2500;
export const HAIR_MATCH_SERVICE_CODE = "jbh-hair-match-v1";

export class ShopifyOrderModelError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ShopifyOrderModelError";
  }
}

const moneyString = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const identifier = z.union([
  z.number().int().positive().transform(String),
  z.string().trim().regex(/^\d+$/),
]);

const addressSchema = z
  .object({
    name: z.string().trim().max(160).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const shopifyOrderSchema = z
  .object({
    id: identifier,
    admin_graphql_api_id: z.string().trim().max(160).optional(),
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
    billing_address: addressSchema,
    shipping_address: addressSchema,
    subtotal_price: moneyString.optional(),
    current_subtotal_price: moneyString.optional(),
    total_price: moneyString.optional(),
    current_total_price: moneyString.optional(),
    note_attributes: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            value: z.string().trim().min(1).max(120),
          })
          .passthrough(),
      )
      .max(20)
      .optional(),
    line_items: z
      .array(
        z
          .object({
            id: identifier,
            product_id: identifier.nullable().optional(),
            variant_id: identifier.nullable(),
            title: z.string().trim().min(1).max(240),
            variant_title: z.string().trim().max(160).nullable().optional(),
            sku: z.string().trim().max(120).nullable().optional(),
            quantity: z.number().int().min(1).max(10),
            price: moneyString,
          })
          .passthrough(),
      )
      .min(1)
      .max(20),
  })
  .passthrough();

export interface NormalizedPaidService {
  shopifyOrderId: string;
  shopifyOrderGid: string | null;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  itemsJson: string;
  subtotal: number;
  total: number;
  currency: "USD";
}

interface HairMatchPreferences {
  hairGoal: string;
  preferredLength: string;
  budget: string;
  maintenance: string;
}

const allowedPreferences = {
  hair_goal: new Set(["not-sure", "wig", "bundles", "closure-frontal"]),
  preferred_length: new Set([
    "not-sure",
    "short-10-14",
    "medium-16-20",
    "long-22-plus",
  ]),
  budget: new Set(["not-sure", "under-150", "150-250", "250-plus"]),
  maintenance: new Set(["not-sure", "low-maintenance", "flexible"]),
};

const requiredAttributeNames = new Set([
  "source",
  "offer",
  ...Object.keys(allowedPreferences),
]);

function cents(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new ShopifyOrderModelError("invalid_money");
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

function normalizePreferences(
  noteAttributes: Array<{ name: string; value: string }> | undefined,
): HairMatchPreferences {
  const attributes = new Map<string, string>();
  for (const { name, value } of noteAttributes ?? []) {
    if (requiredAttributeNames.has(name) && attributes.has(name)) {
      throw new ShopifyOrderModelError(`duplicate_${name}`);
    }
    attributes.set(name, value);
  }

  if (
    attributes.get("source") !== "jussbeautifulhair.com" ||
    attributes.get("offer") !== HAIR_MATCH_SERVICE_CODE
  ) {
    throw new ShopifyOrderModelError("hair_match_origin_mismatch");
  }

  for (const [key, allowed] of Object.entries(allowedPreferences)) {
    const value = attributes.get(key);
    if (!value || !allowed.has(value)) {
      throw new ShopifyOrderModelError(`invalid_${key}`);
    }
  }

  return {
    hairGoal: attributes.get("hair_goal") as string,
    preferredLength: attributes.get("preferred_length") as string,
    budget: attributes.get("budget") as string,
    maintenance: attributes.get("maintenance") as string,
  };
}

export function normalizePaidHairMatchOrder(payload: unknown): NormalizedPaidService {
  const parsed = shopifyOrderSchema.safeParse(payload);
  if (!parsed.success) throw new ShopifyOrderModelError("invalid_shopify_order");
  const order = parsed.data;

  if (order.currency.toUpperCase() !== "USD") {
    throw new ShopifyOrderModelError("unsupported_currency");
  }
  if (order.financial_status !== "paid") {
    throw new ShopifyOrderModelError("order_not_paid");
  }
  if (order.line_items.length !== 1) {
    throw new ShopifyOrderModelError("unexpected_line_item_count");
  }

  const line = order.line_items[0];
  if (line.variant_id !== HAIR_MATCH_VARIANT_ID) {
    throw new ShopifyOrderModelError("unexpected_shopify_variant");
  }
  if (line.quantity !== 1 || cents(line.price) !== HAIR_MATCH_SUBTOTAL_CENTS) {
    throw new ShopifyOrderModelError("hair_match_price_or_quantity_mismatch");
  }

  const subtotalValue = order.current_subtotal_price ?? order.subtotal_price;
  const totalValue = order.current_total_price ?? order.total_price;
  if (!subtotalValue || !totalValue) {
    throw new ShopifyOrderModelError("missing_shopify_totals");
  }

  const subtotalCents = cents(subtotalValue);
  const totalCents = cents(totalValue);
  if (
    subtotalCents !== HAIR_MATCH_SUBTOTAL_CENTS ||
    totalCents < subtotalCents ||
    totalCents > subtotalCents + HAIR_MATCH_SUBTOTAL_CENTS
  ) {
    throw new ShopifyOrderModelError("shopify_total_mismatch");
  }

  const preferences = normalizePreferences(order.note_attributes);
  const email = (
    order.email ??
    order.contact_email ??
    order.customer?.email ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!email) throw new ShopifyOrderModelError("missing_customer_email");

  const addressName =
    order.billing_address?.name ?? order.shipping_address?.name ?? null;
  const customerName =
    addressName?.trim() ||
    [order.customer?.first_name, order.customer?.last_name]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ") ||
    null;
  const customerPhone = (
    order.phone ??
    order.customer?.phone ??
    order.billing_address?.phone ??
    order.shipping_address?.phone ??
    ""
  ).trim() || null;

  return {
    shopifyOrderId: order.id,
    shopifyOrderGid: order.admin_graphql_api_id ?? null,
    customerEmail: email,
    customerName,
    customerPhone,
    itemsJson: JSON.stringify([
      {
        lineItemId: line.id,
        variantId: HAIR_MATCH_VARIANT_ID,
        serviceCode: HAIR_MATCH_SERVICE_CODE,
        title: line.title,
        variantTitle: line.variant_title ?? null,
        sku: line.sku ?? null,
        quantity: 1,
        unitPrice: 25,
        consultationPreferences: preferences,
        vendorRoutingStatus: "not_applicable",
      },
    ]),
    subtotal: subtotalCents / 100,
    total: totalCents / 100,
    currency: "USD",
  };
}

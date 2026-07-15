export type OrderStatus =
  | "new"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type VendorOrderStatus =
  | "unassigned"
  | "ready"
  | "ordered"
  | "confirmed"
  | "shipped";

export type OrderSource = "instagram" | "whatsapp" | "email" | "website" | "other";

export type VendorOrderMethod =
  | "portal"
  | "email"
  | "whatsapp"
  | "wechat"
  | "phone"
  | "other";

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface OrderItem {
  id: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
  assignedVendorId: string;
  routeId: string;
  vendorSku: string;
  vendorUnitCost: number;
  vendorStatus: VendorOrderStatus;
}

export interface LocalOrder {
  id: string;
  createdAt: string;
  source: OrderSource;
  customerName: string;
  email: string;
  phone: string;
  address: Address;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  notes: string;
  paymentLink: string;
}

export interface Vendor {
  id: string;
  name: string;
  active: boolean;
  orderMethod: VendorOrderMethod;
  orderDestination: string;
  defaultLeadDays: number;
  defaultShippingCost: number;
  needsPhone: boolean;
  needsEmail: boolean;
  qualityScore: number;
  reliabilityScore: number;
  communicationScore: number;
  notes: string;
  updatedAt: string;
}

export interface ProductRoute {
  id: string;
  productPattern: string;
  variantPattern: string;
  vendorId: string;
  vendorSku: string;
  unitCost: number;
  priority: number;
  active: boolean;
  lastVerifiedAt: string;
}

export interface OwnerVault {
  version: 2;
  orders: LocalOrder[];
  vendors: Vendor[];
  routes: ProductRoute[];
}

export interface VendorGroup {
  key: string;
  vendor: Vendor | null;
  items: OrderItem[];
}

export interface RouteSuggestion {
  route: ProductRoute;
  vendor: Vendor;
  score: number;
}

const VAULT_KEY = "jbh.owner.vault.v2";
const LEGACY_ORDERS_KEY = "jbh.orders.v1";
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 500;
const MAX_NOTE = 5000;
const MAX_RECORDS = 5000;

const EMPTY_VAULT: OwnerVault = {
  version: 2,
  orders: [],
  vendors: [],
  routes: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNumber(value: unknown, fallback = 0, min = 0, max = 1_000_000): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanInteger(value: unknown, fallback = 0, min = 0, max = 100_000): number {
  return Math.round(cleanNumber(value, fallback, min, max));
}

function cleanBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cleanIso(value: unknown, fallback = new Date().toISOString()): string {
  const text = cleanText(value, 50);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function cleanDateOnly(value: unknown): string {
  const text = cleanText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function newPrivateId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function newOrderId(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `JBH-${stamp}${rand}`;
}

export function emptyOrderItem(): OrderItem {
  return {
    id: newPrivateId("item"),
    name: "",
    variant: "",
    price: 0,
    qty: 1,
    assignedVendorId: "",
    routeId: "",
    vendorSku: "",
    vendorUnitCost: 0,
    vendorStatus: "unassigned",
  };
}

export function emptyVendor(): Vendor {
  return {
    id: newPrivateId("vendor"),
    name: "",
    active: true,
    orderMethod: "portal",
    orderDestination: "",
    defaultLeadDays: 7,
    defaultShippingCost: 0,
    needsPhone: false,
    needsEmail: false,
    qualityScore: 3,
    reliabilityScore: 3,
    communicationScore: 3,
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

export function emptyRoute(vendorId = ""): ProductRoute {
  return {
    id: newPrivateId("route"),
    productPattern: "",
    variantPattern: "",
    vendorId,
    vendorSku: "",
    unitCost: 0,
    priority: 50,
    active: true,
    lastVerifiedAt: new Date().toISOString().slice(0, 10),
  };
}

function sanitizeAddress(value: unknown): Address {
  const record = isRecord(value) ? value : {};
  return {
    street: cleanText(record.street),
    city: cleanText(record.city),
    state: cleanText(record.state, 30),
    zip: cleanText(record.zip, 20),
  };
}

function sanitizeOrderItem(value: unknown): OrderItem | null {
  if (!isRecord(value)) return null;
  const name = cleanText(value.name);
  if (!name) return null;
  return {
    id: cleanText(value.id, 100) || newPrivateId("item"),
    name,
    variant: cleanText(value.variant),
    price: cleanNumber(value.price),
    qty: cleanInteger(value.qty, 1, 1, 999),
    assignedVendorId: cleanText(value.assignedVendorId, 100),
    routeId: cleanText(value.routeId, 100),
    vendorSku: cleanText(value.vendorSku),
    vendorUnitCost: cleanNumber(value.vendorUnitCost),
    vendorStatus: enumValue(
      value.vendorStatus,
      ["unassigned", "ready", "ordered", "confirmed", "shipped"] as const,
      cleanText(value.assignedVendorId, 100) ? "ready" : "unassigned",
    ),
  };
}

function sanitizeOrder(value: unknown): LocalOrder | null {
  if (!isRecord(value)) return null;
  const customerName = cleanText(value.customerName);
  const rawItems = Array.isArray(value.items) ? value.items.slice(0, 100) : [];
  const items = rawItems.map(sanitizeOrderItem).filter((item): item is OrderItem => item !== null);
  if (!customerName || items.length === 0) return null;

  const shipping = cleanNumber(value.shipping);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return {
    id: cleanText(value.id, 100) || newOrderId(),
    createdAt: cleanIso(value.createdAt),
    source: enumValue(
      value.source,
      ["instagram", "whatsapp", "email", "website", "other"] as const,
      "other",
    ),
    customerName,
    email: cleanText(value.email, 320),
    phone: cleanText(value.phone, 100),
    address: sanitizeAddress(value.address),
    items,
    subtotal,
    shipping,
    total: subtotal + shipping,
    status: enumValue(
      value.status,
      ["new", "paid", "processing", "shipped", "delivered", "cancelled"] as const,
      "new",
    ),
    notes: cleanText(value.notes, MAX_NOTE),
    paymentLink: cleanText(value.paymentLink, 2000),
  };
}

function sanitizeVendor(value: unknown): Vendor | null {
  if (!isRecord(value)) return null;
  const name = cleanText(value.name);
  if (!name) return null;
  return {
    id: cleanText(value.id, 100) || newPrivateId("vendor"),
    name,
    active: cleanBoolean(value.active, true),
    orderMethod: enumValue(
      value.orderMethod,
      ["portal", "email", "whatsapp", "wechat", "phone", "other"] as const,
      "other",
    ),
    orderDestination: cleanText(value.orderDestination, 2000),
    defaultLeadDays: cleanInteger(value.defaultLeadDays, 7, 0, 365),
    defaultShippingCost: cleanNumber(value.defaultShippingCost),
    needsPhone: cleanBoolean(value.needsPhone, false),
    needsEmail: cleanBoolean(value.needsEmail, false),
    qualityScore: cleanInteger(value.qualityScore, 3, 1, 5),
    reliabilityScore: cleanInteger(value.reliabilityScore, 3, 1, 5),
    communicationScore: cleanInteger(value.communicationScore, 3, 1, 5),
    notes: cleanText(value.notes, MAX_NOTE),
    updatedAt: cleanIso(value.updatedAt),
  };
}

function sanitizeRoute(value: unknown): ProductRoute | null {
  if (!isRecord(value)) return null;
  const productPattern = cleanText(value.productPattern);
  const vendorId = cleanText(value.vendorId, 100);
  if (!productPattern || !vendorId) return null;
  return {
    id: cleanText(value.id, 100) || newPrivateId("route"),
    productPattern,
    variantPattern: cleanText(value.variantPattern),
    vendorId,
    vendorSku: cleanText(value.vendorSku),
    unitCost: cleanNumber(value.unitCost),
    priority: cleanInteger(value.priority, 50, 0, 100),
    active: cleanBoolean(value.active, true),
    lastVerifiedAt: cleanDateOnly(value.lastVerifiedAt),
  };
}

function sanitizeVault(value: unknown): OwnerVault {
  if (!isRecord(value) || value.version !== 2) {
    throw new Error("The selected file is not a supported JBH owner vault.");
  }
  const rawOrders = Array.isArray(value.orders) ? value.orders.slice(0, MAX_RECORDS) : [];
  const rawVendors = Array.isArray(value.vendors) ? value.vendors.slice(0, MAX_RECORDS) : [];
  const rawRoutes = Array.isArray(value.routes) ? value.routes.slice(0, MAX_RECORDS) : [];
  const vendors = rawVendors.map(sanitizeVendor).filter((vendor): vendor is Vendor => vendor !== null);
  const validVendorIds = new Set(vendors.map((vendor) => vendor.id));
  const routes = rawRoutes
    .map(sanitizeRoute)
    .filter((route): route is ProductRoute => route !== null && validVendorIds.has(route.vendorId));
  const orders = rawOrders.map(sanitizeOrder).filter((order): order is LocalOrder => order !== null);

  return { version: 2, orders, vendors, routes };
}

function migrateLegacyOrders(raw: string): OwnerVault {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return { ...EMPTY_VAULT };
  const orders = parsed.map(sanitizeOrder).filter((order): order is LocalOrder => order !== null);
  return { version: 2, orders, vendors: [], routes: [] };
}

export function loadOwnerVault(): OwnerVault {
  try {
    const current = localStorage.getItem(VAULT_KEY);
    if (current) return sanitizeVault(JSON.parse(current) as unknown);

    const legacy = localStorage.getItem(LEGACY_ORDERS_KEY);
    if (legacy) {
      const migrated = migrateLegacyOrders(legacy);
      saveOwnerVault(migrated);
      return migrated;
    }
  } catch {
    return { ...EMPTY_VAULT };
  }
  return { ...EMPTY_VAULT };
}

export function saveOwnerVault(vault: OwnerVault): void {
  localStorage.setItem(VAULT_KEY, JSON.stringify(sanitizeVault(vault)));
}

export function serializeOwnerVault(vault: OwnerVault): string {
  return JSON.stringify(
    {
      ...sanitizeVault(vault),
      exportedAt: new Date().toISOString(),
      exportType: "jbh-private-owner-vault",
    },
    null,
    2,
  );
}

export function parseOwnerVaultImport(text: string, byteLength: number): OwnerVault {
  if (byteLength > MAX_IMPORT_BYTES) {
    throw new Error("Import blocked: file exceeds the 2 MB owner-vault limit.");
  }
  const parsed = JSON.parse(text) as unknown;
  return sanitizeVault(parsed);
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function vendorScore(vendor: Vendor): number {
  return (vendor.qualityScore + vendor.reliabilityScore + vendor.communicationScore) / 3;
}

export function suggestRoute(
  item: Pick<OrderItem, "name" | "variant">,
  routes: ProductRoute[],
  vendors: Vendor[],
): RouteSuggestion | null {
  const product = normalized(item.name);
  const variant = normalized(item.variant);
  if (!product) return null;

  const vendorById = new Map(vendors.filter((vendor) => vendor.active).map((vendor) => [vendor.id, vendor]));
  const matches: RouteSuggestion[] = [];

  for (const route of routes) {
    if (!route.active) continue;
    const vendor = vendorById.get(route.vendorId);
    if (!vendor) continue;
    const productPattern = normalized(route.productPattern);
    const variantPattern = normalized(route.variantPattern);
    if (!productPattern || !product.includes(productPattern)) continue;
    if (variantPattern && !variant.includes(variantPattern)) continue;

    const productExact = product === productPattern ? 400 : 0;
    const variantExact = variantPattern && variant === variantPattern ? 200 : 0;
    const specificity = productPattern.length + variantPattern.length;
    const score = route.priority * 1000 + productExact + variantExact + specificity + vendorScore(vendor);
    matches.push({ route, vendor, score });
  }

  return matches.sort((a, b) => b.score - a.score)[0] ?? null;
}

export function routeOrder(order: LocalOrder, routes: ProductRoute[], vendors: Vendor[]): LocalOrder {
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const routeById = new Map(routes.map((route) => [route.id, route]));

  const items = order.items.map((item) => {
    const manualVendor = item.assignedVendorId ? vendorById.get(item.assignedVendorId) : null;
    if (manualVendor?.active) {
      const selectedRoute = item.routeId ? routeById.get(item.routeId) : null;
      const sameVendorRoute =
        selectedRoute?.vendorId === manualVendor.id
          ? selectedRoute
          : routes.find((route) => {
              if (!route.active || route.vendorId !== manualVendor.id) return false;
              const suggestion = suggestRoute(item, [route], [manualVendor]);
              return suggestion !== null;
            });
      return {
        ...item,
        routeId: sameVendorRoute?.id ?? "",
        vendorSku: sameVendorRoute?.vendorSku ?? item.vendorSku,
        vendorUnitCost: item.vendorUnitCost || sameVendorRoute?.unitCost || 0,
        vendorStatus: item.vendorStatus === "unassigned" ? "ready" : item.vendorStatus,
      };
    }

    const suggestion = suggestRoute(item, routes, vendors);
    if (!suggestion) {
      return {
        ...item,
        assignedVendorId: "",
        routeId: "",
        vendorSku: "",
        vendorUnitCost: 0,
        vendorStatus: "unassigned" as const,
      };
    }

    return {
      ...item,
      assignedVendorId: suggestion.vendor.id,
      routeId: suggestion.route.id,
      vendorSku: suggestion.route.vendorSku,
      vendorUnitCost: item.vendorUnitCost || suggestion.route.unitCost,
      vendorStatus: item.vendorStatus === "unassigned" ? "ready" : item.vendorStatus,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return { ...order, items, subtotal, total: subtotal + order.shipping };
}

export function groupOrderByVendor(order: LocalOrder, vendors: Vendor[]): VendorGroup[] {
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const groups = new Map<string, OrderItem[]>();
  for (const item of order.items) {
    const key = item.assignedVendorId || "unassigned";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    vendor: key === "unassigned" ? null : vendorById.get(key) ?? null,
    items,
  }));
}

export function routeLabel(order: LocalOrder, vendors: Vendor[]): string {
  const groups = groupOrderByVendor(order, vendors);
  const assigned = groups.filter((group) => group.vendor !== null);
  const unassigned = groups.some((group) => group.vendor === null);
  if (unassigned && assigned.length === 0) return "Vendor needed";
  if (unassigned) return `Split: ${assigned.length} vendor${assigned.length === 1 ? "" : "s"} + unassigned`;
  if (assigned.length === 1) return `Order from ${assigned[0].vendor!.name}`;
  return `Split across ${assigned.length} vendors`;
}

export function buildVendorHandoff(
  order: LocalOrder,
  vendor: Vendor,
  items: OrderItem[],
): string {
  const phoneLine = vendor.needsPhone && order.phone ? `\nPhone: ${order.phone}` : "";
  const emailLine = vendor.needsEmail && order.email ? `\nEmail: ${order.email}` : "";
  const itemLines = items
    .map((item) => {
      const sku = item.vendorSku ? ` | Vendor SKU: ${item.vendorSku}` : "";
      const variant = item.variant ? ` | ${item.variant}` : "";
      return `- ${item.qty}x ${item.name}${variant}${sku}`;
    })
    .join("\n");

  return `JBH fulfillment request ${order.id}\n\nShip to:\n${order.customerName}\n${order.address.street}\n${order.address.city}, ${order.address.state} ${order.address.zip}${phoneLine}${emailLine}\n\nItems:\n${itemLines}\n\nSend tracking after shipment.`;
}

export function estimatedVendorCost(order: LocalOrder, vendors: Vendor[]): number {
  const usedVendors = new Set<string>();
  let cost = 0;
  for (const item of order.items) {
    cost += item.vendorUnitCost * item.qty;
    if (item.assignedVendorId) usedVendors.add(item.assignedVendorId);
  }
  for (const vendorId of usedVendors) {
    const vendor = vendors.find((candidate) => candidate.id === vendorId);
    if (vendor) cost += vendor.defaultShippingCost;
  }
  return cost;
}

export function isRouteStale(route: ProductRoute, days = 90): boolean {
  if (!route.lastVerifiedAt) return true;
  const checked = Date.parse(`${route.lastVerifiedAt}T00:00:00Z`);
  if (!Number.isFinite(checked)) return true;
  return Date.now() - checked > days * 24 * 60 * 60 * 1000;
}

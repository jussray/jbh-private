// Owner-only vendor adapter planner. No transport, credentials, payment or dispatch.
// The JussPay paid-order ledger is authoritative; caller-supplied evidence is not.
export type VendorAdapterCode = "dropship-beauty" | "faire" | "dsers" | "manual-procurement";
type VendorKind = "dropship-app" | "wholesale-stock" | "channel-csv" | "owner-stock";
type VendorAdapter = Readonly<{
  kind: VendorKind;
  handoff: string;
  saleRule: string;
  requirements: readonly string[];
}>;
export const VENDOR_ADAPTERS: Readonly<Record<VendorAdapterCode, VendorAdapter>> = Object.freeze({
  "dropship-beauty": Object.freeze({
    kind: "dropship-app",
    handoff: "shopify-app-owner",
    saleRule: "verified-supplier-inventory-and-exact-app-order-handoff",
    requirements: ["exact_supplier_sku", "fresh_supplier_inventory", "working_shopify_app_handoff", "owner_supplier_receipt"],
  }),
  faire: Object.freeze({
    kind: "wholesale-stock",
    handoff: "owner-inventory",
    saleRule: "physically-received-and-reserved-stock-only-no-customer-dropshipping",
    requirements: ["wholesale_purchase_receipt", "stock_received", "inventory_reservation", "owner_shipping"],
  }),
  dsers: Object.freeze({
    kind: "channel-csv",
    handoff: "owner-approved-channel-or-csv",
    saleRule: "mapped-channel-and-owner-authorized-supplier-handoff",
    requirements: ["connected_channel_or_supported_csv", "exact_supplier_sku", "working_order_handoff", "owner_supplier_receipt"],
  }),
  "manual-procurement": Object.freeze({
    kind: "owner-stock",
    handoff: "owner-inventory-or-approved-quote",
    saleRule: "owner-accepted-quote-and-received-reserved-stock",
    requirements: ["accepted_supplier_quote", "stock_received", "inventory_reservation", "owner_shipping"],
  }),
});

export interface VendorReviewLine {
  sku: string;
  quantity: number;
}
export interface VendorReviewInput {
  orderId: string;
  vendors: Record<string, VendorReviewLine[]>;
}
export class VendorAdapterError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "VendorAdapterError";
  }
}
const SKU = /^[A-Z0-9][A-Z0-9-]{1,63}$/;
const VENDOR = /^[a-z0-9][a-z0-9-]{1,39}$/;
const ORDER = /^jbho_[0-9a-f]{8}-[0-9a-f-]{27}$/;

export function vendorAdapterManifest() {
  return Object.fromEntries(Object.entries(VENDOR_ADAPTERS).map(([code, adapter]) => [
    code, {
      kind: adapter.kind,
      handoff: adapter.handoff,
      saleRule: adapter.saleRule,
      requirements: [...adapter.requirements],
      directSupplierOrderingEnabled: false,
    },
  ]));
}

// A deterministic PRIVATE planning projection. Deliberately no `ready_to_sell`
// or `dispatched` result: a submitted orderId does not prove payment or stock.
export function planVendorReview(input: VendorReviewInput) {
  if (!input || typeof input !== "object" || !ORDER.test(input.orderId) ||
      !input.vendors || typeof input.vendors !== "object" ||
      Array.isArray(input.vendors)) throw new VendorAdapterError("invalid_vendor_review");
  const groups = Object.entries(input.vendors);
  if (groups.length < 1 || groups.length > 20) throw new VendorAdapterError("invalid_vendor_review");
  let totalLines = 0;
  const plans = groups.map(([code, lines]) => {
    if (!VENDOR.test(code) || !Array.isArray(lines) || !lines.length || lines.length > 25) {
      throw new VendorAdapterError("invalid_vendor_review");
    }
    const seen = new Set<string>();
    for (const line of lines) {
      if (!line || typeof line.sku !== "string" || !SKU.test(line.sku) ||
          !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100 ||
          seen.has(line.sku)) throw new VendorAdapterError("invalid_vendor_review");
      seen.add(line.sku);
      totalLines++;
    }
    const adapter = VENDOR_ADAPTERS[code as VendorAdapterCode];
    return {
      vendor: code,
      kind: adapter?.kind ?? "unverified",
      handoff: adapter?.handoff ?? "quarantine-owner-review",
      status: adapter ? "awaiting_owner_evidence" : "unsupported_vendor_quarantined",
      autoDispatch: false,
      directSupplierOrderingEnabled: false,
      saleRule: adapter?.saleRule ?? "no-sale-until-vendor-verified",
      requirements: adapter ? [...adapter.requirements] : ["supplier_identity", "exact_sku_mapping", "owner_approval"],
      items: lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    };
  });
  if (totalLines > 100) throw new VendorAdapterError("invalid_vendor_review");
  return {orderId: input.orderId, authority: "review-only-not-a-payment-receipt",
    hasVerifiedPayment: false, directSupplierOrderingEnabled: false, groups: plans};
}

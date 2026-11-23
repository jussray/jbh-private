// Private, read-only supplier quote resolution. Browser-supplied offers cannot
// become price, payment, or supplier-dispatch authority.
import { neon } from "@neondatabase/serverless";
import type { Env } from "./shared";
import {
  SupplierSelectionError, selectBestSupplierForVariant,
  type PrivateVendorIntent, type SupplierSelectionInput, type SupplierOffer,
} from "./supplier-selection-model";

type SelectionRequest = Omit<SupplierSelectionInput, "offers">;
const FIELDS = "maxDeliveryDays,minMarginCents,productId,quantity,retailUnitCents,shipToCountry,variant";

function safeIso(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

export async function previewStoredSupplierSelection(
  requestInput: unknown, env: Env, privateIntent: PrivateVendorIntent, now = Date.now(),
) {
  if (!requestInput || typeof requestInput !== "object" || Array.isArray(requestInput) ||
      Object.keys(requestInput).sort().join(",") !== FIELDS) {
    throw new SupplierSelectionError("invalid_supplier_selection");
  }
  const input = requestInput as SelectionRequest;
  selectBestSupplierForVariant({...input, offers: []}, privateIntent, now);
  if (!env.DATABASE_URL) throw new SupplierSelectionError("supplier_quote_database_unavailable");
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT v.code AS vendor_code, o.product_id, o.variant, o.supplier_sku, o.quote_ref,
           o.currency, o.unit_cost_cents, o.shipping_cents, o.duties_cents,
           o.supplier_tax_cents, o.available_units, o.stock_verified_at,
           o.quote_expires_at, o.estimated_delivery_days, o.ship_to_country,
           o.supplier_account_verified, o.commercial_terms_accepted,
           o.direct_ship_verified, o.order_handoff_verified, o.dispatch_authority
    FROM vendor_variant_offers o
    JOIN vendors v ON v.id = o.vendor_id AND v.active = TRUE
    JOIN vendor_connection_states connection ON connection.vendor_id = v.id
      AND connection.state = 'dispatch_active'
      AND connection.dispatch_authority = TRUE AND connection.verified_at IS NOT NULL
    JOIN vendor_dispatch_bindings binding ON binding.vendor_id = v.id
      AND binding.orchestrator_code = o.orchestrator_code
      AND binding.supplier_platform = o.supplier_platform
      AND binding.state = 'dispatch_active'
      AND binding.dispatch_authority = TRUE AND binding.verified_at IS NOT NULL
    WHERE o.product_id = ${input.productId} AND o.variant = ${input.variant}
      AND o.dispatch_authority = TRUE AND o.verified_at IS NOT NULL
      AND jsonb_typeof(o.evidence_json) = 'array'
      AND jsonb_array_length(o.evidence_json) > 0
      AND o.quote_expires_at > NOW()
      AND o.stock_verified_at >= NOW() - INTERVAL '1 hour'
    ORDER BY v.code, o.supplier_sku LIMIT 100
  `;
  const offers: SupplierOffer[] = rows.map(row => ({
    vendorCode: String(row.vendor_code ?? ""),
    productId: String(row.product_id ?? ""),
    variant: String(row.variant ?? ""),
    supplierSku: String(row.supplier_sku ?? ""),
    quoteRef: String(row.quote_ref ?? ""),
    currency: row.currency === "USD" ? "USD" : ("" as "USD"),
    unitCostCents: Number(row.unit_cost_cents),
    shippingCents: Number(row.shipping_cents),
    dutiesCents: Number(row.duties_cents),
    supplierTaxCents: Number(row.supplier_tax_cents),
    availableUnits: Number(row.available_units),
    stockVerifiedAt: safeIso(row.stock_verified_at),
    quoteExpiresAt: safeIso(row.quote_expires_at),
    estimatedDeliveryDays: Number(row.estimated_delivery_days),
    shipToCountry: row.ship_to_country === "US" ? "US" : ("" as "US"),
    supplierAccountVerified: row.supplier_account_verified === true,
    commercialTermsAccepted: row.commercial_terms_accepted === true,
    directToCustomerShippingVerified: row.direct_ship_verified === true,
    orderHandoffVerified: row.order_handoff_verified === true,
    dispatchAuthority: row.dispatch_authority === true,
    evidenceRef: String(row.quote_ref ?? ""),
  }));
  const preview = selectBestSupplierForVariant({...input, offers}, privateIntent, now);
  return {...preview, proofState: "private_database_quote_not_stock_reservation"};
}

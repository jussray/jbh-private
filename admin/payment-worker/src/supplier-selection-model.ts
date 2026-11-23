// PRIVATE JBH owner preview. Never a customer checkout, payment, or supplier-dispatch authority.
export class SupplierSelectionError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'SupplierSelectionError'; }
}

export type SupplierOffer = {
  vendorCode: string;
  productId: string;
  variant: string;
  supplierSku: string;
  quoteRef: string;
  currency: 'USD';
  unitCostCents: number;
  shippingCents: number;
  dutiesCents: number;
  supplierTaxCents: number;
  availableUnits: number;
  stockVerifiedAt: string;
  quoteExpiresAt: string;
  estimatedDeliveryDays: number;
  shipToCountry: 'US';
  supplierAccountVerified: boolean;
  commercialTermsAccepted: boolean;
  directToCustomerShippingVerified: boolean;
  orderHandoffVerified: boolean;
  dispatchAuthority: boolean;
  evidenceRef: string;
};

export type SupplierSelectionInput = {
  productId: string;
  variant: string;
  quantity: number;
  retailUnitCents: number;
  minMarginCents: number;
  maxDeliveryDays: number;
  shipToCountry: 'US';
  offers: SupplierOffer[];
};

export type PrivateVendorIntent = {
  vendors: Array<{
    code: string;
    productAssignments: Array<{ productId: string; role: string }>;
  }>;
};

const PRODUCT = /^[a-z0-9][a-z0-9-]{0,99}$/;
const VARIANT = /^[^\r\n\x00<>]{1,80}$/;
const VENDOR = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SUPPLIER_SKU = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,79}$/;
const EVIDENCE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{7,179}$/;
const ROLE_PRIORITY: Record<string, number> = {
  primary: 0, secondary: 1, backup: 2, 'premium-backup': 3,
  'manual-sourcing-candidate': 4,
};
const MAX_STOCK_AGE_MS = 60 * 60 * 1000;

function safeMoney(x: unknown, zeroOkay = true): x is number {
  return Number.isSafeInteger(x) && Number(x) >= (zeroOkay ? 0 : 1) && Number(x) <= 100_000_000;
}
function time(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return NaN;
  return Date.parse(value);
}
function validateRequest(input: SupplierSelectionInput): void {
  if (!input || typeof input !== 'object' || !PRODUCT.test(input.productId) ||
      !VARIANT.test(input.variant) || !Number.isSafeInteger(input.quantity) ||
      input.quantity < 1 || input.quantity > 10 ||
      !safeMoney(input.retailUnitCents, false) || !safeMoney(input.minMarginCents) ||
      !Number.isSafeInteger(input.maxDeliveryDays) || input.maxDeliveryDays < 1 ||
      input.maxDeliveryDays > 30 || input.shipToCountry !== 'US' ||
      !Array.isArray(input.offers) || input.offers.length > 100) {
    throw new SupplierSelectionError('invalid_supplier_selection');
  }
}

export function selectBestSupplierForVariant(
  input: SupplierSelectionInput,
  privateIntent: PrivateVendorIntent,
  now = Date.now(),
) {
  validateRequest(input);
  if (!Number.isFinite(now) || !privateIntent || !Array.isArray(privateIntent.vendors)) {
    throw new SupplierSelectionError('invalid_private_vendor_intent');
  }
  const shortlist = new Map<string, string>();
  for (const vendor of privateIntent.vendors) {
    if (!VENDOR.test(vendor.code) || !Array.isArray(vendor.productAssignments)) {
      throw new SupplierSelectionError('invalid_private_vendor_intent');
    }
    const role = vendor.productAssignments.find(p => p.productId === input.productId)?.role;
    if (role && ROLE_PRIORITY[role] !== undefined) shortlist.set(vendor.code, role);
  }
  const seen = new Set<string>();
  const eligible: Array<SupplierOffer & {landedCents: number; marginCents: number; role: string}> = [];
  for (const quote of input.offers) {
    if (!quote || typeof quote !== 'object' || !VENDOR.test(quote.vendorCode || '') ||
        typeof quote.supplierSku !== 'string' || !SUPPLIER_SKU.test(quote.supplierSku) ||
        typeof quote.quoteRef !== 'string' || !EVIDENCE.test(quote.quoteRef)) {
      throw new SupplierSelectionError('invalid_supplier_offer');
    }
    const key = quote.vendorCode + '\u0000' + quote.supplierSku + '\u0000' + quote.productId + '\u0000' + quote.variant;
    if (seen.has(key)) throw new SupplierSelectionError('duplicate_supplier_offer');
    seen.add(key);
    const role = shortlist.get(quote.vendorCode);
    if (!role || role === 'manual-sourcing-candidate' || quote.productId !== input.productId ||
        quote.variant !== input.variant || quote.currency !== 'USD' ||
        quote.shipToCountry !== input.shipToCountry ||
        !safeMoney(quote.unitCostCents, false) || !safeMoney(quote.shippingCents) ||
        !safeMoney(quote.dutiesCents) || !safeMoney(quote.supplierTaxCents) ||
        !Number.isSafeInteger(quote.availableUnits) || quote.availableUnits < input.quantity ||
        !Number.isSafeInteger(quote.estimatedDeliveryDays) ||
        quote.estimatedDeliveryDays < 1 || quote.estimatedDeliveryDays > input.maxDeliveryDays ||
        quote.supplierAccountVerified !== true || quote.commercialTermsAccepted !== true ||
        quote.directToCustomerShippingVerified !== true || quote.orderHandoffVerified !== true ||
        quote.dispatchAuthority !== true || typeof quote.evidenceRef !== 'string' ||
        !EVIDENCE.test(quote.evidenceRef)) continue;
    const stockTime = time(quote.stockVerifiedAt);
    const expiration = time(quote.quoteExpiresAt);
    if (!Number.isFinite(stockTime) || stockTime > now || now - stockTime > MAX_STOCK_AGE_MS ||
        !Number.isFinite(expiration) || expiration <= now) continue;
    const landedCents = quote.unitCostCents * input.quantity + quote.shippingCents +
      quote.dutiesCents + quote.supplierTaxCents;
    const marginCents = input.retailUnitCents * input.quantity - landedCents;
    if (!Number.isSafeInteger(landedCents) || marginCents < input.minMarginCents) continue;
    eligible.push({...quote, landedCents, marginCents, role});
  }
  eligible.sort((a,b) => a.landedCents - b.landedCents ||
    a.estimatedDeliveryDays - b.estimatedDeliveryDays ||
    ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role] ||
    a.vendorCode.localeCompare(b.vendorCode) || a.supplierSku.localeCompare(b.supplierSku));
  const chosen = eligible[0];
  const common = {
    mode: 'private_owner_preview',
    proofState: 'unverified_owner_supplied_offer_data',
    customerChargeAllowed: false,
    supplierDispatchAllowed: false,
    hasVerifiedPayment: false,
    supplierPaymentInitiated: false,
    customerShippingDataShared: false,
    eligibleOfferCount: eligible.length,
  };
  if (!chosen) return {...common, status: 'supplier_review_required' as const,
    selected: null, purchaseOrderDraft: null};
  return {...common, status: 'candidate_selected_for_review' as const,
    selected: {
      vendorCode: chosen.vendorCode, role: chosen.role, supplierSku: chosen.supplierSku,
      quoteRef: chosen.quoteRef, productId: input.productId, variant: input.variant,
      quantity: input.quantity, landedCents: chosen.landedCents,
      estimatedMarginCents: chosen.marginCents, estimatedDeliveryDays: chosen.estimatedDeliveryDays,
    },
    purchaseOrderDraft: {
      type: 'supplier_purchase_order_draft', status: 'not_sent',
      vendorCode: chosen.vendorCode, supplierSku: chosen.supplierSku,
      productId: input.productId, variant: input.variant, quantity: input.quantity,
      unitCostCents: chosen.unitCostCents, shippingCents: chosen.shippingCents,
      dutiesCents: chosen.dutiesCents, supplierTaxCents: chosen.supplierTaxCents,
      totalPayableCents: chosen.landedCents, currency: 'USD',
      sourcePaidOrderId: null, shipToAddress: null,
      vendorInvoiceStatus: 'not_requested',
      authorizationRequired: ['server_verified_paid_order','supplier_offer_evidence','owner_supplier_spend_authority'],
    },
  };
}

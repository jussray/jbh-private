// automation/messenger/payment-policy.mjs
// Exported from jussray/Sekret-Bip@1d494ec8e6d1d20950e2a6714eec85e17cad5347:lib/juss-beautiful-hair/payment-policy.mjs (blob 958ad236). JBH owns this; it never belonged in Se'kret Bip.

const PAYMENT_ACTIONS = Object.freeze({
  CREATE_CHECKOUT: 'create_checkout',
  CHECK_STATUS: 'check_status',
  REFUND: 'refund',
  DISCOUNT: 'discount',
  UNKNOWN: 'unknown',
});

const PAYMENT_ROUTES = Object.freeze({
  SERVER_CHECKOUT: 'server_checkout',
  VERIFIED_WEBHOOK_ONLY: 'verified_webhook_only',
  FOUNDER_REVIEW: 'founder_review',
});

export function classifyPaymentRequest(message) {
  const value = typeof message === 'string' ? message.trim() : '';
  if (/\b(refund|return my money|chargeback)\b/i.test(value)) return PAYMENT_ACTIONS.REFUND;
  if (/\b(discount|coupon|promo|lower price)\b/i.test(value)) return PAYMENT_ACTIONS.DISCOUNT;
  if (/\b(paid|payment status|did my payment|receipt)\b/i.test(value)) return PAYMENT_ACTIONS.CHECK_STATUS;
  if (/\b(pay|checkout|buy now|payment link)\b/i.test(value)) return PAYMENT_ACTIONS.CREATE_CHECKOUT;
  return PAYMENT_ACTIONS.UNKNOWN;
}

function normalizeAllowedPriceIds(allowedStripePriceIds) {
  if (!Array.isArray(allowedStripePriceIds)) return new Set();
  return new Set(
    allowedStripePriceIds.filter(
      (value) => typeof value === 'string' && value.startsWith('price_'),
    ),
  );
}

export function routePaymentRequest({
  message,
  stripePriceId = null,
  allowedStripePriceIds = [],
  consent = false,
}) {
  const action = classifyPaymentRequest(message);

  if ([PAYMENT_ACTIONS.REFUND, PAYMENT_ACTIONS.DISCOUNT].includes(action)) {
    return {
      action,
      route: PAYMENT_ROUTES.FOUNDER_REVIEW,
      automatedActionAllowed: false,
      reason: 'financial_approval_required',
    };
  }

  if (action === PAYMENT_ACTIONS.CHECK_STATUS) {
    return {
      action,
      route: PAYMENT_ROUTES.VERIFIED_WEBHOOK_ONLY,
      automatedActionAllowed: false,
      reason: 'stripe_event_is_source_of_truth',
    };
  }

  if (action === PAYMENT_ACTIONS.CREATE_CHECKOUT) {
    if (!consent) {
      return {
        action,
        route: PAYMENT_ROUTES.FOUNDER_REVIEW,
        automatedActionAllowed: false,
        reason: 'customer_consent_required',
      };
    }

    const allowedPrices = normalizeAllowedPriceIds(allowedStripePriceIds);
    if (typeof stripePriceId !== 'string' || !allowedPrices.has(stripePriceId)) {
      return {
        action,
        route: PAYMENT_ROUTES.FOUNDER_REVIEW,
        automatedActionAllowed: false,
        reason: 'approved_stripe_price_required',
      };
    }

    return {
      action,
      route: PAYMENT_ROUTES.SERVER_CHECKOUT,
      automatedActionAllowed: true,
      stripePriceId,
      reason: 'approved_price_and_consent_present',
    };
  }

  return {
    action: PAYMENT_ACTIONS.UNKNOWN,
    route: PAYMENT_ROUTES.FOUNDER_REVIEW,
    automatedActionAllowed: false,
    reason: 'unknown_payment_request',
  };
}

export function sanitizeStripeEvent(event) {
  return {
    id: typeof event?.id === 'string' ? event.id : null,
    type: typeof event?.type === 'string' ? event.type : null,
    created: Number.isInteger(event?.created) ? event.created : null,
    livemode: event?.livemode === true,
    objectId: typeof event?.data?.object?.id === 'string' ? event.data.object.id : null,
  };
}

export { PAYMENT_ACTIONS, PAYMENT_ROUTES };

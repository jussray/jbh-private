// automation/messenger/message-policy.mjs
// Exported from jussray/Sekret-Bip@1d494ec8e6d1d20950e2a6714eec85e17cad5347:lib/juss-beautiful-hair/message-policy.mjs (blob 280dbb74). JBH owns this; it never belonged in Se'kret Bip.

const INTENTS = Object.freeze({
  SHOP: 'shop_hair',
  PRICE: 'price',
  ORDER_STATUS: 'order_status',
  SHIPPING_PICKUP: 'shipping_pickup',
  HUMAN: 'human',
  UNKNOWN: 'unknown',
});

const ROUTES = Object.freeze({
  AUTOMATED_FAQ: 'automated_faq',
  LEAD_CAPTURE: 'lead_capture',
  HUMAN_REVIEW: 'human_review',
});

const KEYWORDS = Object.freeze([
  [INTENTS.HUMAN, /\b(human|person|juss|agent|representative|talk to someone)\b/i],
  [INTENTS.ORDER_STATUS, /\b(order status|track|tracking|where.*order|my order)\b/i],
  [INTENTS.PRICE, /\b(price|prices|pricing|cost|how much)\b/i],
  [INTENTS.SHIPPING_PICKUP, /\b(ship|shipping|delivery|pickup|pick up)\b/i],
  [INTENTS.SHOP, /\b(shop|buy|bundles?|wigs?|closures?|frontals?|hair)\b/i],
]);

const HIGH_RISK_FACTS = /\b(in stock|available now|arrive|arrival|delivered by|refund|discount|promo|ready for pickup|order is|shipped)\b/i;
const FAQ_AUTOMATION_INTENTS = Object.freeze([
  INTENTS.SHOP,
  INTENTS.PRICE,
  INTENTS.SHIPPING_PICKUP,
]);

export function normalizeMessage(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

export function classifyIntent(message) {
  const normalized = normalizeMessage(message);
  for (const [intent, matcher] of KEYWORDS) {
    if (matcher.test(normalized)) return intent;
  }
  return INTENTS.UNKNOWN;
}

export function buildIdempotencyKey({ pageId, senderId, messageId }) {
  const parts = [pageId, senderId, messageId].map((part) => normalizeMessage(part));
  if (parts.some((part) => !part)) {
    throw new TypeError('pageId, senderId, and messageId are required');
  }
  return parts.join(':');
}

export function routeMessage({ message, approvedFaqAnswer = null }) {
  const normalized = normalizeMessage(message);
  const intent = classifyIntent(normalized);

  if (!normalized) {
    return {
      intent: INTENTS.UNKNOWN,
      route: ROUTES.HUMAN_REVIEW,
      replyAllowed: false,
      reason: 'empty_message',
    };
  }

  if (intent === INTENTS.HUMAN || intent === INTENTS.ORDER_STATUS) {
    return {
      intent,
      route: ROUTES.HUMAN_REVIEW,
      replyAllowed: false,
      reason: intent === INTENTS.HUMAN ? 'human_requested' : 'transactional_lookup_required',
    };
  }

  if (HIGH_RISK_FACTS.test(normalized)) {
    return {
      intent,
      route: ROUTES.HUMAN_REVIEW,
      replyAllowed: false,
      reason: 'unverified_business_fact',
    };
  }

  const hasApprovedFaqAnswer =
    typeof approvedFaqAnswer === 'string' && normalizeMessage(approvedFaqAnswer).length > 0;

  if (hasApprovedFaqAnswer && FAQ_AUTOMATION_INTENTS.includes(intent)) {
    return {
      intent,
      route: ROUTES.AUTOMATED_FAQ,
      replyAllowed: true,
      answer: approvedFaqAnswer,
      reason: 'approved_faq_match',
    };
  }

  if (FAQ_AUTOMATION_INTENTS.includes(intent)) {
    return {
      intent,
      route: ROUTES.LEAD_CAPTURE,
      replyAllowed: false,
      reason: 'approved_answer_missing',
    };
  }

  return {
    intent: INTENTS.UNKNOWN,
    route: ROUTES.HUMAN_REVIEW,
    replyAllowed: false,
    reason: 'unknown_intent',
  };
}

export function toHubSpotLead({
  customerName = null,
  contactMethod = null,
  message,
  productInterest = null,
  consent = false,
  trace,
}) {
  const normalized = normalizeMessage(message);
  const decision = routeMessage({ message: normalized });
  const basePayload = {
    source: 'Facebook Messenger',
    business: 'Juss Beautiful Hair',
    intent: decision.intent,
    humanFollowUpRequired: decision.route === ROUTES.HUMAN_REVIEW,
    consentStatus: consent ? 'granted' : 'not_granted',
  };

  if (!consent) {
    return basePayload;
  }

  return {
    ...basePayload,
    customerName,
    contactMethod,
    productInterest,
    conversationSummary: normalized.slice(0, 500),
    trace: {
      pageId: trace?.pageId ?? null,
      senderId: trace?.senderId ?? null,
      messageId: trace?.messageId ?? null,
    },
  };
}

export { INTENTS, ROUTES };

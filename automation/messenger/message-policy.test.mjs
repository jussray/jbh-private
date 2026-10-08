// Exported from jussray/Sekret-Bip@1d494ec8e6d1d20950e2a6714eec85e17cad5347:test/juss-beautiful-hair-message-policy.test.mjs (blob 90b41dda).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTENTS,
  ROUTES,
  buildIdempotencyKey,
  classifyIntent,
  routeMessage,
  toHubSpotLead,
} from './message-policy.mjs';

test('classifies the five core customer intents', () => {
  assert.equal(classifyIntent('How much are bundles?'), INTENTS.PRICE);
  assert.equal(classifyIntent('I want to shop for a wig'), INTENTS.SHOP);
  assert.equal(classifyIntent('Where is my order?'), INTENTS.ORDER_STATUS);
  assert.equal(classifyIntent('Do you offer pickup?'), INTENTS.SHIPPING_PICKUP);
  assert.equal(classifyIntent('I need a human'), INTENTS.HUMAN);
});

test('routes order status and explicit human requests to review', () => {
  for (const message of ['Track my order', 'Talk to Juss']) {
    const result = routeMessage({ message });
    assert.equal(result.route, ROUTES.HUMAN_REVIEW);
    assert.equal(result.replyAllowed, false);
  }
});

test('blocks unverified inventory, delivery, refund, and discount claims', () => {
  for (const message of [
    'Is this in stock?',
    'Will it arrive Friday?',
    'Can I get a refund?',
    'Give me a discount',
    'Is it ready for pickup?',
  ]) {
    const result = routeMessage({ message });
    assert.equal(result.route, ROUTES.HUMAN_REVIEW, message);
    assert.equal(result.replyAllowed, false, message);
    assert.equal(result.reason, 'unverified_business_fact', message);
  }
});

test('allows only an explicitly approved FAQ answer for an approved intent', () => {
  const result = routeMessage({
    message: 'How much are bundles?',
    approvedFaqAnswer: 'Approved catalog answer',
  });

  assert.equal(result.route, ROUTES.AUTOMATED_FAQ);
  assert.equal(result.replyAllowed, true);
  assert.equal(result.answer, 'Approved catalog answer');
});

test('unknown messages still escalate when an FAQ answer string is supplied', () => {
  const result = routeMessage({
    message: 'Can you tell me something else?',
    approvedFaqAnswer: 'Stale or mismatched answer',
  });

  assert.equal(result.intent, INTENTS.UNKNOWN);
  assert.equal(result.route, ROUTES.HUMAN_REVIEW);
  assert.equal(result.replyAllowed, false);
  assert.equal(result.reason, 'unknown_intent');
  assert.equal('answer' in result, false);
});

test('builds stable event keys and rejects incomplete trace data', () => {
  assert.equal(
    buildIdempotencyKey({ pageId: '235882889600658', senderId: 'customer-1', messageId: 'mid.1' }),
    '235882889600658:customer-1:mid.1',
  );

  assert.throws(
    () => buildIdempotencyKey({ pageId: '235882889600658', senderId: '', messageId: 'mid.1' }),
    /required/,
  );
});

test('omits CRM-visible customer data when consent is not granted', () => {
  const lead = toHubSpotLead({
    customerName: 'Customer',
    contactMethod: 'customer@example.com',
    message: 'Where is my order?',
    productInterest: 'Bundles',
    consent: false,
    trace: {
      pageId: '235882889600658',
      senderId: 'customer-1',
      messageId: 'mid.1',
    },
  });

  assert.deepEqual(lead, {
    source: 'Facebook Messenger',
    business: 'Juss Beautiful Hair',
    intent: INTENTS.ORDER_STATUS,
    humanFollowUpRequired: true,
    consentStatus: 'not_granted',
  });
  assert.equal('customerName' in lead, false);
  assert.equal('contactMethod' in lead, false);
  assert.equal('productInterest' in lead, false);
  assert.equal('conversationSummary' in lead, false);
  assert.equal('trace' in lead, false);
});

test('includes consented lead data only after explicit consent', () => {
  const lead = toHubSpotLead({
    customerName: 'Customer',
    contactMethod: 'customer@example.com',
    message: 'How much are bundles?',
    productInterest: 'Bundles',
    consent: true,
    trace: {
      pageId: '235882889600658',
      senderId: 'customer-1',
      messageId: 'mid.1',
    },
  });

  assert.equal(lead.consentStatus, 'granted');
  assert.equal(lead.customerName, 'Customer');
  assert.equal(lead.contactMethod, 'customer@example.com');
  assert.equal(lead.productInterest, 'Bundles');
  assert.equal(lead.conversationSummary, 'How much are bundles?');
  assert.deepEqual(lead.trace, {
    pageId: '235882889600658',
    senderId: 'customer-1',
    messageId: 'mid.1',
  });
});

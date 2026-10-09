// Exported from jussray/Sekret-Bip@1d494ec8e6d1d20950e2a6714eec85e17cad5347:test/juss-beautiful-hair-payment-policy.test.mjs (blob 0aace532).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAYMENT_ACTIONS,
  PAYMENT_ROUTES,
  classifyPaymentRequest,
  routePaymentRequest,
  sanitizeStripeEvent,
} from './payment-policy.mjs';

const ALLOWED_PRICE_IDS = ['price_123'];

test('classifies checkout, payment status, refund, and discount requests', () => {
  assert.equal(classifyPaymentRequest('Send me a payment link'), PAYMENT_ACTIONS.CREATE_CHECKOUT);
  assert.equal(classifyPaymentRequest('Did my payment go through?'), PAYMENT_ACTIONS.CHECK_STATUS);
  assert.equal(classifyPaymentRequest('I need a refund'), PAYMENT_ACTIONS.REFUND);
  assert.equal(classifyPaymentRequest('Can I get a discount?'), PAYMENT_ACTIONS.DISCOUNT);
});

test('requires founder review for refunds and discounts', () => {
  for (const message of ['Refund my order', 'Give me a coupon']) {
    const result = routePaymentRequest({
      message,
      consent: true,
      stripePriceId: 'price_123',
      allowedStripePriceIds: ALLOWED_PRICE_IDS,
    });
    assert.equal(result.route, PAYMENT_ROUTES.FOUNDER_REVIEW);
    assert.equal(result.automatedActionAllowed, false);
    assert.equal(result.reason, 'financial_approval_required');
  }
});

test('uses verified Stripe events as the only payment-status truth', () => {
  const result = routePaymentRequest({ message: 'Did my payment go through?' });
  assert.equal(result.route, PAYMENT_ROUTES.VERIFIED_WEBHOOK_ONLY);
  assert.equal(result.automatedActionAllowed, false);
});

test('allows server checkout only with consent and an explicitly allowlisted Stripe price', () => {
  assert.equal(
    routePaymentRequest({
      message: 'Send checkout',
      consent: false,
      stripePriceId: 'price_123',
      allowedStripePriceIds: ALLOWED_PRICE_IDS,
    }).automatedActionAllowed,
    false,
  );
  assert.equal(
    routePaymentRequest({
      message: 'Send checkout',
      consent: true,
      stripePriceId: 'not-a-price',
      allowedStripePriceIds: ALLOWED_PRICE_IDS,
    }).automatedActionAllowed,
    false,
  );
  assert.equal(
    routePaymentRequest({
      message: 'Send checkout',
      consent: true,
      stripePriceId: 'price_unapproved',
      allowedStripePriceIds: ALLOWED_PRICE_IDS,
    }).automatedActionAllowed,
    false,
  );
  assert.equal(
    routePaymentRequest({
      message: 'Send checkout',
      consent: true,
      stripePriceId: 'price_123',
    }).automatedActionAllowed,
    false,
  );

  const approved = routePaymentRequest({
    message: 'Send checkout',
    consent: true,
    stripePriceId: 'price_123',
    allowedStripePriceIds: ALLOWED_PRICE_IDS,
  });
  assert.equal(approved.route, PAYMENT_ROUTES.SERVER_CHECKOUT);
  assert.equal(approved.automatedActionAllowed, true);
});

test('sanitizes Stripe events before logging or CRM mapping', () => {
  assert.deepEqual(
    sanitizeStripeEvent({
      id: 'evt_123',
      type: 'checkout.session.completed',
      created: 123456,
      livemode: false,
      data: { object: { id: 'cs_test_123', customer_email: 'private@example.com' } },
    }),
    {
      id: 'evt_123',
      type: 'checkout.session.completed',
      created: 123456,
      livemode: false,
      objectId: 'cs_test_123',
    },
  );
});

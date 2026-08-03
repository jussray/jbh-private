import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  normalizePaidHairMatchOrder,
  verifyShopifyWebhookHmac,
} from "../../.worker-test-dist/shopify-order-model.js";

function paidHairMatchOrder(overrides = {}) {
  return {
    id: 1001,
    admin_graphql_api_id: "gid://shopify/Order/1001",
    currency: "USD",
    financial_status: "paid",
    email: "Customer@Example.com",
    current_subtotal_price: "25.00",
    current_total_price: "25.00",
    billing_address: { name: "Test Customer", phone: "+15555550123" },
    line_items: [
      {
        id: 9001,
        product_id: 9696750010611,
        variant_id: 50196622344435,
        title: "Juss Hair Match Session + $25 Purchase Credit",
        variant_title: "Hair Match Session",
        sku: "JBH-MATCH-25",
        quantity: 1,
        price: "25.00",
      },
    ],
    ...overrides,
  };
}

test("valid paid Hair Match becomes a private service with no vendor route", () => {
  const normalized = normalizePaidHairMatchOrder(paidHairMatchOrder());

  assert.equal(normalized.shopifyOrderId, "1001");
  assert.equal(normalized.customerEmail, "customer@example.com");
  assert.equal(normalized.customerName, "Test Customer");
  assert.equal(normalized.subtotal, 25);
  assert.equal(normalized.total, 25);

  const items = JSON.parse(normalized.itemsJson);
  assert.equal(items.length, 1);
  assert.equal(items[0].serviceCode, "jbh-hair-match-v1");
  assert.equal(items[0].vendorRoutingStatus, "not_applicable");
});

test("wrong variant, quantity, or extra line item fails closed", () => {
  const wrongVariant = paidHairMatchOrder();
  wrongVariant.line_items[0].variant_id = 123;
  assert.throws(() => normalizePaidHairMatchOrder(wrongVariant), /unexpected_shopify_variant/);

  const wrongQuantity = paidHairMatchOrder();
  wrongQuantity.line_items[0].quantity = 2;
  assert.throws(
    () => normalizePaidHairMatchOrder(wrongQuantity),
    /hair_match_price_or_quantity_mismatch/,
  );

  const mixedCart = paidHairMatchOrder({
    line_items: [
      paidHairMatchOrder().line_items[0],
      {
        id: 9002,
        product_id: 1,
        variant_id: 2,
        title: "Unapproved physical product",
        quantity: 1,
        price: "1.00",
      },
    ],
  });
  assert.throws(
    () => normalizePaidHairMatchOrder(mixedCart),
    /unexpected_line_item_count/,
  );
});

test("Shopify HMAC verifies the exact raw body and rejects tampering", async () => {
  const secret = "test-shopify-webhook-secret";
  const rawBody = JSON.stringify(paidHairMatchOrder());
  const hmac = createHmac("sha256", secret).update(rawBody).digest("base64");

  assert.equal(await verifyShopifyWebhookHmac(rawBody, hmac, secret), true);
  assert.equal(
    await verifyShopifyWebhookHmac(`${rawBody} `, hmac, secret),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePaidShopifyPhysicalOrder,
  PHYSICAL_CATALOG_BY_SKU,
  ShopifyPhysicalOrderModelError,
} from "../../.worker-test-dist/shopify-physical-order-model.js";

function physicalLine(overrides = {}) {
  return {
    id: 9001,
    product_id: 8001,
    variant_id: 7001,
    title: "Lawless Body Wave Bundle — Raw Vietnamese",
    variant_title: '18"',
    sku: "JBH-BW-18",
    quantity: 1,
    price: "90.00",
    ...overrides,
  };
}

function paidOrder(overrides = {}) {
  return {
    id: 1001,
    admin_graphql_api_id: "gid://shopify/Order/1001",
    name: "#1001",
    currency: "USD",
    financial_status: "paid",
    email: "buyer@example.com",
    phone: "+15555550100",
    shipping_address: {
      name: "Buyer Example",
      address1: "123 Main St",
      address2: "Apt 2",
      city: "Johnstown",
      province: "Pennsylvania",
      province_code: "PA",
      country: "United States",
      country_code: "US",
      zip: "15901",
      phone: "+15555550100",
    },
    subtotal_price: "90.00",
    total_price: "100.00",
    line_items: [physicalLine()],
    ...overrides,
  };
}

function expectModelError(fn, code) {
  assert.throws(
    fn,
    (error) =>
      error instanceof ShopifyPhysicalOrderModelError && error.code === code,
  );
}

test("canonical Shopify physical order becomes procurement-needed receipt", () => {
  const result = normalizePaidShopifyPhysicalOrder(paidOrder());
  assert.equal(result.kind, "physical");
  assert.equal(result.order.shopifyOrderId, "1001");
  assert.equal(result.order.subtotalCents, 9000);
  assert.equal(result.order.totalCents, 10000);

  const items = JSON.parse(result.order.itemsJson);
  assert.equal(items.length, 1);
  assert.equal(items[0].sku, "JBH-BW-18");
  assert.equal(items[0].productCode, "bundle-bodywave");
  assert.equal(items[0].procurementStatus, "procurement_needed");
});

test("catalog map covers the full 37-SKU canonical physical catalog", () => {
  assert.equal(Object.keys(PHYSICAL_CATALOG_BY_SKU).length, 37);
  assert.equal(PHYSICAL_CATALOG_BY_SKU["JBH-WG-ST-22"].unitPriceCents, 21500);
  assert.equal(PHYSICAL_CATALOG_BY_SKU["JBH-OIL-2OZ"].unitPriceCents, 1800);
});

test("unknown SKU fails closed", () => {
  expectModelError(
    () =>
      normalizePaidShopifyPhysicalOrder(
        paidOrder({ line_items: [physicalLine({ sku: "JBH-NOT-REAL" })] }),
      ),
    "unsupported_physical_sku",
  );
});

test("altered Shopify unit price fails closed", () => {
  expectModelError(
    () =>
      normalizePaidShopifyPhysicalOrder(
        paidOrder({ line_items: [physicalLine({ price: "9.00" })] }),
      ),
    "shopify_line_price_mismatch",
  );
});

test("Hair Match remains service-only and is not procured", () => {
  const result = normalizePaidShopifyPhysicalOrder(
    paidOrder({
      shipping_address: null,
      subtotal_price: "25.00",
      total_price: "25.00",
      line_items: [
        physicalLine({
          id: 9002,
          sku: "JBH-MATCH-25",
          title: "Juss Hair Match Session + $25 Purchase Credit",
          variant_title: "Hair Match Session",
          price: "25.00",
        }),
      ],
    }),
  );
  assert.deepEqual(result, { kind: "ignored_service", shopifyOrderId: "1001" });
});

test("mixed Hair Match and physical cart fails closed", () => {
  expectModelError(
    () =>
      normalizePaidShopifyPhysicalOrder(
        paidOrder({
          line_items: [
            physicalLine(),
            physicalLine({
              id: 9002,
              sku: "JBH-MATCH-25",
              title: "Hair Match",
              price: "25.00",
            }),
          ],
        }),
      ),
    "mixed_service_and_physical_cart",
  );
});

test("physical order requires a shipping address", () => {
  expectModelError(
    () => normalizePaidShopifyPhysicalOrder(paidOrder({ shipping_address: null })),
    "missing_shipping_address",
  );
});

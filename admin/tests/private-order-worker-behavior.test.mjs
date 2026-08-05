import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVendorRoutingUpdates,
  normalizeOrderLineItems,
  VendorRoutingModelError,
} from "../../.worker-test-dist/vendor-routing-model.js";

function item(variant) {
  return {
    id: "bundle-001",
    variant,
    assignedVendorId: "",
    routeId: "",
    vendorSku: "",
    vendorUnitCost: 0,
    vendorStatus: "unassigned",
  };
}

test("two variants of one product receive distinct stable line identities", () => {
  const normalized = normalizeOrderLineItems(42, [item("18-inch"), item("22-inch")]);

  assert.equal(normalized[0].id, normalized[1].id);
  assert.notEqual(normalized[0].lineItemId, normalized[1].lineItemId);
  assert.equal(normalized[0].lineItemId, "order:42:line:1");
  assert.equal(normalized[1].lineItemId, "order:42:line:2");
});

test("routing one variant never mutates the sibling variant", () => {
  const items = normalizeOrderLineItems(42, [item("18-inch"), item("22-inch")]);
  const routed = applyVendorRoutingUpdates(42, items, [
    {
      itemId: items[1].lineItemId,
      assignedVendorId: "vendor-b",
      routeId: "route-22",
      vendorSku: "SKU-22",
      vendorUnitCost: 81.5,
      vendorStatus: "ready",
    },
  ]);

  assert.equal(routed[0].variant, "18-inch");
  assert.equal(routed[0].assignedVendorId, "");
  assert.equal(routed[0].vendorStatus, "unassigned");

  assert.equal(routed[1].variant, "22-inch");
  assert.equal(routed[1].assignedVendorId, "vendor-b");
  assert.equal(routed[1].vendorSku, "SKU-22");
  assert.equal(routed[1].vendorStatus, "ready");
});

test("legacy product ids cannot ambiguously route multiple order lines", () => {
  const items = normalizeOrderLineItems(42, [item("18-inch"), item("22-inch")]);

  assert.throws(
    () =>
      applyVendorRoutingUpdates(42, items, [
        {
          itemId: "bundle-001",
          assignedVendorId: "vendor-a",
          routeId: "route-all",
          vendorSku: "SKU-ALL",
          vendorUnitCost: 70,
          vendorStatus: "ready",
        },
      ]),
    (error) =>
      error instanceof VendorRoutingModelError && error.code === "unknown_order_line",
  );
});

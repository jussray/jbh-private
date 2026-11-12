import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [entry, operations, publicApp] = await Promise.all([
  read("admin/payment-worker/src/index.ts"),
  read("admin/payment-worker/src/commerce-operations.ts"),
  read("admin/client/src/App.tsx"),
]);

test("commerce operations is a private exact route, not a public storefront page", () => {
  assert.match(entry, /pathname === "\/api\/admin\/commerce-operations"/);
  assert.match(entry, /handleCommerceOperationsRequest\(request, env\)/);
  assert.doesNotMatch(publicApp, /commerce-operations|CommerceOperations/);
  assert.match(operations, /validateAccess\(request, env\)/);
  assert.match(operations, /return json\(\{ error: "Unauthorized" \}, 401/);
});

test("private view fails closed for writes and browser code cannot dispatch suppliers", () => {
  assert.match(operations, /request\.method !== "GET"/);
  assert.match(operations, /"Method not allowed", 405/);
  assert.doesNotMatch(operations, /method: "(POST|PATCH|PUT|DELETE)"/);
  assert.doesNotMatch(operations, /setInventory|sendMessage|dispatchVendor|createPurchase/);
  assert.match(operations, /handleVendorSourcingRequest\(sourceRequest, env\)/);
  assert.match(operations, /handleShopifyProcurementAdminRequest\(ordersRequest, env\)/);
});

test("private view escapes untrusted values and is explicitly non-cacheable", () => {
  assert.match(operations, /function escapeHtml/);
  assert.match(operations, /return escapeHtml\(rendered\)/);
  assert.match(operations, /"Cache-Control": "private, no-store, max-age=0"/);
  assert.match(operations, /"X-Robots-Tag": "noindex, nofollow"/);
  assert.match(operations, /"Content-Security-Policy"/);
  assert.match(operations, /"X-Frame-Options": "DENY"/);
  assert.doesNotMatch(operations, /<script/);
});

test("missing sourcing and delivery evidence stay unknown and supplier verification is not inferred", () => {
  assert.match(operations, /function quoteEvidence/);
  assert.match(operations, /field\(quote, "status"\) === "verified"/);
  assert.match(operations, /return "UNKNOWN"/);
  assert.match(operations, /Supplier data unavailable: status is not zero/);
  assert.match(operations, /Paid-order data unavailable: status is not zero/);
  assert.match(operations, /carrier proof unverified/);
  assert.match(operations, /margin stay unknown/i);
  assert.match(operations, /No campaigns are launched here/);
});

test("commerce workflow carries the required gates and six-part evidence contract", () => {
  for (const stage of ["REVIEW", "VERIFY", "PREPARE", "FULFILL", "LEARN"]) {
    assert.match(operations, new RegExp(">" + stage + "<"));
  }
  for (const field of ["REALITY", "FIX", "PROOF", "RISK", "ROLLBACK", "NEXT GATE"]) {
    assert.match(operations, new RegExp('"' + field + '"'));
  }
});

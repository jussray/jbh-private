import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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

test("Stripe paid-order source is reused under Access and cannot mutate fulfillment", () => {
  assert.match(operations, /handleAdminRequest\\(stripeOrdersRequest, env\\)/);
  assert.match(operations, /new URL\\("\\/api\\/admin\\/orders", request\\.url\\)/);
  assert.match(operations, /renderCommerceOperations\\(responses\\[0\\], responses\\[1\\], new Date\\(\\), responses\\[2\\]\\)/);
  assert.match(operations, /function stripeOrderEvidence/);
  assert.match(operations, /Stripe-order data unavailable: status is not zero/);
  assert.match(operations, /Private paid-order records; live Stripe API not asserted/);
  assert.doesNotMatch(operations, /method: "(POST|PUT|PATCH|DELETE)"/);
});

async function loadPureRenderer() {
  const start = operations.indexOf("type RecordRow =");
  const end = operations.indexOf("function protectedHeaders()", start);
  assert.ok(start >= 0 && end > start, "pure renderer must have stable bounds");
  const { outputText } = ts.transpileModule(operations.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
}

test("Stripe paid orders render separately, escape product text, and preserve source distinctions", async () => {
  const { renderCommerceOperations } = await loadPureRenderer();
  const stripePaid = {
    id: 101,
    createdAt: "2026-11-18T12:00:00Z",
    paymentStatus: "paid",
    stripeSessionId: "cs_test_browser_mock_123456789012",
    stripePaymentIntentId: "pi_test_browser_mock",
    total: 120,
    status: "processing",
    items: [{ name: "<script>bad()</script>", variant: '18"', qty: 1 }],
  };
  const html = renderCommerceOperations(
    { vendors: [], quotes: [], sampleRequests: [] },
    { orders: [{ id: 99, shopify_order_id: "sh-test", payment_status: "paid", total_cents: 11000, currency: "USD" }] },
    new Date("2026-11-18T12:00:00Z"),
    { orders: [stripePaid] },
  );
  assert.match(html, /Stripe paid-order handoffs/);
  assert.match(html, /Shopify paid record never grants automatic procurement/);
  assert.match(html, /Private paid-order records; live Stripe API not asserted/);
  assert.match(html, /Stripe paid-order handoff/);
  assert.match(html, /\$120\.00/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>bad\(\)<\/script>/);
  assert.match(html, /Supplier records/);
});

test("unavailable Stripe data and records without a payment intent never count as confirmed", async () => {
  const { renderCommerceOperations } = await loadPureRenderer();
  const unknown = renderCommerceOperations(null, null, new Date("2026-11-18T12:00:00Z"));
  assert.match(unknown, /Stripe-order data unavailable: status is not zero/);
  const absentIntent = renderCommerceOperations(
    { vendors: [], quotes: [], sampleRequests: [] },
    { orders: [] },
    new Date("2026-11-18T12:00:00Z"),
    { orders: [{ id: 1, paymentStatus: "paid", stripeSessionId: "cs_test_example" }] },
  );
  assert.match(absentIntent, /Stripe paid orders<\/span><strong>0<\/strong>/);
  assert.match(absentIntent, /UNKNOWN/);
});

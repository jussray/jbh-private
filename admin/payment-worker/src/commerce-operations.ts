import { validateAccess } from "./access";
import { handleShopifyProcurementAdminRequest } from "./shopify-procurement-admin";
import { handleVendorSourcingRequest } from "./vendor-sourcing";
import { type Env, json, text } from "./shared";

// Owner-only read view. Existing Shopify and sourcing databases retain authority.
// Do not move vendor, customer, cost, or procurement records into the public app.
type RecordRow = Record<string, unknown>;

function rows(value: unknown): RecordRow[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is RecordRow => entry !== null && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function field(row: RecordRow, key: string): string {
  const value = row[key];
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function escapeHtml(value: unknown): string {
  return String(value === undefined || value === null ? "" : value).replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return entities[character];
  });
}

function display(value: unknown, fallback = "Unknown"): string {
  const rendered = value === null || value === undefined || value === "" ? fallback : String(value);
  return escapeHtml(rendered);
}

function money(value: unknown, currency: unknown = "USD"): string {
  const amount = Number(value);
  const code = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  if (value === null || value === undefined || value === "" || !Number.isFinite(amount)) return "Unknown";
  try {
    return escapeHtml(new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount / 100));
  } catch {
    return "Unknown";
  }
}

function day(value: unknown): string {
  if (!value) return "Unknown";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Unknown" : escapeHtml(date.toISOString().slice(0, 10));
}

function evidence(value: "CONFIRMED" | "STALE" | "UNKNOWN"): string {
  return '<span class="state ' + value.toLowerCase() + '">' + value + "</span>";
}

function quoteEvidence(quote: RecordRow, today: string): "CONFIRMED" | "STALE" | "UNKNOWN" {
  const expiry = field(quote, "valid_until").slice(0, 10);
  if (field(quote, "status") === "expired" || (expiry && expiry < today)) return "STALE";
  // A recorded quote is not automatically a verified supplier reply.
  if (
    field(quote, "status") === "verified" &&
    field(quote, "reply_received_at") &&
    (field(quote, "source_message_id") || field(quote, "source_thread_id"))
  ) return "CONFIRMED";
  return "UNKNOWN";
}

function orderEvidence(order: RecordRow): "CONFIRMED" | "UNKNOWN" {
  // Only the private, signed orders/paid ingestion is treated as paid-order evidence.
  return field(order, "payment_status").toLowerCase() === "paid" &&
    !!field(order, "shopify_order_id") ? "CONFIRMED" : "UNKNOWN";
}

function cell(content: string): string { return "<td>" + content + "</td>"; }
function section(title: string, note: string, body: string): string {
  return '<section class="panel"><div class="sectionhead"><h2>' + escapeHtml(title) +
    '</h2><p>' + escapeHtml(note) + '</p></div>' + body + "</section>";
}
function table(headings: string[], body: string, empty: string): string {
  return '<div class="scroll"><table><thead><tr>' +
    headings.map((item) => "<th scope=\"col\">" + escapeHtml(item) + "</th>").join("") +
    '</tr></thead><tbody>' + (body || '<tr><td colspan="' + headings.length +
    '" class="empty">' + escapeHtml(empty) + '</td></tr>') + '</tbody></table></div>';
}

function evidenceRecord(title: string, entries: Array<[string, string]>): string {
  return '<details class="receipt"><summary>' + escapeHtml(title) + '</summary><dl>' +
    entries.map(([label, value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' +
      escapeHtml(value) + "</dd></div>").join("") + "</dl></details>";
}

const STYLES = [
  ":root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:#080910;color:#f8f5ff}",
  "*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0%,#2c194c 0%,transparent 45%),#080910}",
  "a{color:#dec8ff}a:focus-visible,summary:focus-visible{outline:3px solid #e7b86a;outline-offset:4px}",
  ".wrap{max-width:1320px;margin:auto;padding:26px clamp(14px,3vw,42px) 80px}",
  ".top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}",
  ".brand{font-size:12px;text-transform:uppercase;letter-spacing:.18em;color:#e0bd83;font-weight:800}",
  ".pill{border:1px solid #675181;border-radius:999px;color:#ddcdf4;padding:8px 13px;font-size:12px}",
  "h1{font-size:clamp(32px,5vw,64px);letter-spacing:-.045em;line-height:1.04;margin:27px 0 13px;max-width:950px}",
  ".lead{color:#b6afc5;line-height:1.6;max-width:860px;margin:0 0 26px}",
  ".steps{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 30px}",
  ".step{padding:10px 13px;border:1px solid #544462;border-radius:10px;background:#241a32;color:#f1e6ff;font-size:12px;font-weight:700;letter-spacing:.045em}",
  ".stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:22px}",
  ".stat,.panel{background:linear-gradient(140deg,#1d1728,#12121c);border:1px solid #42334f;border-radius:18px;box-shadow:0 18px 44px #0004}",
  ".stat{padding:20px}.stat strong{font-size:27px;display:block;margin:6px 0}.stat span{font-size:12px;color:#b2a8c2}",
  ".panel{padding:22px;margin:20px 0;overflow:hidden}.sectionhead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}",
  "h2{margin:0 0 9px;font-size:22px;letter-spacing:-.025em}.sectionhead p,.muted{color:#b6afc5;font-size:13px;line-height:1.55;margin:0 0 15px}",
  ".scroll{width:100%;overflow-x:auto}table{border-collapse:collapse;min-width:820px;width:100%;font-size:13px}",
  "th{color:#c8b4e6;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.09em;background:#271e35}",
  "td,th{padding:13px 12px;border-bottom:1px solid #3c3149;vertical-align:top}tr:last-child td{border-bottom:0}",
  "td{max-width:250px;overflow-wrap:anywhere}.empty{color:#a99eb7;text-align:center;padding:29px}",
  ".state{font-size:10px;font-weight:800;letter-spacing:.08em;padding:6px 9px;border-radius:999px;white-space:nowrap}",
  ".confirmed{background:#16372e;color:#baf6d8}.stale{background:#4a2a20;color:#ffccb9}.unknown{background:#353048;color:#ded1f5}",
  ".note{border-left:3px solid #d9ac66;padding:11px 15px;background:#2a2130;border-radius:0 10px 10px 0;color:#e8ddf1;font-size:13px;line-height:1.6}",
  ".receipts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}",
  ".receipt{background:#171420;border:1px solid #46354f;border-radius:12px;padding:13px}",
  "summary{cursor:pointer;color:#efdbff;font-weight:700;font-size:13px;overflow-wrap:anywhere}",
  "dl{margin:13px 0 0}dl div{padding:8px 0;border-top:1px solid #352b3f}dt{font-size:10px;color:#d5ad76;font-weight:800;letter-spacing:.06em}",
  "dd{margin:4px 0 0;color:#e1dbe9;font-size:12px;line-height:1.5;overflow-wrap:anywhere}",
  ".footer{color:#a9a0b9;font-size:12px;line-height:1.7;margin-top:27px}",
  "@media(max-width:830px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.receipts{grid-template-columns:1fr}}",
  "@media(max-width:480px){.stats{grid-template-columns:1fr 1fr}.stat{padding:14px}.stat strong{font-size:22px}.panel{padding:15px}h1{font-size:35px}}",
].join("");

export function renderCommerceOperations(
  sourcing: unknown,
  procurement: unknown,
  generatedAt = new Date(),
): string {
  const sourcingData = sourcing && typeof sourcing === "object" ? sourcing as RecordRow : {};
  const procurementData = procurement && typeof procurement === "object" ? procurement as RecordRow : {};
  const vendors = rows(sourcingData.vendors);
  const quotes = rows(sourcingData.quotes);
  const samples = rows(sourcingData.sampleRequests);
  const orders = rows(procurementData.orders);
  const today = generatedAt.toISOString().slice(0, 10);
  const vendorNames = new Map(vendors.map((vendor) => [field(vendor, "id"), field(vendor, "display_name") || "Unnamed vendor"]));
  const vendorName = (id: string) => vendorNames.get(id) || "Unverified vendor";
  const latestByVendor = new Map<string, RecordRow>();
  for (const quote of quotes) {
    const id = field(quote, "vendor_id");
    if (!latestByVendor.has(id)) latestByVendor.set(id, quote);
  }

  const supplierRows = vendors.map((vendor) => {
    const quote = latestByVendor.get(field(vendor, "id"));
    const quoteCurrency = quote ? field(quote, "currency") : "USD";
    return "<tr>" + [
      display(field(vendor, "display_name")),
      quote ? evidence(quoteEvidence(quote, today)) : evidence("UNKNOWN"),
      quote ? day(quote.reply_received_at) : "Unknown",
      quote ? money(quote.minimum_order_cents, quoteCurrency) : "Unknown",
      quote ? money(quote.quoted_shipping_cents, quoteCurrency) : "Unknown",
      quote ? display(quote.branding_summary) : "Unknown",
      quote ? display(quote.shipping_summary) : "Unknown",
      "Unknown",
      "Unknown",
    ].map(cell).join("") + "</tr>";
  }).join("");

  const quoteRows = quotes.map((quote) => {
    const items = rows(quote.items);
    const product = items.map((item) => {
      return display(field(item, "productId")) + " · " + display(field(item, "variant")) +
        " (" + money(item.unitCostCents, quote.currency) + ")";
    }).join("<hr>") || "Unknown";
    return "<tr>" + [
      display(vendorName(field(quote, "vendor_id"))),
      product,
      evidence(quoteEvidence(quote, today)),
      display(field(quote, "quote_reference")),
      day(quote.reply_received_at),
      day(quote.valid_until),
      money(quote.quoted_shipping_cents, quote.currency),
      money(quote.quoted_duties_cents, quote.currency),
      "Unknown",
    ].map(cell).join("") + "</tr>";
  }).join("");

  const samplesRows = samples.map((sample) => "<tr>" + [
    display("#" + field(sample, "id")),
    display(vendorName(field(sample, "vendor_id"))),
    display(field(sample, "status")),
    money(sample.total_cents, sample.currency),
    day(sample.created_at),
    display(field(sample, "quote_id")),
    field(sample, "owner_approved_at") ? "Owner approval recorded; no purchase inferred" : "Not approved",
  ].map(cell).join("") + "</tr>").join("");

  const orderRows = orders.map((order) => "<tr>" + [
    display(field(order, "order_name") || "#" + field(order, "id")),
    evidence(orderEvidence(order)),
    money(order.total_cents, order.currency),
    display(field(order, "procurement_status")),
    display(field(order, "supplier_code")),
    field(order, "tracking_number") ? "Tracking recorded" : "No tracking evidence",
    field(order, "delivered_at") ? "Status recorded; carrier proof unverified" : "Unknown",
    day(order.created_at),
  ].map(cell).join("") + "</tr>").join("");

  const candidates = new Map<string, { vendors: Set<string>; samples: number }>();
  for (const quote of quotes) {
    for (const item of rows(quote.items)) {
      const id = field(item, "productId");
      if (!id) continue;
      const record = candidates.get(id) || { vendors: new Set<string>(), samples: 0 };
      record.vendors.add(field(quote, "vendor_id"));
      candidates.set(id, record);
    }
  }
  const productRows = Array.from(candidates.entries()).map(([id, value]) =>
    "<tr>" + [
      display(id), display(value.vendors.size + " quoted vendor(s)"), "Sample quality not independently verified",
      "Unknown", "Unknown", "Unknown",
    ].map(cell).join("") + "</tr>"
  ).join("");

  const proposed = samples.filter((sample) =>
    ["awaiting_owner_approval", "ready_for_owner_checkout"].includes(field(sample, "status"))
  );
  const proposedUsd = proposed.filter((sample) => field(sample, "currency") === "USD")
    .reduce((sum, sample) => sum + (Number(sample.total_cents) || 0), 0);
  const proposedOther = proposed.filter((sample) => field(sample, "currency") !== "USD").length;
  const confirmedOrders = orders.filter((order) => orderEvidence(order) === "CONFIRMED").length;
  const staleQuotes = quotes.filter((quote) => quoteEvidence(quote, today) === "STALE").length;

  const receipts = [
    ...quotes.slice(0, 15).map((quote) => evidenceRecord(
      "Supplier quote #" + field(quote, "id") + " · " + vendorName(field(quote, "vendor_id")),
      [
        ["REALITY", "Quote recorded; evidence status " + quoteEvidence(quote, today) + "; reply date " + day(quote.reply_received_at)],
        ["FIX", "Check source reply, specification, MOQ, freight, sample quality, and private-label terms"],
        ["PROOF", "Message reference: " + (field(quote, "source_message_id") || "missing") + "; thread reference: " + (field(quote, "source_thread_id") || "missing")],
        ["RISK", "Prices, sample claims, and availability are not independently authenticated here"],
        ["ROLLBACK", "Do not select or pay supplier; preserve existing sourcing records"],
        ["NEXT GATE", "Verify supplier reply and sample before approval"],
      ],
    )),
    ...orders.slice(0, 15).map((order) => evidenceRecord(
      "Paid-order handoff · " + (field(order, "order_name") || "#" + field(order, "id")),
      [
        ["REALITY", "Payment evidence " + orderEvidence(order) + "; procurement " + (field(order, "procurement_status") || "unknown")],
        ["FIX", "Check paid-order evidence, supported SKU, supplier confirmation and tracking"],
        ["PROOF", "Shopify ID: " + (field(order, "shopify_order_id") || "missing") + "; tracking: " + (field(order, "tracking_number") || "missing")],
        ["RISK", "A manually recorded delivery status is not independent courier delivery confirmation"],
        ["ROLLBACK", "Do not dispatch, refund, or alter a paid order from this read-only view"],
        ["NEXT GATE", "Owner reviews evidence before private fulfillment handoff"],
      ],
    )),
  ].join("");

  const unavailable = [
    sourcing === null ? "Supplier data unavailable: status is not zero." : "",
    procurement === null ? "Paid-order data unavailable: status is not zero." : "",
  ].filter(Boolean).join(" ");

  const page = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow"><title>JBH | Private Commerce Operations</title><style>', STYLES, '</style></head><body><main class="wrap">',
    '<header class="top"><span class="brand">Juss Beautiful Hair · Owner workspace</span><span class="pill">Private · Access protected · Read only</span></header>',
    '<h1>Commerce operations, with receipts.</h1>',
    '<p class="lead">Supplier intelligence, samples, real paid-order handoffs, and capital discipline. The public storefront stays at <a href="https://jussbeautifulhair.com/">jussbeautifulhair.com</a>. No vendor selection, messages, orders, refunds, or spending actions run from this page.</p>',
    '<nav class="steps" aria-label="Operating stages"><span class="step">REVIEW</span><span class="step">VERIFY</span><span class="step">PREPARE</span><span class="step">FULFILL</span><span class="step">LEARN</span></nav>',
    unavailable ? '<p class="note" role="status">' + escapeHtml(unavailable) + '</p>' : "",
    '<div class="stats"><div class="stat"><span>Supplier records</span><strong>', String(vendors.length),
    '</strong><span>Recorded, not selected</span></div><div class="stat"><span>Quotes requiring renewal</span><strong>', String(staleQuotes),
    '</strong><span>Expired by recorded date/status</span></div><div class="stat"><span>Paid orders recorded</span><strong>', String(confirmedOrders),
    '</strong><span>Signed-webhook store records; live Shopify API not asserted</span></div><div class="stat"><span>Proposed sample outlay · USD</span><strong>', money(proposedUsd, "USD"),
    '</strong><span>Not money spent; ', String(proposedOther), ' other-currency requests</span></div></div>',
    section("Supplier comparison", "Owner-only records; no vendor is preferred or selected by this page. MOQ in units, WhatsApp and margin stay unknown where no verified source is stored.",
      table(["Supplier", "Evidence", "Last recorded reply", "Minimum order amount", "Quoted shipping", "Brand / private label", "Shipping / lead-time notes", "WhatsApp", "Gross margin"], supplierRows, "No private vendor rows available.")),
    section("Quote and sample comparison", "A recorded reply is not verified merely because an ID was entered. Expired terms are labeled stale.",
      table(["Supplier", "Quoted SKU / unit cost", "Evidence", "Reference", "Reply date", "Valid through", "Shipping", "Duties", "Margin"], quoteRows, "No received quote records available.") +
      table(["Sample ID", "Supplier", "Approval stage", "Estimated landed total", "Created", "Quote", "Purchasing proof"], samplesRows, "No sample requests recorded.")),
    section("Product and inventory readiness", "Quoted variants are candidates only, not Shopify inventory or product activation evidence.",
      table(["Product candidate", "Supplier quote coverage", "Sample results", "On-hand inventory", "Supplier stock", "Ready to publish"], productRows, "No structured product quote candidates available.")),
    section("Paid-order fulfillment handoffs", "Order identity and status are private. A Shopify paid record never grants automatic procurement or supplier dispatch.",
      table(["Order", "Payment evidence", "Paid amount", "Procurement", "Supplier code", "Shipment proof", "Delivery proof", "Created"], orderRows, "No private Shopify physical orders available.")),
    section("Working capital discipline", "Do not treat a supplier quote as cash available, a sample request as a paid invoice, or sales as net profit.",
      '<p class="note">Estimated open sample requests: <strong>' + String(proposed.length) +
      '</strong>. USD proposed cost: <strong>' + money(proposedUsd, "USD") +
      '</strong>. Available working capital, actual spend, fees, taxes, refunds and realized margin: <strong>UNKNOWN</strong> until reconciled from authoritative records.</p>'),
    section("Customer acquisition experiments", "Track audience, channel, creative, spend, attributable paid orders, refunds, repeat purchases and CAC only once sourced.",
      '<p class="note">No verified experiment events are connected to this private read view. Conversion rate, customer acquisition cost and return on ad spend remain <strong>UNKNOWN</strong>. No campaigns are launched here.</p>'),
    section("Evidence ledger", "Each source record carries the founder decision contract. Up to 15 supplier quotes and 15 paid orders appear here; the tables retain the full bounded source result.",
      '<div class="receipts">' + (receipts || '<p class="muted">No source receipts to display.</p>') + '</div>'),
    '<footer class="footer">Evidence legend: CONFIRMED = permitted source proof or explicitly verified quote; STALE = expired quote; UNKNOWN = missing or unverified evidence. Records are read-only. Generated ',
    escapeHtml(generatedAt.toISOString()), '. This page never caches private commerce data and is not a public sales page.</footer>',
    '</main></body></html>',
  ];
  return page.join("");
}

function protectedHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
}

export async function handleCommerceOperationsRequest(request: Request, env: Env): Promise<Response> {
  const headers = protectedHeaders();
  if (!(await validateAccess(request, env))) {
    return json({ error: "Unauthorized" }, 401, headers);
  }
  if (request.method !== "GET") {
    return text("Method not allowed", 405, { ...headers, Allow: "GET" });
  }

  // Reuse existing private data routes. No new database, mutations or outbound calls.
  const authorizationHeaders = new Headers();
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (jwt) authorizationHeaders.set("Cf-Access-Jwt-Assertion", jwt);
  const sourceRequest = new Request(new URL("/api/admin/vendor-sourcing", request.url), {
    method: "GET", headers: authorizationHeaders,
  });
  const ordersRequest = new Request(new URL("/api/admin/procurement-orders", request.url), {
    method: "GET", headers: authorizationHeaders,
  });
  const results = await Promise.allSettled([
    handleVendorSourcingRequest(sourceRequest, env),
    handleShopifyProcurementAdminRequest(ordersRequest, env),
  ]);
  const responses = await Promise.all(results.map(async (result) => {
    if (result.status === "rejected" || !result.value.ok) return null;
    try { return await result.value.json(); } catch { return null; }
  }));
  return new Response(renderCommerceOperations(responses[0], responses[1]), {
    status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

// Pure, bounded owner-view projection of the JussPay private fulfillment queue.
// This is never used to assert payment, inventory, shipping, or dispatch authority.
export interface OwnerOrder {
  orderId: string;
  status: "awaiting_owner_dispatch" | "hold";
  holdReason: string | null;
  email: string | null;
  shippingSpeed: string | null;
  createdAt: number | null;
  shipTo: {
    name: string | null;
    phone: string | null;
    address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postal_code: string | null; country: string | null };
  };
  vendors: Record<string, Array<{ sku: string; name: string; quantity: number }>>;
  vendorPlans: Array<{ vendor: string; action: string; note: string | null; handoff: string | null; requirements: string[] }>;
}

const invalid = (): never => { throw new Error("invalid_jusspay_queue"); };
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const optionalText = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined) return null;
  return typeof value === "string" && value.length <= max ? value : invalid();
};
const requiredText = (value: unknown, max: number): string => {
  const text = optionalText(value, max);
  return text && text.length > 0 ? text : invalid();
};

export function normalizeOwnerQueue(payload: unknown): OwnerOrder[] {
  const raw = object(payload).queue;
  if (!Array.isArray(raw) || raw.length > 250) return invalid();
  return raw.map((entry) => {
    const row = object(entry);
    const orderId = requiredText(row.orderId, 45);
    if (!/^jbho_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orderId)) invalid();
    const status = row.status as OwnerOrder["status"];
    if (status !== "awaiting_owner_dispatch" && status !== "hold") invalid();
    const shipping = object(row.shipTo);
    const address = object(shipping.address);
    const vendors = object(row.vendors);
    if (Object.keys(vendors).length > 24) invalid();
    const sanitizedVendors: OwnerOrder["vendors"] = Object.create(null);
    for (const [vendor, entries] of Object.entries(vendors)) {
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(vendor) || !Array.isArray(entries) || entries.length > 100) return invalid();
      sanitizedVendors[vendor] = entries.map((entry) => {
        const item = object(entry);
        const quantity = item.quantity;
        if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 100) invalid();
        return { sku: requiredText(item.sku, 64), name: requiredText(item.name, 160), quantity: quantity as number };
      });
    }
    if (!Array.isArray(row.vendorPlans) || row.vendorPlans.length > 24) return invalid();
    const vendorPlans = row.vendorPlans.map((entry) => {
      const plan = object(entry);
      const requirements = plan.requirements === undefined ? [] : plan.requirements;
      if (!Array.isArray(requirements) || requirements.length > 16) return invalid();
      return { vendor: requiredText(plan.vendor, 40), action: requiredText(plan.action, 80),
        note: optionalText(plan.note, 600), handoff: optionalText(plan.handoff, 160),
        requirements: requirements.map((v) => requiredText(v, 100)) };
    });
    const createdAt = row.createdAt === null || row.createdAt === undefined ? null : row.createdAt;
    if (createdAt !== null && (typeof createdAt !== "number" || !Number.isSafeInteger(createdAt) || createdAt < 0)) invalid();
    return {
      orderId, status, holdReason: optionalText(row.holdReason, 100),
      email: optionalText(row.email, 320), shippingSpeed: optionalText(row.shippingSpeed, 32),
      createdAt: createdAt as number | null,
      shipTo: {
        name: optionalText(shipping.name, 200), phone: optionalText(shipping.phone, 80),
        address: {
          line1: optionalText(address.line1, 200), line2: optionalText(address.line2, 200),
          city: optionalText(address.city, 120), state: optionalText(address.state, 100),
          postal_code: optionalText(address.postal_code, 40), country: optionalText(address.country, 2),
        },
      },
      vendors: sanitizedVendors, vendorPlans,
    };
  });
}

const escape = (value: string | null | undefined): string =>
  String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export function renderOwnerQueuePage(orders: OwnerOrder[]): string {
  const sections = orders.map((row) => {
    const addr = row.shipTo.address;
    const place = [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).map(escape).join(", ");
    const vendors = Object.entries(row.vendors).map(([vendor, items]) =>
      `<section class="vendor"><h3>${escape(vendor)}</h3><ul>${items.map((x) => `<li>${escape(x.sku)} · ${escape(x.name)} · qty ${x.quantity}</li>`).join("")}</ul></section>`).join("");
    const plans = row.vendorPlans.map((plan) => `<li><strong>${escape(plan.vendor)}</strong> — ${escape(plan.action)}. ${escape(plan.handoff)}. ${escape(plan.note)}${plan.requirements.length ? `<ul>${plan.requirements.map((requirement) => `<li>${escape(requirement)}</li>`).join("")}</ul>` : ""}</li>`).join("");
    const holdWarning = row.status === "hold" ? `<p class="hold" role="alert">HOLD — DO NOT DISPATCH. Reason: ${escape(row.holdReason)}</p>` : "";
    return `<article><header><h2>${escape(row.orderId)}</h2><span class="status">${escape(row.status)}</span></header>${holdWarning}
      <p><strong>Ship to:</strong> ${escape(row.shipTo.name)} · ${place}</p>
      <p><strong>Contact:</strong> ${escape(row.email)} · ${escape(row.shipTo.phone)}</p>
      <p><strong>Shipping:</strong> ${escape(row.shippingSpeed)}</p>${vendors}<h3>Owner review plan</h3><ul>${plans}</ul></article>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JussPay owner fulfillment</title>
<style>body{background:#101923;color:#f0eadc;font:16px/1.6 system-ui,sans-serif;margin:auto;max-width:1100px;padding:24px}h1{font-size:clamp(1.6rem,3vw,2.5rem)}header{display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap}article{border:1px solid #48505a;border-radius:14px;padding:22px;margin:18px 0;background:#1a2530}h2{font-size:1.05rem;overflow-wrap:anywhere}h3{font-size:1rem;color:#ebd4a6}strong{color:#ebd4a6}.muted{color:#bfc9cf}.status{border:1px solid #a5adbc;border-radius:99px;padding:3px 12px}.vendor{border-top:1px solid #404a55;margin-top:12px}li{overflow-wrap:anywhere}a{color:#d1dcf2}.hold{border:1px solid #db9685;background:#4c2425;color:#ffe7dc;border-radius:10px;padding:12px;font-weight:700}</style></head>
<body><main><h1>JussPay owner fulfillment</h1><p class="muted">Read-only • Cloudflare Access owner authorization required • No orders are dispatched from this page.</p><p>${orders.length} active fulfillment record(s)</p>${sections || "<p>No orders awaiting owner review.</p>"}</main></body></html>`;
}

// Private owner-only JussPay fulfillment view. No public storefront export,
// payment mutation, or supplier dispatch capability is introduced here.
import { validateAccess } from "./access";
import { normalizeOwnerQueue, renderOwnerQueuePage } from "./jusspay-owner-model";
import { type Env, json, text } from "./shared";

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};
const MAX_QUEUE_RESPONSE_BYTES = 1024 * 1024;
const JUSSPAY_FULFILLMENT_URL = "https://jusspay.internal/jbh/fulfillment";

export async function handleJussPayOwnerRequest(request: Request, env: Env): Promise<Response> {
  // Access identity is validated on every request before inspecting private
  // bindings or reading customer addresses.
  if (!(await validateAccess(request, env))) {
    return json({error: "Unauthorized"}, 401, PRIVATE_HEADERS);
  }
  const pathname = new URL(request.url).pathname;
  const view = pathname === "/api/admin/jusspay/fulfillment/view";
  if (!view && pathname !== "/api/admin/jusspay/fulfillment") {
    return json({error: "Not found"}, 404, PRIVATE_HEADERS);
  }
  if (request.method !== "GET") {
    return text("Method not allowed", 405, {...PRIVATE_HEADERS, Allow: "GET"});
  }
  if (!env.JUSSPAY?.fetch || typeof env.JUSSPAY_OWNER_KEY !== "string" || env.JUSSPAY_OWNER_KEY.length < 32) {
    return json({error: "jusspay_owner_connection_unavailable"}, 503, PRIVATE_HEADERS);
  }
  try {
    // Never forward browser cookies, bearer tokens or caller-selected URLs.
    const upstream = await env.JUSSPAY.fetch(new Request(JUSSPAY_FULFILLMENT_URL, {
      method: "GET",
      headers: {"x-jbh-owner-key": env.JUSSPAY_OWNER_KEY},
    }));
    if (!upstream.ok || Number(upstream.headers.get("Content-Length") || 0) > MAX_QUEUE_RESPONSE_BYTES) {
      return json({error: "jusspay_queue_unavailable"}, 502, PRIVATE_HEADERS);
    }
    const raw = await upstream.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_QUEUE_RESPONSE_BYTES) {
      return json({error: "jusspay_queue_unavailable"}, 502, PRIVATE_HEADERS);
    }
    const orders = normalizeOwnerQueue(JSON.parse(raw));
    if (view) {
      return new Response(renderOwnerQueuePage(orders), {
        status: 200,
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      });
    }
    return json({source: "jusspay", readOnly: true, providerValidation: "not_rechecked_by_owner_view", queue: orders}, 200, PRIVATE_HEADERS);
  } catch {
    // Fail closed without logging secrets, order details, addresses or emails.
    return json({error: "jusspay_queue_unavailable"}, 502, PRIVATE_HEADERS);
  }
}

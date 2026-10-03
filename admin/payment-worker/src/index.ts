import { handleAdminRequest } from "./admin-orders";
import { handleProviderAdminRequest } from "./provider-admin";
import { enforcePrivateRateLimit } from "./rate-limit";
import { type Env, isApprovedHost, json, text } from "./shared";
import { handleShopifyProcurementAdminRequest } from "./shopify-procurement-admin";
import { handleShopifyPhysicalWebhook } from "./shopify-physical-webhook";
import { handleVendorSourcingRequest } from "./vendor-sourcing";
import { handleWebhook } from "./webhook";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isApprovedHost(request, env)) return text("Not found", 404);

    const limited = await enforcePrivateRateLimit(request, env);
    if (limited) return limited;

    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return json({ ok: true, service: "jbh-private-order-control" });
    }

    if (pathname === "/api/stripe/webhook") {
      return handleWebhook(request, env);
    }

    if (pathname === "/webhooks/shopify/orders-paid") {
      return handleShopifyPhysicalWebhook(request, env);
    }

    if (pathname === "/api/admin/providers") {
      return handleProviderAdminRequest(request, env);
    }

    if (pathname.startsWith("/api/admin/procurement-orders")) {
      return handleShopifyProcurementAdminRequest(request, env);
    }

    if (pathname.startsWith("/api/admin/vendor-sourcing")) {
      return handleVendorSourcingRequest(request, env);
    }

    if (pathname.startsWith("/api/admin/")) {
      return handleAdminRequest(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
};

import { handleAdminRequest } from "./admin-orders";
import { handleProviderAdminRequest } from "./provider-admin";
import { type Env, isApprovedHost, json, text } from "./shared";
import { handleShopifyProcurementAdminRequest } from "./shopify-procurement-admin";
import { handleShopifyPhysicalWebhook } from "./shopify-physical-webhook";
import { handleVendorSourcingRequest } from "./vendor-sourcing";
import { handleVendorAdapterRequest } from "./vendor-adapters";
import { handleWebhook } from "./webhook";
import { releaseIdentity } from "./release-identity";
import { handleJussPaySandboxReceipt } from "./jusspay-sandbox-receipt";
import { handleJussPayOwnerRequest } from "./jusspay-owner";
import { handleJussPayLiveReceipt, handleJussPayLiveReceiptReadiness } from "./jusspay-live-receipt";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isApprovedHost(request, env)) return text("Not found", 404);

    const { pathname } = new URL(request.url);
    if (pathname === "/version") {
      if (request.method !== "GET") return text("Method not allowed", 405, {Allow: "GET"});
      const release = releaseIdentity(env.RELEASE_SHA);
      return json(release.body, release.status);
    }

    if (pathname === "/health") {
      return json({ ok: true, service: "jbh-private-order-control" });
    }

    if (pathname === "/internal/jusspay/live/readiness") {
      return handleJussPayLiveReceiptReadiness(request, env);
    }

    if (pathname === "/internal/jusspay/live/paid-receipt") {
      return handleJussPayLiveReceipt(request, env);
    }

    if (pathname === "/internal/jusspay/sandbox/paid-receipt") {
      return handleJussPaySandboxReceipt(request, env);
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

    if (pathname === "/api/admin/vendor-adapters" || pathname.startsWith("/api/admin/vendor-adapters/")) {
      return handleVendorAdapterRequest(request, env);
    }

    if (pathname.startsWith("/api/admin/vendor-sourcing")) {
      return handleVendorSourcingRequest(request, env);
    }

    if (pathname === "/api/admin/jusspay/fulfillment" || pathname === "/api/admin/jusspay/fulfillment/view") {
      return handleJussPayOwnerRequest(request, env);
    }

    if (pathname.startsWith("/api/admin/")) {
      return handleAdminRequest(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
};
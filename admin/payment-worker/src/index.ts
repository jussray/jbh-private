import { handleAdminRequest } from "./admin-orders";
import { type Env, isApprovedHost, json, text } from "./shared";
import { handleWebhook } from "./webhook";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isApprovedHost(request, env)) return text("Not found", 404);

    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return json({ ok: true, service: "jbh-private-order-control" });
    }

    if (pathname === "/api/stripe/webhook") {
      return handleWebhook(request, env);
    }

    if (pathname.startsWith("/api/admin/")) {
      return handleAdminRequest(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
};

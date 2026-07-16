import { handleAdminOrderExport } from "./admin-export";
import { handleCheckout } from "./checkout";
import { type Env, isApprovedHost, json, text } from "./shared";
import { handleWebhook } from "./webhook";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isApprovedHost(request, env)) return text("Not found", 404);
    const { pathname } = new URL(request.url);
    if (pathname === "/api/checkout") return handleCheckout(request, env);
    if (pathname === "/api/stripe/webhook") return handleWebhook(request, env);
    if (pathname === "/api/admin/orders/export") {
      return handleAdminOrderExport(request, env);
    }
    return json({ error: "Not found" }, 404);
  },
};

// Cloudflare Access-protected owner runtime for supplier-specific review plans.
// No vendor contact, inventory mutation, payment or supplier dispatch occurs here.
import { validateAccess } from "./access";
import { planVendorReview, vendorAdapterManifest, VendorAdapterError, type VendorReviewInput } from "./vendor-adapters-model";
import { type Env, json, readBoundedText, text } from "./shared";

const privateHeaders: HeadersInit = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

export async function handleVendorAdapterRequest(request: Request, env: Env): Promise<Response> {
  if (!(await validateAccess(request, env))) {
    return json({error:"Unauthorized"}, 401, privateHeaders);
  }
  const path = new URL(request.url).pathname;
  if (path === "/api/admin/vendor-adapters") {
    if (request.method !== "GET") {
      return text("Method not allowed", 405, {...privateHeaders, Allow:"GET"});
    }
    return json({
      adapters: vendorAdapterManifest(),
      source: "jbh-private",
      paymentProof: "not_observed",
      supplierDispatch: "disabled_pending_verified_integration",
    }, 200, privateHeaders);
  }
  if (path === "/api/admin/vendor-adapters/preview") {
    if (request.method !== "POST") {
      return text("Method not allowed", 405, {...privateHeaders, Allow:"POST"});
    }
    try {
      const raw = await readBoundedText(request, 8192);
      const input = JSON.parse(raw) as VendorReviewInput;
      return json(planVendorReview(input), 200, privateHeaders);
    } catch (error) {
      if (error instanceof VendorAdapterError || error instanceof SyntaxError) {
        return json({error:"invalid_vendor_review"}, 400, privateHeaders);
      }
      return json({error:"vendor_review_unavailable"}, 503, privateHeaders);
    }
  }
  return json({error:"Not found"}, 404, privateHeaders);
}

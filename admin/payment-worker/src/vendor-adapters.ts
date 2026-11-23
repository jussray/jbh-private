// Cloudflare Access-protected owner runtime for supplier-specific review plans.
// No vendor contact, inventory mutation, payment or supplier dispatch occurs here.
import { validateAccess } from "./access";
import { planVendorReview, vendorAdapterManifest, VendorAdapterError, type VendorReviewInput } from "./vendor-adapters-model";
import { type Env, json, readBoundedText, text } from "./shared";
import { readDropshipBeautyProof, DropshipBeautyProofError } from "./dropship-beauty-proof";
import { SupplierSelectionError } from "./supplier-selection-model";
import { previewStoredSupplierSelection } from "./supplier-offer-store";
import privateVendorIntent from "../../data/vendor-selection-intent.json";

const privateHeaders: Record<string, string> = {
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
  if (path === "/api/admin/vendor-adapters/dropship-beauty/proof") {
    if (request.method !== "GET") {
      return text("Method not allowed", 405, {...privateHeaders, Allow:"GET"});
    }
    try {
      const proof = await readDropshipBeautyProof(env);
      return json(proof, proof.liveDispatchVerified ? 200 : 409, privateHeaders);
    } catch (error) {
      if (error instanceof DropshipBeautyProofError) {
        return json({error:error.code, vendor:"dropship-beauty", dispatchAuthority:false}, 503, privateHeaders);
      }
      return json({error:"dropship_beauty_proof_unavailable", vendor:"dropship-beauty", dispatchAuthority:false}, 503, privateHeaders);
    }
  }

  if (path === "/api/admin/vendor-adapters/selection-preview") {
    // Owner-authenticated, advisory-only. POSTed offers are NOT provider proof.
    // No Stripe call, vendor outreach, buyer address, or purchase is possible here.
    if (request.method !== "POST") {
      return text("Method not allowed", 405, {...privateHeaders, Allow:"POST"});
    }
    try {
      const raw = await readBoundedText(request, 32768);
      const input = JSON.parse(raw) as unknown;
      // Quotes are sourced from the private database, never from browser-submitted offers.
      const result = await previewStoredSupplierSelection(input, env, privateVendorIntent);
      return json(result, 200, privateHeaders);
    } catch (error) {
      if (error instanceof SupplierSelectionError &&
          error.code === "supplier_quote_database_unavailable") {
        return json({error:error.code}, 503, privateHeaders);
      }
      if (error instanceof SupplierSelectionError || error instanceof SyntaxError) {
        return json({error:"invalid_supplier_selection"}, 400, privateHeaders);
      }
      return json({error:"supplier_selection_unavailable"}, 503, privateHeaders);
    }
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

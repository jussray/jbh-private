import { neon } from "@neondatabase/serverless";
import { validateAccess } from "./access";
import { type Env, json, isApprovedHost } from "./shared";
import { reviewStorageStatus } from "./fulfillment-review-status-model";

// Private read-only diagnostic; never falls back to the payment database credential.
export async function handleFulfillmentReviewStatus(request: Request, env: Env): Promise<Response> {
  if (!isApprovedHost(request, env)) return json({error:"not_found"},404);
  if (!(await validateAccess(request, env))) return json({error:"unauthorized"},401);
  if (request.method !== "GET") return json({error:"method_not_allowed"},405,{Allow:"GET"});
  if (env.JBH_REVIEW_STATUS_ENABLED !== "true" || !env.JBH_REVIEW_DATABASE_URL) {
    return json({...reviewStorageStatus(null),error:"review_storage_not_configured"},503);
  }
  try {
    const sql = neon(env.JBH_REVIEW_DATABASE_URL);
    const rows = await sql`SELECT current_database() AS db, current_user AS role,
      to_regclass('public.jbh_fulfillment_review') IS NOT NULL AS ledger,
      COALESCE(has_table_privilege(current_user,to_regclass('public.jbh_fulfillment_review'),'SELECT'),false) AS can_select,
      COALESCE(has_table_privilege(current_user,to_regclass('public.jbh_fulfillment_review'),'INSERT'),false) AS can_insert,
      COALESCE(has_table_privilege(current_user,to_regclass('public.jbh_fulfillment_review'),'UPDATE'),false) AS can_update,
      COALESCE(has_table_privilege(current_user,to_regclass('public.jbh_fulfillment_review'),'DELETE'),false) AS can_delete,
      has_schema_privilege(current_user,'public','CREATE') AS can_create,
      rolsuper AS superuser, rolcreaterole AS create_role, rolcreatedb AS create_db, rolbypassrls AS bypass_rls,
      COALESCE(has_table_privilege(current_user,to_regclass('public.orders'),'SELECT'),false) AS orders_read,
      COALESCE(has_table_privilege(current_user,to_regclass('public.vendor_dispatch_bindings'),'SELECT'),false) AS dispatch_read
      FROM pg_roles WHERE rolname=current_user`;
    const status = reviewStorageStatus(rows.length === 1 ? rows[0] : null);
    return json(status,status.storageReady ? 200 : 503);
  } catch {
    return json({...reviewStorageStatus(null),error:"review_storage_unavailable"},503);
  }
}

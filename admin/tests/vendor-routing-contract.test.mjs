import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("vendor routing stays private, deterministic, and owner-gated", async () => {
  const [schema, migration, router, storage, api] = await Promise.all([
    read("shared/schema.ts"),
    read("migrations/003_private_vendor_routing.sql"),
    read("api/_lib/vendor-routing.ts"),
    read("api/_lib/storage.ts"),
    read("api/admin/vendor-routing.ts"),
  ]);

  for (const table of [
    "vendors",
    "vendor_product_mappings",
    "vendor_fulfillment_groups",
    "vendor_dispatch_jobs",
    "vendor_routing_exceptions",
  ]) {
    assert.match(schema, new RegExp(`\\"${table}\\"`));
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(migration, /route_paid_order_to_private_vendors/);
  assert.match(migration, /AFTER INSERT OR UPDATE OF payment_status ON orders/);
  assert.match(migration, /vendor_mapping_missing/);
  assert.match(migration, /needs_vendor_review/);
  assert.match(migration, /pending_owner_approval/);
  assert.doesNotMatch(migration, /DELETE FROM|TRUNCATE|DROP TABLE/i);

  assert.match(router, /buildVendorRoutingPlan/);
  assert.match(router, /duplicate_active_vendor_mapping/);
  assert.match(router, /mappingKey\(item\.id, item\.variant\)/);
  assert.match(router, /\.sort\(\(\[left\], \[right\]\) => left - right\)/);
  assert.match(router, /vendor_mapping_missing/);
  assert.match(router, /routing_plan_changed_after_group_creation/);

  assert.match(storage, /onConflictDoNothing/);
  assert.match(storage, /pending_owner_approval/);
  assert.match(storage, /queued_for_dispatch/);
  assert.match(storage, /vendorDispatchJobs/);
  assert.doesNotMatch(storage, /fetch\(|sendMail|nodemailer|RESEND_API_KEY/);

  assert.match(api, /await checkAdmin\(req, res\)/);
  assert.match(api, /register_vendor/);
  assert.match(api, /map_product/);
  assert.match(api, /route_order/);
  assert.match(api, /approve_group/);
  assert.match(api, /override_group/);
  assert.match(api, /queue_dispatch/);
  assert.match(api, /resolve_exception/);
  assert.doesNotMatch(api, /Access-Control-Allow-Origin|\*/);
});

test("dispatch remains an auditable queue, not a fabricated vendor contact", async () => {
  const [schema, storage] = await Promise.all([
    read("shared/schema.ts"),
    read("api/_lib/storage.ts"),
  ]);

  assert.match(schema, /status: text\(\"status\"\)\.notNull\(\)\.default\(\"queued\"\)/);
  assert.match(storage, /queueFulfillmentDispatch/);
  assert.match(storage, /status: \"queued_for_dispatch\"/);
  assert.match(storage, /status: \"queued\"/);
  assert.doesNotMatch(storage, /status: \"sent\"|status: \"accepted\"/);
});

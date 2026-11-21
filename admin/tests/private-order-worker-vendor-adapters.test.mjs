import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  VENDOR_ADAPTERS, vendorAdapterManifest, planVendorReview, VendorAdapterError,
} from "../../.worker-test-dist/vendor-adapters-model.js";
import { releaseIdentity } from "../../.worker-test-dist/release-identity.js";

const orderId="jbho_11111111-1111-4111-8111-111111111111";
const line=(sku,quantity=1)=>({sku,quantity});

test("faire uses received wholesale stock and cannot become a dropshipping adapter",()=>{
  const manifest=vendorAdapterManifest();
  assert.equal(manifest.faire.handoff,"owner-inventory");
  assert.match(manifest.faire.saleRule,/no-customer-dropshipping/);
  assert.ok(manifest.faire.requirements.includes("inventory_reservation"));
  assert.equal(manifest.faire.directSupplierOrderingEnabled,false);
  assert.equal(VENDOR_ADAPTERS.faire.kind,"wholesale-stock");
});

test("Dropship Beauty, DSers and manual vendors retain separate handoff capabilities",()=>{
  const m=vendorAdapterManifest();
  assert.equal(m["dropship-beauty"].handoff,"shopify-app-owner");
  assert.equal(m.dsers.handoff,"owner-approved-channel-or-csv");
  assert.equal(m["manual-procurement"].handoff,"owner-inventory-or-approved-quote");
  assert.ok(Object.values(m).every(v=>v.directSupplierOrderingEnabled===false));
});

test("private adapter groups split vendor orders but never assert payment or dispatch",()=>{
  const plan=planVendorReview({
    orderId,
    vendors:{
      "dropship-beauty":[line("BRAZ-SEW-BW-18",2)],
      faire:[line("FAIRE-OIL-01")],
      dsers:[line("DSERS-01")],
      "manual-procurement":[line("MANUAL-01")],
      "unknown-vendor":[line("OTHER-01")]
    }
  });
  assert.equal(plan.orderId,orderId);
  assert.equal(plan.authority,"review-only-not-a-payment-receipt");
  assert.equal(plan.hasVerifiedPayment,false);
  assert.equal(plan.directSupplierOrderingEnabled,false);
  assert.equal(plan.groups.length,5);
  assert.equal(plan.groups.find(v=>v.vendor==="faire").status,"awaiting_owner_evidence");
  assert.equal(plan.groups.find(v=>v.vendor==="unknown-vendor").status,"unsupported_vendor_quarantined");
  assert.ok(plan.groups.every(v=>v.autoDispatch===false));
  assert.equal(JSON.stringify(plan).includes("buyer@example.com"),false);
});

test("preview rejects malformed, duplicated or unbounded supplier line inputs",()=>{
  const invalid=[
    {orderId:"not-order",vendors:{faire:[line("FAIRE-01")]}},
    {orderId,vendors:{}},
    {orderId,vendors:{faire:[line("FAIRE-01"),line("FAIRE-01")]}},
    {orderId,vendors:{faire:[line("wrong-sku")]}},
    {orderId,vendors:{faire:[line("FAIRE-01",0)]}},
    {orderId,vendors:{faire:[line("FAIRE-01",101)]}},
  ];
  for(const value of invalid)assert.throws(()=>planVendorReview(value),error=>
    error instanceof VendorAdapterError&&error.code==="invalid_vendor_review");
});

test("vendor adapters are owner-authenticated and do not import a direct dispatch endpoint",async()=>{
  const [router,handler,model]=await Promise.all([
    readFile("admin/payment-worker/src/index.ts","utf8"),
    readFile("admin/payment-worker/src/vendor-adapters.ts","utf8"),
    readFile("admin/payment-worker/src/vendor-adapters-model.ts","utf8"),
  ]);
  assert.match(router,/handleVendorAdapterRequest/);
  assert.match(router,/\/api\/admin\/vendor-adapters/);
  assert.match(handler,/await validateAccess\(request, env\)/);
  assert.match(handler,/readBoundedText\(request, 8192\)/);
  assert.match(handler,/planVendorReview\(input\)/);
  assert.doesNotMatch(handler,/fetch\(|\.send\(|\.dispatch\(|stripeClient\(/);
  assert.doesNotMatch(model,/fetch\(|\.dispatch\(|stripeClient\(/);
});

test("release identity fails closed without an explicit 40-character Git commit",()=>{
  for(const missing of [undefined,null,"",42,"main","abc123", "z".repeat(40), "a".repeat(39)]){
    const result=releaseIdentity(missing);
    assert.equal(result.status,503);
    assert.equal(result.body.ok,false);
    assert.equal(result.body.sha,null);
    assert.equal(result.body.error,"release_sha_unconfigured");
  }
  const sha="ABCDEF1234567890ABCDEF1234567890ABCDEF12";
  const valid=releaseIdentity(sha);
  assert.equal(valid.status,200);
  assert.equal(valid.body.sha,sha.toLowerCase());
  assert.equal(valid.body.service,"jbh-private-payment-control");
});

test("private Worker exposes version readback before liveness without authorizing sales",async()=>{
  const source=await readFile("admin/payment-worker/src/index.ts","utf8");
  assert.match(source,/pathname === "\/version"/);
  assert.match(source,/releaseIdentity\(env\.RELEASE_SHA\)/);
  assert.match(source,/return json\(release\.body, release\.status\)/);
  assert.ok(source.indexOf('pathname === "/version"')<source.indexOf('pathname === "/health"'));
});

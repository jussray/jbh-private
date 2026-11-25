import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {normalizeOwnerQueue, renderOwnerQueuePage} from "../../.worker-test-dist/jusspay-owner-model.js";

const read=(path)=>readFile(path,"utf8");
const sample=()=>({
  queue:[{orderId:"jbho_11111111-1111-4111-8111-111111111111",status:"awaiting_owner_dispatch",
    email:"buyer@example.test",shippingSpeed:"standard",createdAt:1795400000000,
    shipTo:{name:"Jane <script>alert(1)</script>",phone:"555-0100",
      address:{line1:"123 Market St",line2:null,city:"Pittsburgh",state:"PA",postal_code:"15201",country:"US"}},
    vendors:{"dropship-beauty":[{sku:"SKU-14",name:"Body Wave & Shine",quantity:1}]},
    vendorPlans:[{vendor:"dropship-beauty",action:"owner_review",note:"review",autoDispatch:false}],
    secretInjected:"should-never-surface"}]
});
test("owner queue projection preserves shipping and vendor work but excludes unexpected fields",()=>{
  const [order]=normalizeOwnerQueue(sample());
  assert.equal(order.orderId,"jbho_11111111-1111-4111-8111-111111111111");
  assert.equal(order.shipTo.address.line1,"123 Market St");
  assert.equal(order.vendors["dropship-beauty"][0].sku,"SKU-14");
  assert.equal(order.secretInjected,undefined);
});
test("owner queue rejects malformed or unexpectedly large provider responses",()=>{
  const invalid=[null,{}, {queue:{}},{queue:[{orderId:"bad",status:"paid"}]},
    {queue:[{...sample().queue[0],status:"dispatched"}]},
    {queue:[{...sample().queue[0],email:42}]},
    {queue:Array(251).fill(sample().queue[0])}];
  for(const value of invalid)assert.throws(()=>normalizeOwnerQueue(value),/invalid_jusspay_queue/);
});
test("owner HTML escapes customer fields, never injects scripts or keys, remains read-only",()=>{
  const html=renderOwnerQueuePage(normalizeOwnerQueue(sample()));
  assert.match(html,/JussPay owner fulfillment/);
  assert.match(html,/Jane &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script[\s>]/i);
  assert.doesNotMatch(html,/should-never-surface|x-jbh-owner-key/);
  assert.match(html,/Read-only/);
});
test("owner API is Access protected, private service-bound and never receives payment activation",async()=>{
  const [index,handler,wrangler,shared]=await Promise.all([
    read("admin/payment-worker/src/index.ts"),read("admin/payment-worker/src/jusspay-owner.ts"),
    read("wrangler.toml"),read("admin/payment-worker/src/shared.ts")
  ]);
  assert.match(index,/handleJussPayOwnerRequest/);
  assert.match(index,/\/api\/admin\/jusspay\/fulfillment/);
  assert.match(handler,/await validateAccess\(request, env\)/);
  assert.match(handler,/request.method !== "GET"/);
  assert.match(handler,/env\.JUSSPAY\.fetch/);
  assert.match(handler,/https:\/\/jusspay\.internal\/jbh\/fulfillment/);
  assert.match(handler,/x-jbh-owner-key/);
  assert.match(handler,/Content-Security-Policy/);
  assert.doesNotMatch(handler,/\.dispatch\(|checkout\/sessions|STRIPE_SECRET_KEY|JBH_LIVE_CHARGES_APPROVED/);
  assert.match(wrangler,/binding = "JUSSPAY"/);
  assert.match(wrangler,/service = "jusspay"/);
  assert.match(shared,/JUSSPAY_OWNER_KEY/);
  assert.doesNotMatch(wrangler,/JUSSPAY_OWNER_KEY/);
});

test("refund and dispute holds visibly block dispatch and escape owner plans",()=>{
  const body=sample();
  body.queue[0].status="hold";
  body.queue[0].holdReason='charge.dispute.created';
  body.queue[0].vendorPlans=[{vendor:"dropship-beauty",action:"owner_review",
    handoff:"shopify-app-owner",note:"Never dispatch without proof <img src=x>",
    requirements:["verified_sku","approved handoff & inventory"]}];
  const [order]=normalizeOwnerQueue(body);
  assert.equal(order.holdReason,"charge.dispute.created");
  assert.deepEqual(order.vendorPlans[0].requirements,["verified_sku","approved handoff & inventory"]);
  const html=renderOwnerQueuePage([order]);
  assert.match(html,/HOLD — DO NOT DISPATCH/);
  assert.match(html,/charge\.dispute\.created/);
  assert.match(html,/approved handoff &amp; inventory/);
  assert.match(html,/&lt;img src=x&gt;/);
  assert.doesNotMatch(html,/<img[\s>]/i);
});
test("oversized review plan contracts are not silently accepted",()=>{
  const body=sample();
  body.queue[0].vendorPlans[0].requirements=Array(17).fill("x");
  assert.throws(()=>normalizeOwnerQueue(body),/invalid_jusspay_queue/);
});
test("private upstream never follows secret-bearing redirects or buffers unlimited responses",async()=>{
  const handler=await read("admin/payment-worker/src/jusspay-owner.ts");
  assert.match(handler,/redirect: "manual"/);
  assert.match(handler,/readLimitedResponse\(upstream\)/);
  assert.match(handler,/response\.body\.getReader\(\)/);
  assert.match(handler,/length > MAX_QUEUE_RESPONSE_BYTES/);
  assert.doesNotMatch(handler,/await upstream\.text\(\)/);
});

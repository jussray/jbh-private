import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolvePaymentDeployBindings } from "../../scripts/resolve-payment-deploy-bindings.mjs";
const fixture={bindings:[
  {name:"SHOPIFY_ADMIN_API_VERSION",type:"plain_text",text:"2026-10"},
  {name:"DROPSHIP_BEAUTY_LOCATION_GID",type:"plain_text",text:"gid://shopify/Location/123"},
  {name:"UNRELATED_SECRET",type:"secret_text",text:"not-for-output"}
]};
test("resolve only existing validated payment settings; never output secrets",()=>{
  const out=resolvePaymentDeployBindings(fixture);
  assert.deepEqual(out,{SHOPIFY_ADMIN_API_VERSION:"2026-10",DROPSHIP_BEAUTY_LOCATION_GID:"gid://shopify/Location/123"});
  assert.doesNotMatch(JSON.stringify(out),/not-for-output/);
  for(const bindings of [
    fixture.bindings.slice(1),
    [...fixture.bindings,fixture.bindings[0]],
    fixture.bindings.map(b=>b.name==="SHOPIFY_ADMIN_API_VERSION"?{...b,text:"unstable"}:b),
    fixture.bindings.map(b=>b.name==="DROPSHIP_BEAUTY_LOCATION_GID"?{...b,text:"gid://shopify/Product/123"}:b),
    fixture.bindings.map(b=>b.name==="SHOPIFY_ADMIN_API_VERSION"?{...b,type:"secret_text"}:b)
  ])assert.throws(()=>resolvePaymentDeployBindings({bindings}));
});
test("deployment workflows keep owner approval and derive operational inputs",()=>{
  const read=n=>readFileSync(new URL("../../.github/workflows/"+n,import.meta.url),"utf8");
  const contact=read("deploy-contact-ingress.yml"),payment=read("deploy-private-payment-control.yml");
  for(const workflow of [contact,payment]){
    assert.match(workflow,/inputs\.approve_deployment == true/);
    assert.match(workflow,/github\.actor == github\.repository_owner/);
    assert.match(workflow,/github\.triggering_actor == github\.repository_owner/);
    assert.match(workflow,/default: false/);
    assert.match(workflow,/EXPECTED_HEAD_SHA: \$\{\{ github\.sha \}\}/);
    assert.match(workflow,/wrangler deploy --strict/);
    assert.doesNotMatch(workflow,/inputs\.(approval_phrase|route_pattern|zone_name|allowed_origins|allowed_hostnames)/);
  }
  for(const name of ["CONTACT_ROUTE_PATTERN","CONTACT_ZONE_NAME","ALLOWED_CONTACT_ORIGINS","ALLOWED_CONTACT_HOSTNAMES"])
    assert.ok(contact.includes(name+": ${{ vars."+name+" }}"));
  assert.match(contact,/Production membrane failed: repository must be private/);
  assert.match(contact,/Production membrane failed: main branch must be protected/);
  assert.match(payment,/node scripts\/resolve-payment-deploy-bindings\.mjs/);
  assert.doesNotMatch(payment,/--var "SHOPIFY_ADMIN_API_VERSION:20[0-9]{2}-/);
  assert.doesNotMatch(payment,/--var "DROPSHIP_BEAUTY_LOCATION_GID:gid:/);
});

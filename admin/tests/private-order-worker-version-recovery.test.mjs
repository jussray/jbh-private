import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recoveryPlan, verifyStaged, singleActiveVersion, verifyBundleReadback, resolveRecoveryVersion } from "../../scripts/private-worker-version-recovery.mjs";

const old = "11111111-1111-4111-8111-111111111111";
const next = "22222222-2222-4222-8222-222222222222";
const release = "a".repeat(40);
const bindings = [
  {name:"RELEASE_SHA",type:"plain_text",text:"b".repeat(40)},
  {name:"JUSSPAY",type:"service",service:"jusspay",environment:"production"},
  {name:"JUSSPAY_OWNER_KEY",type:"secret_text"},
  {name:"CF_ACCESS_ALLOWED_EMAILS",type:"secret_text"},
  {name:"CF_ACCESS_AUD",type:"plain_text",text:"fixture"},
  {name:"CF_ACCESS_TEAM_DOMAIN",type:"plain_text",text:"fixture"},
  {name:"JBH_STRIPE_SECRET_KEY",type:"secret_text"},
  {name:"DROPSHIP_BEAUTY_LOCATION_GID",type:"plain_text",text:"fixture"},
  {name:"SHOPIFY_ADMIN_API_VERSION",type:"plain_text",text:"2026-10"},
  {name:"SHOPIFY_SHOP_DOMAIN",type:"plain_text",text:"fixture"},
  {name:"WORKER_HOST",type:"plain_text",text:"fixture"},
];
const version = {id:old,compatibility_date:"2026-08-01",compatibility_flags:["nodejs_compat"],usage_model:"standard",bindings};
const opts = {activeVersion:old,expectedVersion:old,release};
test("pins every existing binding to the active version except release SHA; never copies secret values",()=>{
  const plan=recoveryPlan({...version,bindings:bindings.map(b=>b.type==="secret_text"?{...b,text:"must-not-copy"}:b)},opts);
  assert.equal(plan.bindings.length,bindings.length);
  assert.deepEqual(plan.bindings.find(b=>b.name==="RELEASE_SHA"),{name:"RELEASE_SHA",type:"plain_text",text:release});
  for(const b of plan.bindings.filter(b=>b.name!=="RELEASE_SHA")) assert.deepEqual(b,{name:b.name,type:"inherit",version_id:old});
  assert.doesNotMatch(JSON.stringify(plan),/must-not-copy/);
});
test("rejects unexpected active version, missing or duplicated bindings, wrong service, and activation drift",()=>{
  assert.throws(()=>recoveryPlan(version,{...opts,activeVersion:next}));
  for(const bs of [bindings.slice(1),[...bindings,bindings[0]],bindings.map(b=>b.name==="JUSSPAY"?{...b,service:"other"}:b),[...bindings,{name:"JBH_JUSSPAY_LIVE_RECEIPTS_ENABLED",type:"plain_text",text:"true"}]])assert.throws(()=>recoveryPlan({...version,bindings:bs},opts));
});
test("requires exactly one active version at 100 percent",()=>{
  assert.equal(singleActiveVersion({deployments:[{versions:[{version_id:old,percentage:100}]}]}),old);
  assert.throws(()=>singleActiveVersion({deployments:[{versions:[{version_id:old,percentage:90},{version_id:next,percentage:10}]}]}));
});
test("checks staged identity, unchanged binding names/types, service target, and release",()=>{
  const staged={...version,id:next,bindings:bindings.map(b=>b.name==="RELEASE_SHA"?{...b,text:release}:b)};
  assert.doesNotThrow(()=>verifyStaged(version,staged,release));
  assert.throws(()=>verifyStaged(version,{...staged,id:old},release));
  assert.throws(()=>verifyStaged(version,{...staged,bindings:staged.bindings.slice(1)},release));
  assert.throws(()=>verifyStaged(version,{...staged,bindings:staged.bindings.map(b=>b.name==="CF_ACCESS_AUD"?{...b,text:"changed"}:b)},release));
  assert.throws(()=>verifyStaged(version,{...staged,bindings:staged.bindings.map(b=>b.name==="JUSSPAY"?{...b,service:"wrong"}:b)},release));
});

test("requires provider readback of the exact staged module bytes and release tag",()=>{
  const expected=Buffer.from("export default {};\n");
  const staged={main_module:"index.js",annotations:{"workers/tag":release},modules:[{name:"index.js",content_type:"application/javascript+module",content_base64:expected.toString("base64")}]};
  assert.doesNotThrow(()=>verifyBundleReadback(staged,"index.js",expected,release));
  for(const changed of [
    {...staged,main_module:"other.js"},
    {...staged,annotations:{"workers/tag":"b".repeat(40)}},
    {...staged,modules:[]},
    {...staged,modules:[{...staged.modules[0],content_base64:Buffer.from("different").toString("base64")}]},
    {...staged,modules:[...staged.modules,staged.modules[0]]}
  ])assert.throws(()=>verifyBundleReadback(changed,"index.js",expected,release));
});

test("discovers the unique active version automatically and rejects stale explicit pins",()=>{
  const response={deployments:[{versions:[{version_id:old,percentage:100}]}]};
  assert.equal(resolveRecoveryVersion(response),old);
  assert.equal(resolveRecoveryVersion(response,old),old);
  assert.throws(()=>resolveRecoveryVersion(response,next));
  assert.throws(()=>resolveRecoveryVersion(response,"latest"));
  assert.throws(()=>resolveRecoveryVersion({deployments:[]}));
  assert.throws(()=>resolveRecoveryVersion({deployments:[{versions:[{version_id:old,percentage:50},{version_id:next,percentage:50}]}]}));
});

test("owner recovery workflow derives inputs without removing explicit approval",()=>{
  const workflow=readFileSync(new URL("../../.github/workflows/stage-private-worker-recovery.yml",import.meta.url),"utf8");
  assert.match(workflow,/approve_staging:\s*\n[\s\S]*?type: boolean\s*\n\s*default: false/);
  assert.match(workflow,/inputs\.approve_staging == true/);
  assert.match(workflow,/github\.actor == github\.repository_owner/);
  assert.match(workflow,/github\.triggering_actor == github\.repository_owner/);
  assert.match(workflow,/EXPECTED_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow,/inputs\.(expected_head_sha|active_version|approval_phrase)/);
  assert.doesNotMatch(workflow,/JBH_RECOVERY_ACTIVE_VERSION:/);
  assert.equal((workflow.match(/node scripts\/private-worker-version-recovery\.mjs --stage/g)||[]).length,1);
});

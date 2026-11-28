import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WORKER = "jbh-private-payment-control";
const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const inventory = {
  CF_ACCESS_ALLOWED_EMAILS:"secret_text",
  CF_ACCESS_AUD:"plain_text",
  CF_ACCESS_TEAM_DOMAIN:"plain_text",
  DROPSHIP_BEAUTY_LOCATION_GID:"plain_text",
  JBH_STRIPE_SECRET_KEY:"secret_text",
  JUSSPAY:"service",
  JUSSPAY_OWNER_KEY:"secret_text",
  RELEASE_SHA:"plain_text",
  SHOPIFY_ADMIN_API_VERSION:"plain_text",
  SHOPIFY_SHOP_DOMAIN:"plain_text",
  WORKER_HOST:"plain_text",
};
function requireThat(ok, code) { if (!ok) throw new Error(code); }

function checkedBindings(version) {
  requireThat(Array.isArray(version?.bindings), "binding_inventory_unavailable");
  const entries = new Map();
  for (const b of version.bindings) {
    requireThat(b && typeof b.name==="string" && Object.hasOwn(inventory,b.name) &&
      inventory[b.name]===b.type && !entries.has(b.name), "unexpected_binding_inventory");
    if (b.type==="plain_text") requireThat(typeof b.text==="string", "plain_binding_unavailable");
    entries.set(b.name,b);
  }
  requireThat(entries.size===Object.keys(inventory).length, "missing_binding");
  const service=entries.get("JUSSPAY");
  requireThat(service.service==="jusspay" && service.environment==="production" &&
    !service.entrypoint, "unexpected_jusspay_target");
  requireThat(SHA.test(entries.get("RELEASE_SHA").text), "invalid_release_binding");
  return entries;
}

function runtime(version) {
  requireThat(version.compatibility_date==="2026-08-01" &&
    Array.isArray(version.compatibility_flags) &&
    version.compatibility_flags.length===1 &&
    version.compatibility_flags[0]==="nodejs_compat", "runtime_configuration_drift");
  requireThat(["standard","bundled","unbound"].includes(version.usage_model), "usage_model_unavailable");
  return {compatibility_date:version.compatibility_date,
    compatibility_flags:[...version.compatibility_flags],usage_model:version.usage_model};
}

export function singleActiveVersion(response) {
  const versions=response?.deployments?.[0]?.versions;
  requireThat(Array.isArray(versions) && versions.length===1 &&
    versions[0].percentage===100 && VERSION.test(versions[0].version_id), "active_version_not_unique");
  return versions[0].version_id;
}

export function resolveRecoveryVersion(response,explicitPin) {
  const active=singleActiveVersion(response);
  requireThat(explicitPin===undefined || (VERSION.test(explicitPin) && explicitPin===active),
    "active_version_pin_mismatch");
  return active;
}

export function recoveryPlan(version,{activeVersion,expectedVersion,release}) {
  requireThat(VERSION.test(expectedVersion) && activeVersion===expectedVersion &&
    version?.id===expectedVersion && SHA.test(release), "version_or_release_mismatch");
  const current=checkedBindings(version);
  const settings=runtime(version);
  return {...settings,bindings:[...current.keys()].map(name=>name==="RELEASE_SHA"?
    {name,type:"plain_text",text:release}:{name,type:"inherit",version_id:expectedVersion})};
}

export function verifyStaged(previous,staged,release) {
  requireThat(VERSION.test(staged?.id) && staged.id!==previous.id && SHA.test(release), "staged_version_invalid");
  const before=checkedBindings(previous), after=checkedBindings(staged);
  requireThat(JSON.stringify(runtime(previous))===JSON.stringify(runtime(staged)), "staged_runtime_drift");
  for(const [name,b] of before) {
    const a=after.get(name);
    if(b.type==="plain_text") requireThat(a.text===(name==="RELEASE_SHA"?release:b.text), "staged_plain_binding_drift");
    if(b.type==="service") requireThat(a.service===b.service && a.environment===b.environment &&
      a.entrypoint===b.entrypoint, "staged_service_drift");
  }
}

export function verifyBundleReadback(staged,name,expected,release) {
  requireThat(staged?.main_module===name && staged.annotations?.["workers/tag"]===release &&
    Array.isArray(staged.modules) && staged.modules.length===1,"staged_module_inventory_mismatch");
  const m=staged.modules[0];
  requireThat(m?.name===name && m.content_type==="application/javascript+module" &&
    typeof m.content_base64==="string" && m.content_base64===expected.toString("base64"),"staged_module_bytes_mismatch");
}

async function run() {
  const mode=process.argv[2]||"--preflight";
  requireThat(["--preflight","--stage"].includes(mode) && process.argv.length<=3,"invalid_mode");
  const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
  const explicitPin=process.env.JBH_RECOVERY_ACTIVE_VERSION,release=process.env.EXPECTED_HEAD_SHA;
  requireThat(/^[a-f0-9]{32}$/i.test(account||"") && typeof token==="string" && token.length>0 &&
    (explicitPin===undefined || VERSION.test(explicitPin)) && SHA.test(release||""),"missing_recovery_configuration");
  const git=(args)=>execFileSync("git",args,{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
  const root=git(["rev-parse","--show-toplevel"]);
  requireThat(resolve(process.cwd())===resolve(root),"run_from_repository_root");
  requireThat(git(["rev-parse","HEAD"])===release && git(["status","--porcelain"])==="","checkout_not_exact_or_clean");
  if(mode==="--stage") requireThat(process.env.JBH_RECOVERY_APPROVAL==="STAGE_JBH_WORKER_VERSION","explicit_staging_approval_required");
  async function assertMain() {
    const r=await fetch("https://api.github.com/repos/jussray/jbh-private/git/ref/heads/main",{headers:{Accept:"application/vnd.github+json","User-Agent":"jbh-version-recovery"},redirect:"error",signal:AbortSignal.timeout(15000)});
    requireThat(r.ok,"main_readback_failed");
    const d=await r.json();
    requireThat(d?.object?.sha===release,"approved_head_not_current_main");
  }
  const apiRoot="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/";
  const named="scripts/"+WORKER, beta="workers/"+WORKER;
  async function cf(path,body) {
    const r=await fetch(apiRoot+path,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+token,Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"error",signal:AbortSignal.timeout(60000)});
    requireThat(r.ok,"provider_http_"+r.status);
    const d=await r.json();
    requireThat(d.success===true && d.result,"provider_response_failed");
    return d.result;
  }
  const active=async()=>singleActiveVersion(await cf(named+"/deployments"));
  await assertMain();
  // Resolve once, then use this immutable pin for the entire staging operation.
  const expectedVersion=resolveRecoveryVersion(await cf(named+"/deployments"),explicitPin);
  const before=await cf(beta+"/versions/"+expectedVersion);
  const plan=recoveryPlan(before,{activeVersion:await active(),expectedVersion,release});
  requireThat(before.source==="api","recovery_requires_script_api_provenance");
  const receipt={schema:"jbh-worker-recovery@v1",releaseSha:release,activeVersion:expectedVersion,
    inheritedBindings:plan.bindings.filter(b=>b.type==="inherit").length,
    staged:false,productionTrafficChanged:false};
  if(mode==="--preflight"){console.log(JSON.stringify(receipt));return;}
  // No production credentials are passed to build/test subprocesses.
  const env={};
  for(const k of ["PATH","HOME","TMPDIR","TMP","TEMP","SystemRoot","USERPROFILE"])
    if(process.env[k]!==undefined)env[k]=process.env[k];
  env.CI="true";
  env.EXPECTED_HEAD_SHA=release;
  const dir=mkdtempSync(join(tmpdir(),"jbh-recovery-"));
  try {
    execFileSync("npm",["run","verify:worker:cloudflare"],{env,stdio:"inherit"});
    execFileSync("npx",["--no-install","wrangler","deploy","--dry-run","--strict","--config","wrangler.toml","--outdir",dir],{env,stdio:"inherit"});
    const entries=readdirSync(dir,{withFileTypes:true});
    const js=entries.filter(e=>e.isFile()&&/^[A-Za-z0-9_-]+\.js$/.test(e.name));
    requireThat(js.length===1 && entries.every(e=>e.isFile()&&(e.name===js[0].name||e.name===js[0].name+".map"||e.name==="README.md")),"unsupported_bundle_layout");
    const module=readFileSync(join(dir,js[0].name));
    requireThat(module.length>0,"empty_bundle");
    const digest=createHash("sha256").update(module).digest("hex");
    requireThat(git(["rev-parse","HEAD"])===release && git(["status","--porcelain"])==="","checkout_changed_during_build");
    await assertMain();
    requireThat(await active()===expectedVersion,"active_version_changed");
    // Pin every inherited binding to the reviewed version. No deploy endpoint,
    // no implicit latest-version inheritance, no routes or secrets mutations.
    const staged=await cf(beta+"/versions?deploy=false",{
      ...plan,main_module:js[0].name,
      modules:[{name:js[0].name,content_type:"application/javascript+module",content_base64:module.toString("base64")}],
      annotations:{"workers/tag":release,"workers/message":"Guarded JBH recovery candidate; no traffic"}
    });
    requireThat(VERSION.test(staged.id),"staging_response_invalid");
    const readback=await cf(beta+"/versions/"+staged.id+"?include=modules");
    verifyStaged(before,readback,release);
    verifyBundleReadback(readback,js[0].name,module,release);
    requireThat(await active()===expectedVersion,"active_version_changed_after_stage");
    await assertMain();
    console.log(JSON.stringify({...receipt,staged:true,candidateVersion:staged.id,bundleSha256:digest}));
  } finally {rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  run().catch(error=>{const code=String(error?.message||"");
    console.error(/^[a-z0-9_]+$/.test(code)?code:"recovery_failed_no_promotion");
    process.exitCode=1;});
}

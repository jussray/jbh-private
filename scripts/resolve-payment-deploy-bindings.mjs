import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rules={
  SHOPIFY_ADMIN_API_VERSION:/^20[0-9]{2}-(01|04|07|10)$/,
  DROPSHIP_BEAUTY_LOCATION_GID:/^gid:\/\/shopify\/Location\/[1-9][0-9]*$/
};

export function resolvePaymentDeployBindings(settings){
  if(!Array.isArray(settings?.bindings))throw Error("binding_inventory_unavailable");
  const result={};
  for(const [name,rule] of Object.entries(rules)){
    const matches=settings.bindings.filter(b=>b?.name===name);
    if(matches.length!==1 || matches[0].type!=="plain_text" || typeof matches[0].text!=="string" || !rule.test(matches[0].text))
      throw Error("payment_binding_missing_or_invalid_"+name);
    result[name]=matches[0].text;
  }
  return result;
}

async function run(){
  const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN, destination=process.env.GITHUB_ENV;
  if(!/^[a-f0-9]{32}$/i.test(account||"")||!token||!destination)throw Error("missing_provider_configuration");
  const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/jbh-private-payment-control/settings",{
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(15000)
  });
  if(!r.ok)throw Error("provider_http_"+r.status);
  const data=await r.json();
  if(data.success!==true)throw Error("provider_response_failed");
  const result=resolvePaymentDeployBindings(data.result);
  appendFileSync(destination,Object.entries(result).map(([k,v])=>k+"="+v+"\n").join(""));
  console.log("Validated existing payment deployment settings; values omitted.");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  run().catch(e=>{const m=String(e?.message||"");console.error(/^[A-Za-z0-9_]+$/.test(m)?m:"payment_binding_resolution_failed");process.exitCode=1;});

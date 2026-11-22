// Release identity is a proof input, never an inferred Cloudflare deployment SHA.
// Cloudflare does not inject GitHub SHA into Worker env by default.
const EXACT_SHA=/^[0-9a-f]{40}$/i;

export function releaseIdentity(value: unknown) {
  if(typeof value!=="string"||!EXACT_SHA.test(value)){
    return {status:503,body:{ok:false,service:"jbh-private-payment-control",sha:null,
      error:"release_sha_unconfigured"}} as const;
  }
  return {status:200,body:{ok:true,service:"jbh-private-payment-control",sha:value.toLowerCase()}} as const;
}

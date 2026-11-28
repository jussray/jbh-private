// Review-only persistence. The query callback is a server-owned parameterized SQL executor.
const TENANT='jussbeautifulhair.com';
const token=(s,re)=>typeof s==='string'&&re.test(s);
const money=n=>Number.isSafeInteger(n)&&n>=0;
const keys=['canonicalSku','evidenceFingerprint','grossMarginCents','landedCostCents','orderId','quantity','supplierSku','vendorId'];
export function createReviewStore(query){
 if(typeof query!=='function')throw Error('INVALID_STORAGE');
 return {async reserve(input){
  if(!input||Object.keys(input).sort().join(',')!==keys.join(',')||!token(input.orderId,/^[A-Za-z0-9_-]{1,128}$/)||!token(input.canonicalSku,/^JBH-[A-Z0-9-]{1,59}$/)||!token(input.vendorId,/^[a-z0-9][a-z0-9-]{1,39}$/)||!token(input.supplierSku,/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/)||!token(input.evidenceFingerprint,/^[a-f0-9]{64}$/)||!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>100||!money(input.landedCostCents)||!money(input.grossMarginCents)||input.grossMarginCents===0)throw Error('INVALID_REVIEW');
  const payload={tenant:TENANT,...Object.fromEntries(keys.map(k=>[k,input[k]])),status:'review_only',liveDispatch:false,chargesCollected:false};
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const identity=[TENANT,input.orderId,input.canonicalSku];
  const rows=await query('INSERT INTO jbh_fulfillment_review (tenant,order_id,canonical_sku,fingerprint,payload) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (tenant,order_id,canonical_sku) DO NOTHING RETURNING fingerprint,payload',[...identity,fingerprint,JSON.stringify(payload)]);
  const created=rows.length===1;
  const result=created?rows:await query('SELECT fingerprint,payload FROM jbh_fulfillment_review WHERE tenant=$1 AND order_id=$2 AND canonical_sku=$3',identity);
  if(result.length!==1||result[0].fingerprint!==fingerprint)throw Error('REVIEW_CONFLICT');
  const record=result[0].payload;if(!record||Object.keys(record).length!==Object.keys(payload).length||Object.keys(payload).some(k=>record[k]!==payload[k]))throw Error('REVIEW_READBACK_MISMATCH');
  return {created,entry:record};
 }};
}

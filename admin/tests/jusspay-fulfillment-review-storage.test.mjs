import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewStore} from '../payment-worker/src/worker-storage.mjs';
const intent={orderId:'review-123',canonicalSku:'JBH-BW-14',vendorId:'dsers',supplierSku:'SAMPLE-14',quantity:2,landedCostCents:8000,grossMarginCents:7000,evidenceFingerprint:'a'.repeat(64)};
// Simulated database with atomic unique insertion. Not real Neon execution.
function fake(){const data=new Map();return async (sql,params)=>{assert.match(sql,/jbh_fulfillment_review/);assert.equal(params[0],'jussbeautifulhair.com');const k=JSON.stringify(params.slice(0,3));if(sql.startsWith('INSERT')){if(data.has(k))return [];const row={fingerprint:params[3],payload:JSON.parse(params[4])};data.set(k,row);return [structuredClone(row)];}return data.has(k)?[structuredClone(data.get(k))]:[];};}
test('concurrent identical review intents have one insertion',async()=>{const store=createReviewStore(fake());const rs=await Promise.all(Array.from({length:12},()=>store.reserve(intent)));assert.equal(rs.filter(x=>x.created).length,1);assert.ok(rs.every(x=>x.entry.liveDispatch===false));});
test('conflicting quantity and supplier retries fail closed',async()=>{const store=createReviewStore(fake());await store.reserve(intent);for(const changed of [{quantity:3},{vendorId:'other'},{supplierSku:'OTHER'}])await assert.rejects(store.reserve({...intent,...changed}),/REVIEW_CONFLICT/);});
test('fixed tenant scope rejects other tenant inputs',async()=>{const store=createReviewStore(fake());await assert.rejects(store.reserve({...intent,tenant:'protect.jussco.company'}),/INVALID_REVIEW/);});
test('invalid monetary values rejected',async()=>{const store=createReviewStore(fake());for(const v of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(store.reserve({...intent,landedCostCents:v}),/INVALID_REVIEW/);});
test('adapter recreation retains identical receipt',async()=>{const db=fake();const first=await createReviewStore(db).reserve(intent);const second=await createReviewStore(db).reserve(intent);assert.equal(second.created,false);assert.deepEqual(second.entry,first.entry);});
test('database failures never become successful review receipts',async()=>{const store=createReviewStore(async()=>{throw Error('db unavailable')});await assert.rejects(store.reserve(intent),/db unavailable/);});

import {readFileSync} from 'node:fs';
test('storage regressions are included in the Worker and Control Room test catalogs',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(readFileSync(new URL('../../control-room.manifest.json',import.meta.url),'utf8'));
 const path='admin/tests/jusspay-fulfillment-review-storage.test.mjs';
 assert.ok(pkg.scripts['test:worker'].split(/\s+/).includes(path));
 assert.ok(manifest.tests.catalog.some(x=>x.id==='jusspay-fulfillment-review-storage'&&x.required===true&&x.status==='active'&&x.command==='node --test '+path));
});

test('review payload constraint fails closed on SQL NULL and non-string identity values',()=>{
 const ddl=readFileSync(new URL('../payment-worker/proposed-migrations/jbh_fulfillment_review.sql',import.meta.url),'utf8');
 const constraint=ddl.split('\n').find(line=>line.includes('payload jsonb NOT NULL CHECK'));
 assert.ok(constraint.endsWith(') IS TRUE),'));
 assert.ok(constraint.includes("jsonb_typeof(payload) = 'object'"));
 for(const key of ['tenant','orderId','canonicalSku','status']) assert.ok(constraint.includes("jsonb_typeof(payload->'"+key+"') = 'string'"));
});

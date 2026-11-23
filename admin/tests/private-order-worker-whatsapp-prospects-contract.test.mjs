import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
test('existing contacts support verified prospective opt ins',()=>{
 const sql=read('../migrations/020_whatsapp_business_bridge.sql');
 assert.match(sql,/audience = 'customer' AND vendor_id IS NULL/);
 assert.match(sql,/consented BOOLEAN NOT NULL DEFAULT FALSE/);
});
test('message id regex is escaped correctly',()=>{
 const sql=read('../migrations/021_whatsapp_delivery_receipts.sql');
 const slash=String.fromCharCode(92);
 assert.ok(sql.includes('wamid'+slash+'.'));
 assert.equal(sql.includes('wamid'+slash+slash+'.'),false);
});
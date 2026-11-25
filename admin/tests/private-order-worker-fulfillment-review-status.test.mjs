import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewStorageStatus } from '../../.worker-test-dist/fulfillment-review-status-model.js';
const valid={db:'jbh',role:'jbh_runtime',ledger:true,can_select:true,can_insert:true,can_update:false,can_delete:false,can_create:false,superuser:false,create_role:false,create_db:false,bypass_rls:false,orders_read:false,dispatch_read:false};
test('exact restricted review storage status never confers commercial readiness',()=>{const r=reviewStorageStatus(valid);assert.equal(r.storageReady,true);assert.equal(r.providerVerified,false);assert.equal(r.chargesCollected,false);assert.equal(r.orderDispatched,false);});
test('wrong database, role or missing table fails closed',()=>{for(const v of [{db:'other'},{role:'jbh_owner'},{ledger:false}])assert.equal(reviewStorageStatus({...valid,...v}).storageReady,false);});
test('missing or excessive privileges fail closed',()=>{for(const [k,v] of Object.entries(valid)){if(typeof v==='boolean')assert.equal(reviewStorageStatus({...valid,[k]:!v}).storageReady,false,k);}});
test('missing values and string booleans fail closed',()=>{for(const k of Object.keys(valid)){const row={...valid};delete row[k];assert.equal(reviewStorageStatus(row).storageReady,false,k);}assert.equal(reviewStorageStatus({...valid,can_create:'false'}).storageReady,false);assert.equal(reviewStorageStatus(null).storageReady,false);});

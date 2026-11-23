import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWhatsAppMigrationStructure as assess} from '../../.worker-test-dist/whatsapp-migration-readiness.js';
const all={quotes:true,purchase_order_drafts:true,contacts:true,inbox:true,outbox:true,delivery_receipts:true,review_actions:true,supplier_dispatch_guard:true,paid_order_trigger:true,purchase_order_owner_guard:true,consent_evidence_guard:true,consent_default_off:true,purchase_order_dedupe_guard:true,receipt_idempotence_guard:true,review_foreign_key_guard:true};
test('seven tables without required constraints must not pass readiness',()=>{
  const row={...all,paid_order_trigger:false};
  assert.equal(assess(row).migrationStructureVerified,false);
  assert.equal(assess(row).migrationsVerified,false);
});
test('all catalog structure is still not proof of applied migration',()=>{
  const res=assess(all);
  assert.equal(res.migrationStructureVerified,true);
  assert.equal(res.migrationsVerified,false);
  assert.equal(res.evidenceLevel,'database_catalog_structure_only');
});
test('missing, partial or untrusted records fail closed',()=>{
  assert.equal(assess(null).migrationStructureVerified,false);
  assert.equal(assess({quotes:true}).migrationStructureVerified,false);
  assert.equal(assess({...all,paid_order_trigger:1}).migrationStructureVerified,false);
});

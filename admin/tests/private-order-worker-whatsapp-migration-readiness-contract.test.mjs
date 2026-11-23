import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../payment-worker/src/whatsapp-owner-review.ts',import.meta.url),'utf8');
test('table presence alone must not make migrationsVerified true',()=>{
 assert.doesNotMatch(code,/migrationsVerified:Object\.values\(migrationTables\)\.every\(Boolean\)/);
 assert.match(code,/assessWhatsAppMigrationStructure\(result\[0\]\)/);
 assert.match(code,/AS paid_order_trigger/);
 assert.match(code,/AS consent_default_off/);
 assert.match(code,/AS receipt_idempotence_guard/);
});

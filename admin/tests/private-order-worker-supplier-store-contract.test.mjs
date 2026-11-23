import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../payment-worker/src/supplier-offer-store.ts',import.meta.url),'utf8');
const handler=readFileSync(new URL('../payment-worker/src/vendor-adapters.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/019_vendor_variant_quotes_and_purchase_order_drafts.sql',import.meta.url),'utf8');
test('owner preview only accepts backend-queried supplier quotes, never browser prices',()=>{
 assert.match(source,/Object\.keys\(requestInput\)\.sort\(\)/);
 assert.match(source,/const sql = neon\(env\.DATABASE_URL\)/);
 assert.match(source,/o\.product_id = \$\{input\.productId\}/);
 assert.match(source,/o\.variant = \$\{input\.variant\}/);
 assert.match(handler,/previewStoredSupplierSelection\(input, env, privateVendorIntent\)/);
 assert.doesNotMatch(handler,/selectBestSupplierForVariant\(input, privateVendorIntent/);
});
test('quote lookup enforces active vendor, connection, binding and fresh quote evidence',()=>{
 for(const required of [
  /v\.active = TRUE/, /connection\.state = 'dispatch_active'/,
  /connection\.dispatch_authority = TRUE/, /binding\.state = 'dispatch_active'/,
  /binding\.dispatch_authority = TRUE/, /o\.dispatch_authority = TRUE/,
  /o\.quote_expires_at > NOW\(\)/, /o\.stock_verified_at >= NOW\(\) - INTERVAL '1 hour'/,
 ]) assert.match(source,required);
 assert.match(migration,/orchestrator_code TEXT NOT NULL/);
 assert.match(migration,/supplier_platform TEXT NOT NULL/);
 assert.match(source,/proofState: "private_database_quote_not_stock_reservation"/);
 assert.doesNotMatch(source,/\.send\(|stripeClient\(|supplierPayment\(|\.dispatch\(/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const handler=readFileSync(new URL('../payment-worker/src/vendor-adapters.ts',import.meta.url),'utf8');
const model=readFileSync(new URL('../payment-worker/src/supplier-selection-model.ts',import.meta.url),'utf8');
test('supplier selection is Cloudflare Access protected before any owner route',()=>{
  assert.ok(handler.indexOf('await validateAccess(request, env)')>=0);
  assert.ok(handler.indexOf('await validateAccess(request, env)')<handler.indexOf('"/api/admin/vendor-adapters/selection-preview"'));
  assert.match(handler,/readBoundedText\(request, 32768\)/);
  assert.match(handler,/privateVendorIntent/);
  assert.match(handler,/supplier_selection_unavailable/);
});
test('supplier selection never moves funds, contacts supplier or releases customer data',()=>{
  for(const forbidden of [/fetch\(/,/stripeClient\(/,/sendMail\(/,/queue_dispatch/,/order\.send/,/emailCustomer/]) {
    assert.doesNotMatch(model,forbidden);
  }
  assert.match(model,/sourcePaidOrderId: null/);
  assert.match(model,/shipToAddress: null/);
  assert.match(model,/customerChargeAllowed: false/);
  assert.match(model,/supplierDispatchAllowed: false/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectBestSupplierForVariant as select, SupplierSelectionError} from '../../.worker-test-dist/supplier-selection-model.js';
const now=Date.parse('2026-11-22T22:00:00Z');
const intent={vendors:[
  {code:'dropship-bundles',productAssignments:[{productId:'bundle-bodywave',role:'primary'}]},
  {code:'apohair',productAssignments:[{productId:'bundle-bodywave',role:'backup'}]},
  {code:'faire',productAssignments:[{productId:'bundle-bodywave',role:'manual-sourcing-candidate'}]}
]};
const input={productId:'bundle-bodywave',variant:'18"',quantity:2,retailUnitCents:9000,
 minMarginCents:2000,maxDeliveryDays:9,shipToCountry:'US',offers:[]};
function offer(overrides={}){
 return {vendorCode:'dropship-bundles',productId:'bundle-bodywave',variant:'18"',supplierSku:'BW-18',quoteRef:'supplier:quote:123456',currency:'USD',
  unitCostCents:5000,shippingCents:1200,dutiesCents:0,supplierTaxCents:0,
  availableUnits:5,stockVerifiedAt:'2026-11-22T21:40:00Z',quoteExpiresAt:'2026-11-23T21:00:00Z',
  estimatedDeliveryDays:5,shipToCountry:'US',supplierAccountVerified:true,commercialTermsAccepted:true,
  directToCustomerShippingVerified:true,orderHandoffVerified:true,dispatchAuthority:true,evidenceRef:'supplier:evidence:123456',...overrides};
}

test('selects lowest landed cost among exact variant and approved shortlist candidates',()=>{
 const p=select({...input,offers:[offer(),offer({vendorCode:'apohair',supplierSku:'APO-BW-18',unitCostCents:4900,shippingCents:1000})]},intent,now);
 assert.equal(p.selected.vendorCode,'apohair');
 assert.equal(p.selected.variant,'18"');
 assert.equal(p.selected.landedCents,10800);
 assert.equal(p.purchaseOrderDraft.status,'not_sent');
 assert.equal(p.purchaseOrderDraft.shipToAddress,null);
 assert.equal(p.customerChargeAllowed,false);
 assert.equal(p.supplierDispatchAllowed,false);
});
test('falls back from out-of-stock, expired or slow primary offer',()=>{
 const p=select({...input,offers:[offer({availableUnits:1}),offer({vendorCode:'apohair',supplierSku:'APO-BW-18'})]},intent,now);
 assert.equal(p.selected.vendorCode,'apohair');
 for(const override of [{stockVerifiedAt:'2026-11-20T00:00:00Z'},{quoteExpiresAt:'2026-11-21T00:00:00Z'},{estimatedDeliveryDays:14}]){
  const bad=select({...input,offers:[offer(override)]},intent,now);
  assert.equal(bad.status,'supplier_review_required');
 }
});
test('does not substitute another variant, unassigned supplier or wholesale-only vendor',()=>{
 const p=select({...input,offers:[offer({variant:'22"'}),offer({vendorCode:'unknown-supplier',supplierSku:'OTHER-BW-18'}),offer({vendorCode:'faire',supplierSku:'FAIRE-BW-18'})]},intent,now);
 assert.equal(p.selected,null);
 assert.equal(p.purchaseOrderDraft,null);
});
test('blocks missing account, terms, handoff, dispatch and insufficient margin',()=>{
 for(const override of [
  {supplierAccountVerified:false},{commercialTermsAccepted:false},
  {directToCustomerShippingVerified:false},{orderHandoffVerified:false},
  {dispatchAuthority:false},{unitCostCents:9000},
  {currency:'EUR'}, {shipToCountry:'CA'},
 ]){const p=select({...input,offers:[offer(override)]},intent,now); assert.equal(p.selected,null);}
});
test('deterministic tie break is earliest delivery then primary role',()=>{
 const p=select({...input,offers:[offer({estimatedDeliveryDays:7}),offer({vendorCode:'apohair',supplierSku:'APO-BW-18',estimatedDeliveryDays:2})]},intent,now);
 assert.equal(p.selected.vendorCode,'apohair');
 const t=select({...input,offers:[offer(),offer({vendorCode:'apohair',supplierSku:'APO-BW-18'})]},intent,now);
 assert.equal(t.selected.vendorCode,'dropship-bundles');
});
test('refuses invalid request, duplicate offers and malformed supplier references',()=>{
 assert.throws(()=>select({...input,quantity:0},intent,now),SupplierSelectionError);
 assert.throws(()=>select({...input,offers:[offer(),offer()]},intent,now),{message:'duplicate_supplier_offer'});
 assert.throws(()=>select({...input,offers:[offer({supplierSku:'<script>'})]},intent,now),{message:'invalid_supplier_offer'});
});
test('preview never promises a customer charge, supplier invoice or dispatch',()=>{
 const p=select({...input,offers:[offer()]},intent,now);
 assert.equal(p.hasVerifiedPayment,false);
 assert.equal(p.supplierPaymentInitiated,false);
 assert.equal(p.purchaseOrderDraft.sourcePaidOrderId,null);
 assert.equal(p.purchaseOrderDraft.vendorInvoiceStatus,'not_requested');
 assert.ok(p.purchaseOrderDraft.authorizationRequired.includes('server_verified_paid_order'));
});
test('original private vendor intent is used, without upgrading the shortlist to dispatch authority',()=>{
 const privateIntent=JSON.parse(readFileSync(new URL('../data/vendor-selection-intent.json',import.meta.url),'utf8'));
 assert.equal(privateIntent.dispatchAuthority,false);
 assert.ok(privateIntent.vendors.some(v=>v.code==='dropship-bundles'&&v.productAssignments.some(p=>p.productId==='bundle-bodywave')));
 const p=select({...input,offers:[offer()]},privateIntent,now);
 assert.equal(p.selected?.vendorCode,'dropship-bundles');
 assert.equal(p.supplierDispatchAllowed,false);
});

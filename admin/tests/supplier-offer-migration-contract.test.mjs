import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/019_vendor_variant_quotes_and_purchase_order_drafts.sql',import.meta.url),'utf8');
test('multiple vendors may quote one exact product and variant while retaining existing single active mapping',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vendor_variant_offers/);
 assert.match(sql,/UNIQUE \(vendor_id, product_id, variant, supplier_sku\)/);
 assert.doesNotMatch(sql,/DROP INDEX vendor_product_mapping_unique/);
 assert.match(sql,/dispatch_authority BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(sql,/supplier_account_verified BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(sql,/commercial_terms_accepted BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(sql,/direct_ship_verified BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(sql,/order_handoff_verified BOOLEAN NOT NULL DEFAULT FALSE/);
});
test('supplier purchase order drafts are only for server-verified paid private orders',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS supplier_purchase_order_drafts/);
 assert.match(sql,/fulfillment_group_id INTEGER NOT NULL UNIQUE/);
 assert.match(sql,/o\.payment_status = 'paid'/);
 assert.match(sql,/g\.vendor_id = NEW\.vendor_id/);
 assert.match(sql,/supplier_purchase_draft_paid_order_gate/);
 assert.match(sql,/state TEXT NOT NULL DEFAULT 'draft'/);
 assert.doesNotMatch(sql,/send_mail\(|fetch\(|CREATE EXTENSION|DELETE FROM|TRUNCATE TABLE/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync,readdirSync} from "node:fs";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
test("only the canonical receipt journal occupies migration 019",()=>{
 assert.deepEqual(readdirSync(new URL("../migrations/",import.meta.url)).filter(n=>n.startsWith("019_")),["019_jusspay_live_receipt_journal.sql"]);
 const live=read("admin/payment-worker/src/jusspay-live-receipt.ts");
 assert.match(live,/public\.record_jusspay_live_receipt/);
 assert.match(live,/handleJussPayLiveReceiptReadiness/);
 assert.match(read("admin/payment-worker/src/jusspay-live-receipt-model.ts"),/key!==env\.JBH_JUSSPAY_RECEIPT_SECRET/);
});
test("migration requires owner approval, approved database identity and private protected main",()=>{
 const w=read(".github/workflows/apply-jusspay-live-receipts-migration.yml");
 for(const s of ["workflow_dispatch:","approve_migration:","default: false","inputs.approve_migration == true","github.actor == github.repository_owner","github.triggering_actor == github.repository_owner","EXPECTED_HEAD_SHA: ${{ github.sha }}","environment: production-payments","secrets.JBH_RECEIPT_MIGRATION_DATABASE_URL","vars.JBH_RECEIPT_MIGRATION_HOST","vars.JBH_RECEIPT_MIGRATION_DATABASE","vars.JBH_RECEIPT_MIGRATION_ROLE","repository.private !== true","main.protected !== true","Verify test-ledger contract","git ls-remote origin refs/heads/main","admin/migrations/019_jusspay_live_receipt_journal.sql","public.jusspay_live_order_receipt_state","public.jusspay_live_receipt_events","public.record_jusspay_live_receipt(text,text,text,text,text)"])assert.ok(w.includes(s),s);
 assert.doesNotMatch(w,/wrangler deploy|JBH_LIVE_CHARGES_APPROVED|019_jusspay_live_receipts\.sql|approval_phrase:/);
 assert.ok(w.indexOf("Require approved private production governance")<w.indexOf("Apply canonical journal"));
 assert.ok(w.indexOf("Prove target identity and absence of conflicting schema")<w.indexOf("Apply canonical journal"));
});

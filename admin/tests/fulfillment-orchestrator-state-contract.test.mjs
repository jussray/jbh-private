import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../migrations/010_fulfillment_orchestrator_state.sql", import.meta.url),
  "utf8",
);

test("DSers installation is recorded separately from supplier identity", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS fulfillment_orchestrator_states/);
  assert.match(source, /'dsers'/);
  assert.match(source, /'dsers-1'/);
  assert.match(source, /gid:\/\/shopify\/AppInstallation\/732770730227/);
  assert.match(source, /'installation_observed'/);
});

test("DSers observation cannot silently become dispatch authority", () => {
  assert.match(source, /CHECK \(state = 'dispatch_active' OR dispatch_authority = FALSE\)/);
  assert.match(
    source,
    /'dsers'[\s\S]*?'installation_observed'[\s\S]*?FALSE[\s\S]*?paid BRAZ-SEW orders remain procurement_needed/,
  );
  assert.doesNotMatch(source, /INSERT INTO\s+(vendor_product_mappings|vendor_dispatch_jobs)/i);
});

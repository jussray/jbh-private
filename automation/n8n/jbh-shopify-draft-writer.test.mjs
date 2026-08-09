import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("./jbh-shopify-draft-writer.workflow.json", import.meta.url);
const load = async () => JSON.parse(await readFile(path, "utf8"));
const node = (wf, name) => {
  const found = wf.nodes.find((entry) => entry.name === name);
  assert.ok(found, `missing ${name}`);
  return found;
};
const run = (code, json, refs = {}) => {
  const select = (name) => ({ item: { json: refs[name] } });
  return new Function("$json", "$", code)(json, select)[0].json;
};

const upstream = {
  workflow_contract: "jbh-vendor-candidate-gate-v1",
  ready_for_draft: true,
  draft_write_authorized: true,
  idempotency_key: "vendor-body-wave-18-001",
  shopify_draft: {
    status: "DRAFT",
    publish_allowed: false,
    title: "Body Wave Bundle 18in",
    product_type: "Bundle",
    sku: "JBH-BW-18",
    price: 95
  }
};

test("writer is internal, inactive, credential-unbound, and DRAFT-only", async () => {
  const wf = await load();
  assert.equal(wf.active, false);
  assert.equal(node(wf, "When Executed by Approved Workflow").type, "n8n-nodes-base.executeWorkflowTrigger");
  assert.equal(wf.nodes.filter((n) => n.type === "n8n-nodes-base.webhook").length, 0);
  const http = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.equal(http.length, 3);
  for (const n of http) {
    assert.equal(n.parameters.authentication, "predefinedCredentialType");
    assert.equal(n.parameters.nodeCredentialType, "shopifyAccessTokenApi");
    assert.equal(n.parameters.url, "https://8qp1z2-az.myshopify.com/admin/api/2026-07/graphql.json");
  }
  const serialized = JSON.stringify(wf);
  assert.doesNotMatch(serialized, /shpat_|publishablePublish|status['"]?\s*:\s*['"]ACTIVE['"]/i);
  assert.doesNotMatch(serialized, /source_supplier|source_product_url|evidence_urls|landed_cost|unit_cost|wholesale/i);
  assert.doesNotMatch(serialized, /"credentials"\s*:/);
});

test("explicit draft authority is required and forced safe", async () => {
  const wf = await load();
  const code = node(wf, "Require Draft Authority").parameters.jsCode;
  const out = run(code, upstream);
  assert.equal(out.expected.status, "DRAFT");
  assert.equal(out.expected.vendor, "Juss Beautiful Hair");
  assert.equal(out.expected.publish_allowed, false);
  assert.equal(out.expected.inventory_tracked, false);
  assert.equal(out.expected.requires_shipping, true);
  assert.equal(out.preflight_body.variables.query, "sku:JBH-BW-18");
  assert.throws(() => run(code, { ...upstream, draft_write_authorized: false }), /explicit_authorization_required/);
  assert.throws(() => run(code, { ...upstream, shopify_draft: { ...upstream.shopify_draft, status: "ACTIVE" } }), /invalid_draft_contract/);
  assert.throws(() => run(code, { ...upstream, shopify_draft: { ...upstream.shopify_draft, publish_allowed: true } }), /invalid_draft_contract/);
});

test("duplicate SKU blocks before productSet and mutation remains private-safe", async () => {
  const wf = await load();
  const authority = run(node(wf, "Require Draft Authority").parameters.jsCode, upstream);
  const code = node(wf, "Block Duplicate + Build DRAFT").parameters.jsCode;
  assert.throws(() => run(code, { data: { productVariants: { nodes: [{ id: "gid://shopify/ProductVariant/1", sku: upstream.shopify_draft.sku }] } } }, { "Require Draft Authority": authority }), /sku_exists/);
  assert.throws(() => run(code, {}, { "Require Draft Authority": authority }), /invalid_response/);
  const out = run(code, { data: { productVariants: { nodes: [] } } }, { "Require Draft Authority": authority });
  const input = out.mutation_body.variables.input;
  assert.equal(input.status, "DRAFT");
  assert.equal(input.vendor, "Juss Beautiful Hair");
  assert.equal(input.variants[0].inventoryItem.tracked, false);
  assert.equal(input.variants[0].inventoryItem.requiresShipping, true);
  assert.equal(input.variants[0].price, "95.00");
  assert.ok(input.tags.includes("jbh-n8n-draft"));
  assert.ok(input.tags.includes("jbh-source-key:vendor-body-wave-18-001"));
  assert.equal("cost" in input.variants[0].inventoryItem, false);
});

test("create response and readback must prove exact DRAFT state", async () => {
  const wf = await load();
  const authority = run(node(wf, "Require Draft Authority").parameters.jsCode, upstream);
  const built = run(node(wf, "Block Duplicate + Build DRAFT").parameters.jsCode, { data: { productVariants: { nodes: [] } } }, { "Require Draft Authority": authority });
  const product = {
    id: "gid://shopify/Product/100",
    title: "Body Wave Bundle 18in",
    status: "DRAFT",
    vendor: "Juss Beautiful Hair",
    productType: "Bundle",
    variants: { nodes: [{ id: "gid://shopify/ProductVariant/101", sku: "JBH-BW-18", price: "95.00", inventoryItem: { tracked: false, requiresShipping: true } }] }
  };
  const created = run(node(wf, "Validate Create Response").parameters.jsCode, { data: { productSet: { product, userErrors: [] } } }, { "Block Duplicate + Build DRAFT": built });
  assert.equal(created.readback_body.variables.id, product.id);
  const receipt = run(node(wf, "Prove DRAFT Readback").parameters.jsCode, { data: { product } }, { "Validate Create Response": created });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "shopify_draft_verified");
  assert.equal(receipt.product_status, "DRAFT");
  assert.equal(receipt.publish_allowed, false);
  assert.equal(receipt.inventory_tracked, false);
  assert.equal(receipt.requires_shipping, true);
  assert.throws(() => run(node(wf, "Prove DRAFT Readback").parameters.jsCode, { data: { product: { ...product, status: "ACTIVE" } } }, { "Validate Create Response": created }), /product_mismatch/);
});

test("Shopify GraphQL errors and user errors fail closed", async () => {
  const wf = await load();
  const authority = run(node(wf, "Require Draft Authority").parameters.jsCode, upstream);
  const built = run(node(wf, "Block Duplicate + Build DRAFT").parameters.jsCode, { data: { productVariants: { nodes: [] } } }, { "Require Draft Authority": authority });
  const code = node(wf, "Validate Create Response").parameters.jsCode;
  assert.throws(() => run(code, { errors: [{ message: "boom" }] }, { "Block Duplicate + Build DRAFT": built }), /graphql_errors/);
  assert.throws(() => run(code, { data: { productSet: { product: null, userErrors: [{ message: "bad" }] } } }, { "Block Duplicate + Build DRAFT": built }), /user_errors/);
});

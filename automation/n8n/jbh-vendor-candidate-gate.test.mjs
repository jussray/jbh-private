import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("./jbh-vendor-candidate-gate.workflow.json", import.meta.url);

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowPath, "utf8"));
}

async function runGate(payload) {
  const workflow = await loadWorkflow();
  const gate = workflow.nodes.find((node) => node.name === "Normalize + Fail Closed");
  assert.ok(gate);
  const execute = new Function("$json", gate.parameters.jsCode);
  const output = execute(payload);
  assert.equal(output.length, 1);
  return output[0].json;
}

const validCandidate = {
  supplier: {
    name: "Verified Test Supplier",
    product_url: "https://supplier.example/products/body-wave",
    evidence_urls: ["https://supplier.example/catalog/body-wave"],
    terms_verified: true,
    terms_verified_at: "2026-08-08T06:00:00Z"
  },
  product: {
    title: "Body Wave Bundle 18in",
    product_type: "Bundle",
    sku: "JBH-BW-18",
    currency: "USD",
    unit_cost: 42,
    shipping_cost: 8,
    retail_price: 95,
    fulfillment_method: "supplier-direct",
    fulfillment_days_min: 3,
    fulfillment_days_max: 7
  },
  sample_verified: false,
  media_verified: false,
  owner_publish_approved: false,
  media_urls: []
};

test("n8n vendor gate is importable, inactive, and mutation-free", async () => {
  const workflow = await loadWorkflow();
  assert.equal(workflow.active, false);
  assert.equal(workflow.name, "JBH Vendor Candidate Gate -> Shopify Draft Payload");
  assert.ok(Array.isArray(workflow.nodes));
  assert.ok(workflow.nodes.length >= 3);

  const webhook = workflow.nodes.find((node) => node.type === "n8n-nodes-base.webhook");
  assert.ok(webhook);
  assert.equal(webhook.parameters.httpMethod, "POST");
  assert.equal(webhook.parameters.path, "jbh/vendor-product-candidate");

  const mutationNodes = workflow.nodes.filter((node) =>
    /shopify|httpRequest|postgres|mysql|gmail|emailSend/i.test(node.type),
  );
  assert.deepEqual(mutationNodes, []);

  const serialized = JSON.stringify(workflow);
  assert.doesNotMatch(serialized, /shpat_|SHOPIFY_ADMIN_TOKEN|password|secret/i);
});

test("verified economics can prepare a Shopify draft without granting publish authority", async () => {
  const result = await runGate(validCandidate);
  assert.equal(result.status, "ready_for_shopify_draft");
  assert.equal(result.ready_for_draft, true);
  assert.equal(result.publish_eligible, false);
  assert.equal(result.shopify_draft.status, "DRAFT");
  assert.equal(result.shopify_draft.publish_allowed, false);
  assert.equal(result.economics.landed_cost, 50);
  assert.equal(result.economics.gross_margin, 45);
  assert.ok(result.economics.margin_rate > 0.35);
});

test("missing evidence and weak margin block the candidate", async () => {
  const result = await runGate({
    ...validCandidate,
    supplier: {
      ...validCandidate.supplier,
      evidence_urls: [],
      terms_verified: false
    },
    product: {
      ...validCandidate.product,
      unit_cost: 80,
      shipping_cost: 10,
      retail_price: 100
    }
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.ready_for_draft, false);
  assert.equal(result.shopify_draft, null);
  assert.ok(result.blockers.includes("supplier.evidence_urls:https_evidence_required"));
  assert.ok(result.blockers.includes("supplier.terms_verified:required"));
  assert.ok(result.blockers.includes("pricing:margin_below_35_percent"));
});

test("publish eligibility requires sample, media, and explicit owner approval", async () => {
  const result = await runGate({
    ...validCandidate,
    sample_verified: true,
    media_verified: true,
    owner_publish_approved: true,
    media_urls: ["https://cdn.example/body-wave.jpg"]
  });

  assert.equal(result.ready_for_draft, true);
  assert.equal(result.publish_eligible, true);
  assert.equal(result.shopify_draft.publish_allowed, false);
});

test("workflow returns an explicit next gate instead of claiming a Shopify write", async () => {
  const workflow = await loadWorkflow();
  const result = workflow.nodes.find((node) => node.name === "Return Gate Result");
  assert.ok(result);
  assert.match(result.parameters.jsCode, /does not create or publish a Shopify product/);
  assert.match(result.parameters.jsCode, /owner approval \+ credentialed Shopify draft writer/);
});

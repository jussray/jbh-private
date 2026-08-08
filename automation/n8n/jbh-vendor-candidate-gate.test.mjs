import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("./jbh-vendor-candidate-gate.workflow.json", import.meta.url);

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowPath, "utf8"));
}

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

test("n8n vendor gate fails closed on evidence, margin, and publish authority", async () => {
  const workflow = await loadWorkflow();
  const gate = workflow.nodes.find((node) => node.name === "Normalize + Fail Closed");
  assert.ok(gate);
  const code = gate.parameters.jsCode;

  for (const required of [
    "supplier.product_url:must_be_https",
    "supplier.evidence_urls:https_evidence_required",
    "supplier.terms_verified:required",
    "supplier.terms_verified_at:required",
    "pricing:margin_below_35_percent",
    "owner_publish_approved",
    "sample_verified",
    "media_verified",
    "publish_allowed: false",
    "status: 'DRAFT'",
  ]) {
    assert.match(code, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(code, /const publishEligible = readyForDraft && sampleVerified && mediaVerified && ownerPublishApproved/);
  assert.match(code, /const readyForDraft = problems\.length === 0/);
  assert.doesNotMatch(code, /fetch\(|axios|SHOPIFY_ADMIN_TOKEN|shpat_/i);
});

test("workflow returns an explicit next gate instead of claiming a Shopify write", async () => {
  const workflow = await loadWorkflow();
  const result = workflow.nodes.find((node) => node.name === "Return Gate Result");
  assert.ok(result);
  assert.match(result.parameters.jsCode, /does not create or publish a Shopify product/);
  assert.match(result.parameters.jsCode, /owner approval \+ credentialed Shopify draft writer/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("private contact ingress preserves customer-data and abuse boundaries", async () => {
  const [worker, migration, config, handoff, privateWorkerConfig] = await Promise.all([
    read("contact-worker/src/index.ts"),
    read("admin/migrations/007_contact_ingress_safety.sql"),
    read("contact-worker/wrangler.jsonc"),
    read("contact-worker/README.md"),
    read("wrangler.toml"),
  ]);

  assert.match(worker, /TURNSTILE_SECRET_KEY/);
  assert.match(worker, /ALLOWED_CONTACT_ORIGINS/);
  assert.match(worker, /ALLOWED_CONTACT_HOSTNAMES/);
  assert.match(worker, /companyWebsite: z\.string\(\)\.max\(0\)/);
  assert.match(worker, /consent: z\.literal\(true\)/);
  assert.match(worker, /result\.action === CONTACT_ACTION/);
  assert.match(worker, /allowedHostnames\.includes\(result\.hostname\)/);
  assert.match(worker, /ON CONFLICT DO NOTHING/);
  assert.match(worker, /turnstile_unavailable type=\$\{errorType\}/);
  assert.match(worker, /persistence_failed type=\$\{errorType\}/);
  assert.match(worker, /\{ received: true, duplicate: true \}/);
  assert.match(worker, /\{ received: true, receipt: storedReceipt, duplicate: false \}/);
  assert.doesNotMatch(worker, /storedReceipt \|\| receipt/);

  assert.doesNotMatch(worker, /console\.(log|info|warn)\([^)]*(name|email|message)/i);
  assert.doesNotMatch(worker, /CF-Connecting-IP[^\n]*(INSERT|source|receipt)/i);
  assert.doesNotMatch(worker, /vendor|supplier|margin|landed[_ -]?cost/i);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
  assert.match(migration, /submission_fingerprint/);
  assert.match(migration, /consent_at/);
  assert.match(migration, /receipt_id/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|INDEX)/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i);

  const contactManifest = JSON.parse(config);
  const privateManifestName = privateWorkerConfig.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  assert.equal(contactManifest.name, "jbh-contact-ingress");
  assert.equal(contactManifest.main, "src/index.ts");
  assert.equal(contactManifest.workers_dev, false);
  assert.equal(contactManifest.preview_urls, false);
  assert.notEqual(contactManifest.name, privateManifestName);
  assert.equal(contactManifest.routes, undefined);
  assert.equal(contactManifest.vars, undefined);

  assert.match(handoff, /Authoritative private operations repository: `jussray\/jbh-private`/);
  assert.match(handoff, /transitional history only/);
  assert.match(handoff, /retire the duplicate repository's deployment authority/);
  for (const heading of [
    "## Who",
    "## What",
    "## Where",
    "## When",
    "## Why",
    "## How",
    "## Known",
    "## Unknown",
    "## Blocked",
    "## Rollback",
    "## Next owner",
  ]) {
    assert.match(handoff, new RegExp(heading));
  }
});

test("production contact deployment is manual, exact-head, and fail-closed", async () => {
  const [workflow, exactHeadWorkflow, packageManifest] = await Promise.all([
    read(".github/workflows/deploy-contact-ingress.yml"),
    read(".github/workflows/contact-ingress-exact-head.yml"),
    read("package.json"),
  ]);

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /DEPLOY_JBH_CONTACT_INGRESS/);
  assert.match(workflow, /test \"\$GITHUB_REF\" = \"refs\/heads\/main\"/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /npm run verify:contact-ingress/);
  assert.match(workflow, /invalid_route_pattern/);
  assert.match(workflow, /route_outside_zone/);
  assert.match(workflow, /invalid_allowed_origin/);
  assert.match(workflow, /invalid_allowed_hostname/);
  assert.match(workflow, /origin_hostname_not_turnstile_allowed/);
  assert.match(workflow, /turnstile_hostname_without_allowed_origin/);
  assert.doesNotMatch(workflow, /route_hostname_not_turnstile_allowed/);

  assert.match(workflow, /CONTACT_WRANGLER_CONFIG: contact-worker\/wrangler\.production\.json/);
  assert.match(workflow, /writeFileSync\(process\.env\.CONTACT_WRANGLER_CONFIG/);
  assert.match(workflow, /deployments list --config \"\$CONTACT_WRANGLER_CONFIG\"/);
  assert.match(workflow, /deploy --strict --secrets-file \"\$RUNNER_TEMP\/contact-secrets\.json\" --config \"\$CONTACT_WRANGLER_CONFIG\"/);
  assert.match(workflow, /rm -f \"\$CONTACT_WRANGLER_CONFIG\"/);
  assert.match(workflow, /const secrets = \{/);
  assert.match(workflow, /const required = \['DATABASE_URL', 'TURNSTILE_SECRET_KEY'\]/);

  assert.doesNotMatch(workflow, /secret bulk/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /workers_dev:\s*true/);
  assert.doesNotMatch(workflow, /echo .*DATABASE_URL|echo .*TURNSTILE_SECRET_KEY/);

  assert.match(exactHeadWorkflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true/);
  assert.match(exactHeadWorkflow, /admin\/migrations\/007_contact_ingress_safety\.sql/);
  assert.match(exactHeadWorkflow, /deploy --dry-run --config contact-worker\/wrangler\.jsonc/);
  assert.match(exactHeadWorkflow, /actions\/upload-artifact@v4/);

  const packageJson = JSON.parse(packageManifest);
  assert.equal(
    packageJson.scripts["verify:contact-ingress"],
    "npm run typecheck:contact && npm run test:contact && npm run dry-run:contact",
  );
});

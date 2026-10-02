import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("private contact ingress preserves customer-data and abuse boundaries", async () => {
  const [worker, migration, config, handoff, privateWorkerConfig] = await Promise.all([
    read("contact-worker/src/index.ts"),
    read("admin/migrations/011_contact_ingress_safety.sql"),
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
  assert.doesNotMatch(worker, /hook\.us2\.make\.com|MAKE_WEBHOOK|SLACK|GOOGLE_SHEETS/i);

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

  assert.match(handoff, /Intended private operations repository: `jussray\/jbh-private`/);
  assert.match(handoff, /visibility: public/);
  assert.match(handoff, /Source merge authority is blocked/);
  assert.match(handoff, /011_contact_ingress_safety\.sql/);
  assert.match(handoff, /Make remains downstream and disabled/);
  assert.match(handoff, /startup_failure/);
});

test("production contact deployment is manual, exact-head, locked, and fail-closed", async () => {
  const [workflow, exactHeadWorkflow, packageManifest, packageLockManifest] = await Promise.all([
    read(".github/workflows/deploy-contact-ingress.yml"),
    read(".github/workflows/contact-ingress-exact-head.yml"),
    read("package.json"),
    read("package-lock.json"),
  ]);

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /DEPLOY_JBH_CONTACT_INGRESS/);
  assert.match(workflow, /test \"\$GITHUB_REF\" = \"refs\/heads\/main\"/);
  assert.match(workflow, /EXPECTED_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /git fetch --depth=1 origin \"\$EXPECTED_HEAD_SHA\"/);
  assert.match(workflow, /actual=\"\$\(git rev-parse HEAD\)\"/);
  assert.match(workflow, /test \"\$actual\" = \"\$EXPECTED_HEAD_SHA\"/);
  assert.match(workflow, /\/opt\/hostedtoolcache\/node/);
  assert.match(workflow, /EXPECTED_NPM_VERSION: "10\.9\.2"/);
  assert.match(workflow, /npx --yes \"npm@\$\{EXPECTED_NPM_VERSION\}\" ci/);
  assert.match(workflow, /npm run verify:contact-ingress/);
  assert.match(workflow, /invalid_route_pattern/);
  assert.match(workflow, /route_outside_zone/);
  assert.match(workflow, /invalid_allowed_origin/);
  assert.match(workflow, /invalid_allowed_hostname/);
  assert.match(workflow, /origin_hostname_not_turnstile_allowed/);
  assert.match(workflow, /turnstile_hostname_without_allowed_origin/);

  assert.match(workflow, /CONTACT_WRANGLER_CONFIG: contact-worker\/wrangler\.production\.json/);
  assert.match(workflow, /deployments list --config \"\$CONTACT_WRANGLER_CONFIG\"/);
  assert.match(workflow, /deploy --strict --secrets-file \"\$RUNNER_TEMP\/contact-secrets\.json\" --config \"\$CONTACT_WRANGLER_CONFIG\"/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /\buses:/);
  assert.doesNotMatch(workflow, /actions\/checkout|actions\/setup-node/);
  assert.doesNotMatch(workflow, /echo .*DATABASE_URL|echo .*TURNSTILE_SECRET_KEY/);

  assert.match(exactHeadWorkflow, /admin\/migrations\/011_contact_ingress_safety\.sql/);
  assert.match(exactHeadWorkflow, /package-lock\.json/);
  assert.match(exactHeadWorkflow, /git fetch --depth=1 origin \"\$EXPECTED_HEAD_SHA\"/);
  assert.match(exactHeadWorkflow, /\/opt\/hostedtoolcache\/node/);
  assert.match(exactHeadWorkflow, /grep -E '\^v24\\\.'/);
  assert.match(exactHeadWorkflow, /EXPECTED_NPM_VERSION: "10\.9\.2"/);
  assert.match(exactHeadWorkflow, /declared=.*packageManager/);
  assert.match(exactHeadWorkflow, /npx --yes \"npm@\$\{EXPECTED_NPM_VERSION\}\" ci/);
  assert.match(exactHeadWorkflow, /lockfileVersion !== 3/);
  assert.match(exactHeadWorkflow, /run: npm run dry-run:contact/);
  assert.match(exactHeadWorkflow, /sha256sum/);
  assert.doesNotMatch(exactHeadWorkflow, /\buses:/);
  assert.doesNotMatch(exactHeadWorkflow, /actions\/checkout|actions\/setup-node|actions\/upload-artifact/);

  const packageJson = JSON.parse(packageManifest);
  const packageLock = JSON.parse(packageLockManifest);
  assert.equal(packageJson.packageManager, "npm@10.9.2");
  assert.equal(packageLock.lockfileVersion, 3);
  assert.deepEqual(packageLock.packages[""].dependencies, packageJson.dependencies);
  assert.deepEqual(packageLock.packages[""].devDependencies, packageJson.devDependencies);
  assert.equal(packageJson.dependencies["apify-client"], "2.20.0");
  assert.equal(packageLock.packages["node_modules/apify-client"].version, "2.20.0");
  assert.equal(
    packageJson.scripts["dry-run:contact"],
    "wrangler deploy --dry-run --config contact-worker/wrangler.jsonc --outdir .wrangler/contact-dry-run",
  );
  assert.equal(
    packageJson.scripts["verify:contact-ingress"],
    "npm run typecheck:contact && npm run test:contact && npm run dry-run:contact",
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("private contact ingress preserves customer-data and abuse boundaries", async () => {
  const [worker, contactMigration, newsletterMigration, legacyNewsletterApi, storage, config, handoff, privateWorkerConfig] = await Promise.all([
    read("contact-worker/src/index.ts"),
    read("admin/migrations/015_contact_ingress_safety.sql"),
    read("admin/migrations/016_newsletter_ingress.sql"),
    read("admin/api/newsletter.ts"),
    read("admin/api/_lib/storage.ts"),
    read("contact-worker/wrangler.jsonc"),
    read("contact-worker/README.md"),
    read("wrangler.toml"),
  ]);

  assert.match(worker, /TURNSTILE_SECRET_KEY/);
  assert.match(worker, /ALLOWED_CONTACT_ORIGINS/);
  assert.match(worker, /ALLOWED_CONTACT_HOSTNAMES/);
  assert.match(worker, /companyWebsite: z\.string\(\)\.max\(0\)/);
  assert.match(worker, /consent: z\.literal\(true\)/);
  assert.match(worker, /result\.action === expectedAction/);
  assert.match(worker, /NEWSLETTER_ACTION = "newsletter"/);
  assert.match(worker, /const newsletterSchema = z\.object/);
  assert.match(worker, /url\.pathname === "\/newsletter"/);
  assert.match(worker, /INSERT INTO newsletter \(/);
  assert.match(worker, /ON CONFLICT \(lower\(email\)\) DO UPDATE SET/);
  assert.doesNotMatch(worker, /newsletter_subscribers/);
  assert.match(worker, /\{ subscribed: true, receipt: storedReceipt \}/);
  assert.match(worker, /allowedHostnames\.includes\(result\.hostname\)/);
  assert.match(worker, /currentBucket - 1/);
  assert.match(worker, /created_at >= NOW\(\) - INTERVAL '10 minutes'/);
  assert.match(worker, /ON CONFLICT DO NOTHING/);
  assert.match(worker, /turnstile_unavailable type=\$\{errorType\}/);
  assert.match(worker, /persistence_failed type=\$\{errorType\}/);
  assert.match(worker, /\{ received: true, duplicate: true \}/);
  assert.match(worker, /\{ received: true, receipt: storedReceipt, duplicate: false \}/);
  assert.doesNotMatch(worker, /tenMinuteBucket/);
  assert.doesNotMatch(worker, /storedReceipt \|\| receipt/);

  assert.doesNotMatch(worker, /console\.(log|info|warn)\([^)]*(name|email|message)/i);
  assert.doesNotMatch(worker, /CF-Connecting-IP[^\n]*(INSERT|source|receipt)/i);
  assert.doesNotMatch(worker, /vendor|supplier|margin|landed[_ -]?cost/i);
  assert.doesNotMatch(worker, /hook\.us2\.make\.com|MAKE_WEBHOOK|SLACK|GOOGLE_SHEETS/i);

  assert.match(contactMigration, /ADD COLUMN IF NOT EXISTS/);
  assert.match(contactMigration, /submission_fingerprint/);
  assert.match(contactMigration, /consent_at/);
  assert.match(contactMigration, /receipt_id/);
  assert.match(contactMigration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.doesNotMatch(contactMigration, /DROP\s+(TABLE|COLUMN|INDEX)/i);
  assert.doesNotMatch(contactMigration, /DELETE\s+FROM/i);

  assert.match(newsletterMigration, /ALTER TABLE newsletter/);
  assert.match(newsletterMigration, /ADD COLUMN IF NOT EXISTS receipt_id UUID/);
  assert.match(newsletterMigration, /ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ/);
  assert.match(newsletterMigration, /ADD COLUMN IF NOT EXISTS subscribed BOOLEAN/);
  assert.match(newsletterMigration, /ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ/);
  assert.match(newsletterMigration, /newsletter_duplicate_emails_require_reconciliation/);
  assert.match(newsletterMigration, /CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_normalized_idx/);
  assert.match(newsletterMigration, /CREATE UNIQUE INDEX IF NOT EXISTS newsletter_receipt_idx/);
  assert.match(newsletterMigration, /newsletter_subscription_state/);
  assert.doesNotMatch(newsletterMigration, /newsletter_subscribers/);
  assert.doesNotMatch(newsletterMigration, /DROP\s+(TABLE|COLUMN|INDEX)/i);
  assert.doesNotMatch(newsletterMigration, /DELETE\s+FROM/i);

  assert.match(legacyNewsletterApi, /status\(503\)/);
  assert.match(legacyNewsletterApi, /temporarily unavailable/);
  assert.doesNotMatch(legacyNewsletterApi, /storage\.addNewsletter/);
  assert.doesNotMatch(storage, /addNewsletter\s*\(/);

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
  assert.match(handoff, /visibility: private/);
  assert.match(handoff, /main` is not protected/);
  assert.match(handoff, /Production deployment authority is additionally blocked/);
  assert.match(handoff, /015_contact_ingress_safety\.sql/);
  assert.match(handoff, /016_newsletter_ingress\.sql/);
  assert.match(handoff, /Make remains downstream and disabled/);
  assert.match(handoff, /startup_failure/);
});

test("production contact deployment is manual, exact-head, locked, private-compatible, and fail-closed", async () => {
  const [workflow, exactHeadWorkflow, schemaPreflight, packageManifest, packageLockManifest] = await Promise.all([
    read(".github/workflows/deploy-contact-ingress.yml"),
    read(".github/workflows/contact-ingress-exact-head.yml"),
    read("scripts/verify-newsletter-schema-preflight.mjs"),
    read("package.json"),
    read("package-lock.json"),
  ]);

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /DEPLOY_JBH_CONTACT_INGRESS/);
  assert.match(workflow, /test \"\$GITHUB_REF\" = \"refs\/heads\/main\"/);
  assert.match(workflow, /EXPECTED_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /Production membrane failed: repository must be private/);
  assert.match(workflow, /Production membrane failed: main branch must be protected/);
  assert.match(workflow, /Production membrane failed: Verify test-ledger contract must be required on main/);
  assert.match(workflow, /https:\/\/x-access-token:\$\{GH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git/);
  assert.match(workflow, /git fetch --depth=1 origin \"\$EXPECTED_HEAD_SHA\"/);
  assert.match(workflow, /actual=\"\$\(git rev-parse HEAD\)\"/);
  assert.match(workflow, /test \"\$actual\" = \"\$EXPECTED_HEAD_SHA\"/);
  assert.match(workflow, /\/opt\/hostedtoolcache\/node/);
  assert.match(workflow, /EXPECTED_NPM_VERSION: "10\.9\.2"/);
  assert.match(workflow, /npx --yes \"npm@\$\{EXPECTED_NPM_VERSION\}\" ci/);
  assert.match(workflow, /npm run verify:contact-ingress/);
  assert.match(workflow, /node scripts\/verify-newsletter-schema-preflight\.mjs/);
  assert.match(workflow, /invalid_route_pattern/);
  assert.match(workflow, /route_outside_zone/);
  assert.match(workflow, /invalid_allowed_origin/);
  assert.match(workflow, /invalid_allowed_hostname/);
  assert.match(workflow, /origin_hostname_not_turnstile_allowed/);
  assert.match(workflow, /turnstile_hostname_without_allowed_origin/);

  assert.match(workflow, /CONTACT_WRANGLER_CONFIG: contact-worker\/wrangler\.production\.json/);
  assert.match(workflow, /deployments list --config \"\$CONTACT_WRANGLER_CONFIG\"/);
  assert.match(workflow, /deploy --strict --secrets-file \"\$RUNNER_TEMP\/contact-secrets\.json\" --config \"\$CONTACT_WRANGLER_CONFIG\"/);
  assert.ok(
    workflow.indexOf("verify-newsletter-schema-preflight.mjs") <
      workflow.indexOf("wrangler deploy --strict"),
    "newsletter schema preflight must run before Wrangler deploy",
  );
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /\buses:/);
  assert.doesNotMatch(workflow, /actions\/checkout|actions\/setup-node/);
  assert.doesNotMatch(workflow, /echo .*DATABASE_URL|echo .*TURNSTILE_SECRET_KEY/);

  assert.match(exactHeadWorkflow, /admin\/migrations\/015_contact_ingress_safety\.sql/);
  assert.match(exactHeadWorkflow, /admin\/migrations\/016_newsletter_ingress\.sql/);
  assert.match(exactHeadWorkflow, /scripts\/verify-newsletter-schema-preflight\.mjs/);
  assert.match(exactHeadWorkflow, /Record approved build-phase provider state/);
  assert.match(exactHeadWorkflow, /MERGE_MEMBRANE_OBSERVATION_MS: "0"/);
  assert.match(exactHeadWorkflow, /node scripts\/verify-merge-membrane\.mjs/);
  assert.match(exactHeadWorkflow, /post-010 migration/);
  assert.match(exactHeadWorkflow, /package-lock\.json/);
  assert.match(exactHeadWorkflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(exactHeadWorkflow, /https:\/\/x-access-token:\$\{GH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git/);
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

  assert.match(schemaPreflight, /DATABASE_URL/);
  assert.match(schemaPreflight, /to_regclass\('public\.newsletter_subscribers'\)/);
  assert.match(schemaPreflight, /information_schema\.columns/);
  assert.match(schemaPreflight, /newsletter_email_normalized_idx/);
  assert.match(schemaPreflight, /newsletter_receipt_idx/);
  assert.match(schemaPreflight, /newsletter_subscription_state/);
  assert.match(schemaPreflight, /canonicalStore: true/);

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

import {readFile} from 'node:fs/promises';

export const protectedWorkflows = [
  '.github/workflows/ai-skill-contract-exact-head.yml',
  '.github/workflows/contact-ingress-exact-head.yml',
  '.github/workflows/control-room-test-ledger.yml',
  '.github/workflows/control-room-tests.yml',
  '.github/workflows/cookie-contract.yml',
  '.github/workflows/deploy-contact-ingress.yml',
  '.github/workflows/paid-order-reconciliation-exact-head.yml',
  '.github/workflows/private-vendor-routing-exact-head.yml',
  '.github/workflows/root-dependency-audit.yml',
  '.github/workflows/security-build.yml',
  '.github/workflows/workflow-attack-repair-contract.yml',
  '.github/workflows/x-engagement-adapter.yml',
];

const forbiddenReusableActions = [
  /uses:\s*actions\/checkout@/i,
  /uses:\s*actions\/setup-node@/i,
];

const requiredBootstrapMarkers = [
  'permissions:',
  'contents: read',
  'EXPECTED_HEAD_SHA:',
  'GH_TOKEN: ${{ github.token }}',
  'test -n "$GH_TOKEN"',
  'https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git',
  'git fetch --depth=1 origin "$EXPECTED_HEAD_SHA"',
  'git checkout --detach FETCH_HEAD',
  'actual="$(git rev-parse HEAD)"',
  'test "$actual" = "$EXPECTED_HEAD_SHA"',
  '/opt/hostedtoolcache/node',
];

export function inspectWorkflow(path, source) {
  const failures = [];
  const text = String(source || '');

  for (const pattern of forbiddenReusableActions) {
    if (pattern.test(text)) failures.push(`${path}: blocked reusable bootstrap action remains: ${pattern}`);
  }

  for (const marker of requiredBootstrapMarkers) {
    if (!text.includes(marker)) failures.push(`${path}: missing repair-contract marker ${JSON.stringify(marker)}`);
  }

  if (!/runs-on:\s*ubuntu-22\.04/.test(text)) {
    failures.push(`${path}: runner must be pinned to ubuntu-22.04 for current proof parity`);
  }

  return failures;
}

export function inspectSecurityAudit(source) {
  const failures = [];
  const text = String(source || '');
  for (const marker of [
    'Classify admin dependency advisories',
    "['moderate', 'high', 'critical'].includes(row.severity)",
    'if (blocking.length) process.exit(1);',
  ]) {
    if (!text.includes(marker)) failures.push(`security-build: missing dependency attack marker ${JSON.stringify(marker)}`);
  }
  return failures;
}

async function main() {
  const failures = [];
  const receipts = [];

  for (const path of protectedWorkflows) {
    const source = await readFile(path, 'utf8');
    const workflowFailures = inspectWorkflow(path, source);
    failures.push(...workflowFailures);
    receipts.push({path, status: workflowFailures.length ? 'failed' : 'passed'});
  }

  const security = await readFile('.github/workflows/security-build.yml', 'utf8');
  failures.push(...inspectSecurityAudit(security));

  const receipt = {
    schemaVersion: 2,
    contract: 'workflow-attack-repair',
    protectedWorkflows: receipts,
    rules: {
      exactHeadRequired: true,
      reusableBootstrapForbidden: true,
      hostedNode24Required: true,
      readOnlyContentsRequired: true,
      privateRepositoryAuthenticatedFetchRequired: true,
      moderateHighCriticalDependencyGateRequired: true,
    },
    status: failures.length ? 'failed' : 'passed',
    failures,
  };

  console.log(JSON.stringify(receipt, null, 2));
  if (failures.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

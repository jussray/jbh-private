import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSecurityAudit, inspectWorkflow, protectedWorkflows} from '../scripts/verify-workflow-repair-contract.mjs';

const healthy = `
permissions:
  contents: read
env:
  EXPECTED_HEAD_SHA: test
  GH_TOKEN: \${{ github.token }}
jobs:
  verify:
    runs-on: ubuntu-22.04
    steps:
      - run: |
          test -n "$GH_TOKEN"
          git remote add origin "https://x-access-token:\${GH_TOKEN}@github.com/\${GITHUB_REPOSITORY}.git"
          git fetch --depth=1 origin "$EXPECTED_HEAD_SHA"
          git checkout --detach FETCH_HEAD
          actual="$(git rev-parse HEAD)"
          test "$actual" = "$EXPECTED_HEAD_SHA"
          node24_root="$(find /opt/hostedtoolcache/node -maxdepth 1 -mindepth 1 -type d -name '24.*')"
`;

test('accepts the proven private-compatible shell exact-head bootstrap', () => {
  assert.deepEqual(inspectWorkflow('healthy.yml', healthy), []);
});

test('rejects checkout/setup-node reusable bootstrap actions', () => {
  const broken = `${healthy}\n- uses: actions/checkout@v4\n- uses: actions/setup-node@v4\n`;
  const failures = inspectWorkflow('broken.yml', broken);
  assert.equal(failures.length, 2);
  assert.match(failures.join('\n'), /checkout/);
  assert.match(failures.join('\n'), /setup-node/);
});

test('rejects expired-proof shapes without exact SHA verification', () => {
  const broken = healthy.replace('test "$actual" = "$EXPECTED_HEAD_SHA"', 'echo "$actual"');
  assert.match(inspectWorkflow('broken.yml', broken).join('\n'), /EXPECTED_HEAD_SHA/);
});

test('rejects anonymous Git fetch that would fail after repository privatization', () => {
  const broken = healthy
    .replace('  GH_TOKEN: ${{ github.token }}\n', '')
    .replace('          test -n "$GH_TOKEN"\n', '')
    .replace('https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git', 'https://github.com/${GITHUB_REPOSITORY}.git');
  const failures = inspectWorkflow('broken.yml', broken);
  assert.match(failures.join('\n'), /GH_TOKEN|x-access-token/);
});

test('protects all repaired workflows, including merge and paid-order production membranes', () => {
  assert.equal(protectedWorkflows.length, 14);
  assert.ok(protectedWorkflows.includes('.github/workflows/deploy-contact-ingress.yml'));
  assert.ok(protectedWorkflows.includes('.github/workflows/merge-membrane-exact-head.yml'));
  assert.ok(protectedWorkflows.includes('.github/workflows/paid-order-production-preflight.yml'));
  assert.ok(protectedWorkflows.includes('.github/workflows/root-dependency-audit.yml'));
  assert.ok(protectedWorkflows.includes('.github/workflows/workflow-attack-repair-contract.yml'));
});

test('requires runtime moderate/high/critical blocking plus critical blocking across all dependencies', () => {
  const secure = `
Classify admin dependency advisories
npm audit --omit=dev --json
const productionBlocking = productionRows.filter(row => ['moderate', 'high', 'critical'].includes(row.severity));
const criticalAnywhere = rows.filter(row => row.severity === 'critical');
if (productionBlocking.length || criticalAnywhere.length) process.exit(1);
Dev-tooling-only high/moderate advisories remain visible and require build + Playwright proof.
`;
  assert.deepEqual(inspectSecurityAudit(secure), []);
  assert.ok(inspectSecurityAudit('Classify admin dependency advisories').length > 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSecurityAudit, inspectWorkflow, protectedWorkflows} from '../scripts/verify-workflow-repair-contract.mjs';

const healthy = `
permissions:
  contents: read
env:
  EXPECTED_HEAD_SHA: test
jobs:
  verify:
    runs-on: ubuntu-22.04
    steps:
      - run: |
          git fetch --depth=1 origin "$EXPECTED_HEAD_SHA"
          git checkout --detach FETCH_HEAD
          actual="$(git rev-parse HEAD)"
          test "$actual" = "$EXPECTED_HEAD_SHA"
          node24_root="$(find /opt/hostedtoolcache/node -maxdepth 1 -mindepth 1 -type d -name '24.*')"
`;

test('accepts the proven shell exact-head bootstrap', () => {
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

test('keeps the production contact deploy workflow under the repair membrane', () => {
  assert.ok(protectedWorkflows.includes('.github/workflows/deploy-contact-ingress.yml'));
});

test('requires security build to block moderate, high, and critical dependency advisories', () => {
  const secure = `
Classify admin dependency advisories
const blocking = rows.filter(row => ['moderate', 'high', 'critical'].includes(row.severity));
if (blocking.length) process.exit(1);
`;
  assert.deepEqual(inspectSecurityAudit(secure), []);
  assert.ok(inspectSecurityAudit('Classify admin dependency advisories').length > 0);
});

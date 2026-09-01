import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExecutionPlan,
  buildLocalReceipt,
  parseCatalogCommand,
  runLocalCatalog,
} from '../scripts/control-room-local-runner.mjs';

const manifest = {
  repository: 'jussray/jbh-private',
  tests: {
    catalog: [
      {id: 'admin-typecheck', name: 'Private admin TypeScript', kind: 'typecheck', command: 'npm --prefix admin run check', required: true, status: 'active'},
      {id: 'paid-order-contracts', name: 'Paid-order reconciliation contracts', kind: 'contract', command: 'node --test admin/tests/a.test.mjs admin/tests/b.test.mjs', required: true, status: 'active'},
      {id: 'plugin-management-contract', name: 'Plugin management', kind: 'security', command: 'node scripts/verify-plugin-management-contract.mjs', required: true, status: 'active'},
      {id: 'paid-order-migration-preflight', name: 'Paid-order migration preflight', kind: 'deployment', command: 'npm --prefix admin run preflight:paid-order-migration', required: true, status: 'founder-gated'},
    ],
  },
};

test('parses only bounded repository-native commands without a shell', () => {
  assert.deepEqual(parseCatalogCommand('npm --prefix admin run check'), {file: 'npm', args: ['--prefix', 'admin', 'run', 'check']});
  assert.deepEqual(parseCatalogCommand('node --test admin/tests/a.test.mjs admin/tests/b.test.mjs'), {file: 'node', args: ['--test', 'admin/tests/a.test.mjs', 'admin/tests/b.test.mjs']});
  assert.deepEqual(parseCatalogCommand('node scripts/verify-plugin-management-contract.mjs'), {file: 'node', args: ['scripts/verify-plugin-management-contract.mjs']});
  assert.throws(() => parseCatalogCommand('npm --prefix admin run check && echo nope'), /unsupported control-room command/);
  assert.throws(() => parseCatalogCommand('node --test ../escape.test.mjs'), /unsupported control-room command/);
});

test('plans active checks but never founder-gated production actions', () => {
  const plan = buildExecutionPlan(manifest);
  assert.deepEqual(plan.runnable.map((entry) => entry.id), ['admin-typecheck', 'paid-order-contracts', 'plugin-management-contract']);
  assert.deepEqual(plan.founderGated.map((entry) => entry.id), ['paid-order-migration-preflight']);
});

test('local receipt is explicitly supplemental and contains no command or raw output', () => {
  const receipt = buildLocalReceipt({
    manifest,
    identity: {commitSha: 'abc123', branch: 'main', dirty: false},
    results: [{id: 'admin-typecheck', name: 'Private admin TypeScript', kind: 'typecheck', required: true, status: 'passed'}],
    founderGated: [{id: 'paid-order-migration-preflight', name: 'Paid-order migration preflight', kind: 'deployment', required: true}],
    generatedAt: new Date('2026-09-01T04:00:00Z'),
  });
  assert.equal(receipt.runner.provider, 'repo-local');
  assert.equal(receipt.runner.authoritativeForMerge, false);
  assert.equal(receipt.runner.providerSignalSubstitution, false);
  assert.equal(receipt.founderGated[0].status, 'not-run-founder-gated');
  assert.equal(JSON.stringify(receipt).includes('command'), false);
  assert.equal(JSON.stringify(receipt).includes('stdout'), false);
  assert.equal(JSON.stringify(receipt).includes('stderr'), false);
});

test('local catalog fails closed on dirty or wrong exact head before executing', async () => {
  let calls = 0;
  const execute = async () => { calls += 1; return {code: 0}; };
  await assert.rejects(() => runLocalCatalog({manifest, expectedSha: 'abc123', identity: {commitSha: 'def456', branch: 'main', dirty: false}, execute}), /exact head mismatch/);
  await assert.rejects(() => runLocalCatalog({manifest, expectedSha: 'abc123', identity: {commitSha: 'abc123', branch: 'main', dirty: true}, execute}), /working tree is dirty/);
  assert.equal(calls, 0);
});

test('local failures remain failures and cannot be promoted by other passing checks', async () => {
  const execute = async ({args}) => ({code: args.includes('check') ? 1 : 0});
  const receipt = await runLocalCatalog({manifest, expectedSha: 'abc123', identity: {commitSha: 'abc123', branch: 'main', dirty: false}, execute});
  assert.equal(receipt.aggregate.state, 'failed');
  assert.equal(receipt.checks.find((check) => check.id === 'admin-typecheck')?.status, 'failed');
  assert.equal(receipt.runner.authoritativeForMerge, false);
  assert.equal(receipt.runner.providerSignalSubstitution, false);
});

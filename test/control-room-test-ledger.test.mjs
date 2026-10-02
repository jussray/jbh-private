import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {aggregateTestLedger, buildTestLedger, cloudflareProductionEffectState, mapCheckState, requiredSignalState, selectLatestChecks} from '../scripts/control-room-test-ledger.mjs';

const SHA = '660325d3575fc81bdfa7fd7d6001016bad20cf21';
const workflow = readFileSync(new URL('../.github/workflows/control-room-test-ledger.yml', import.meta.url), 'utf8');
const run = (overrides = {}) => ({id: 1, name: 'Private Ops Contracts', status: 'completed', conclusion: 'success', head_sha: SHA, started_at: '2026-08-04T20:00:00Z', completed_at: '2026-08-04T20:01:00Z', details_url: 'https://github.com/jussray/jbh-private/actions/runs/1', app: {slug: 'github-actions'}, ...overrides});

test('maps provider states without false green', () => {
  assert.equal(mapCheckState(run()), 'passed');
  assert.equal(mapCheckState(run({conclusion: 'skipped'})), 'skipped');
  assert.equal(mapCheckState(run({conclusion: 'failure'})), 'failed');
  assert.equal(mapCheckState(run({status: 'in_progress', conclusion: null})), 'running');
  assert.equal(mapCheckState(run({status: 'completed', conclusion: null})), 'unknown');
});

test('keeps every latest exact-head lane', () => {
  const checks = selectLatestChecks([
    run({id: 1, completed_at: '2026-08-04T20:01:00Z'}),
    run({id: 2, conclusion: 'failure', completed_at: '2026-08-04T20:02:00Z'}),
    run({id: 3, name: 'Vendor Routing Proof'}),
    run({id: 4, name: 'Cloudflare Workers', app: {slug: 'cloudflare-workers'}}),
    run({id: 5, name: 'Verify test-ledger contract'}),
  ], SHA, 'Verify test-ledger contract');
  assert.deepEqual(checks.map((item) => item.name), ['Cloudflare Workers', 'Private Ops Contracts', 'Vendor Routing Proof']);
  assert.equal(checks.find((item) => item.name === 'Private Ops Contracts')?.state, 'failed');
});

test('preserves aggregate states', () => {
  assert.equal(aggregateTestLedger([]).state, 'unknown');
  assert.equal(aggregateTestLedger([{state: 'passed'}]).state, 'passed');
  assert.equal(aggregateTestLedger([{state: 'skipped'}]).state, 'warning');
  assert.equal(aggregateTestLedger([{state: 'running'}]).state, 'pending');
  assert.equal(aggregateTestLedger([{state: 'failed'}]).state, 'failed');
});

test('fails closed when the manifest-required GitHub Actions signal is missing', () => {
  const checks = [{name: 'Unrelated Green Lane', app: 'github-actions', state: 'passed'}];
  const required = ['Verify private paid-order reconciliation'];
  assert.equal(requiredSignalState(checks, required), 'failed');
  assert.equal(aggregateTestLedger(checks, required).state, 'failed');
});

test('does not accept a same-name required signal from another app', () => {
  const required = ['Verify private paid-order reconciliation'];
  const checks = [{name: required[0], app: 'cloudflare-workers', state: 'passed'}];
  assert.equal(requiredSignalState(checks, required), 'failed');
  assert.equal(aggregateTestLedger(checks, required).state, 'failed');
});

test('accepts the required signal only when the exact GitHub Actions lane passes', () => {
  const required = ['Verify private paid-order reconciliation'];
  const checks = [{name: required[0], app: 'github-actions', state: 'passed'}];
  assert.equal(requiredSignalState(checks, required), 'passed');
  assert.equal(aggregateTestLedger(checks, required).state, 'passed');
});

test('fails closed when a non-main exact head receives a Cloudflare production build', () => {
  const checks = selectLatestChecks([
    run({
      id: 9,
      name: 'Workers Builds: jbh-private',
      app: {slug: 'cloudflare-workers-and-pages'},
      details_url: 'https://dash.cloudflare.com/account/workers/services/view/jbh-private/production/builds/build-1',
    }),
  ], SHA);
  assert.equal(cloudflareProductionEffectState(checks, 'fix/contact'), 'failed');
  assert.equal(aggregateTestLedger(checks, [], 'fix/contact').state, 'failed');
  assert.equal(cloudflareProductionEffectState(checks, 'main'), 'passed');
});

test('builds sanitized exact-SHA evidence', () => {
  const ledger = buildTestLedger({repository: 'jussray/jbh-private', sha: SHA, branch: 'main', runId: '1', checks: selectLatestChecks([run()], SHA)});
  assert.equal(ledger.commitSha, SHA);
  assert.equal(ledger.source.includesAllDiscoveredChecks, true);
  assert.equal(ledger.externalEffects.cloudflareNonMainProductionBuild, 'passed');
  assert.equal(JSON.stringify(ledger).includes('token'), false);
});

test('keeps the always-on ledger on one GitHub runner', () => {
  assert.equal((workflow.match(/\bruns-on:/g) ?? []).length, 1);
  assert.match(workflow, /CONTROL_ROOM_LEDGER_SELF_CHECK: Verify test-ledger contract/);
  assert.match(workflow, /name: Verify test-ledger contract/);
  assert.doesNotMatch(workflow, /publish-ledger:/);

  const contractIndex = workflow.indexOf('Run Control Room test-ledger contracts');
  const observeIndex = workflow.indexOf('Observe every exact-head check lane');
  assert.ok(contractIndex >= 0 && observeIndex > contractIndex);
});

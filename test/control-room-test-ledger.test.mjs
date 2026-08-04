import assert from 'node:assert/strict';
import test from 'node:test';
import {aggregateTestLedger, buildTestLedger, mapCheckState, selectLatestChecks} from '../scripts/control-room-test-ledger.mjs';

const SHA = '660325d3575fc81bdfa7fd7d6001016bad20cf21';
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
    run({id: 5, name: 'Publish exact-head test ledger'}),
  ], SHA, 'Publish exact-head test ledger');
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

test('builds sanitized exact-SHA evidence', () => {
  const ledger = buildTestLedger({repository: 'jussray/jbh-private', sha: SHA, branch: 'main', runId: '1', checks: selectLatestChecks([run()], SHA)});
  assert.equal(ledger.commitSha, SHA);
  assert.equal(ledger.source.includesAllDiscoveredChecks, true);
  assert.equal(JSON.stringify(ledger).includes('token'), false);
});

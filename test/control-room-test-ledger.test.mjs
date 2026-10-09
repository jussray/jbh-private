import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {aggregateTestLedger, buildTestLedger, cloudflareProductionEffectState, CONTROL_ROOM_BUILD_PHASE_POLICY, githubProviderMembraneState, mapCheckState, requiredSignalState, selectLatestChecks} from '../scripts/control-room-test-ledger.mjs';

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

test('records a non-main Cloudflare production build without failing the ledger', () => {
  const checks = selectLatestChecks([
    run({
      id: 9,
      name: 'Workers Builds: jbh-private',
      app: {slug: 'cloudflare-workers-and-pages'},
      details_url: 'https://dash.cloudflare.com/account/workers/services/view/jbh-private/production/builds/build-1',
    }),
  ], SHA);
  assert.equal(cloudflareProductionEffectState(checks, 'fix/contact'), 'observed');
  assert.equal(aggregateTestLedger(checks, [], 'fix/contact').state, 'passed');
  assert.equal(cloudflareProductionEffectState(checks, 'main'), 'passed');
});

test('records temporary public or unprotected GitHub state as observed during the approved build phase', () => {
  assert.equal(githubProviderMembraneState({repositoryPrivate: true, mainProtected: true}), 'passed');
  assert.equal(githubProviderMembraneState({repositoryPrivate: false, mainProtected: true}), 'observed');
  assert.equal(githubProviderMembraneState({repositoryPrivate: true, mainProtected: false}), 'observed');
  assert.equal(githubProviderMembraneState({repositoryPrivate: false, mainProtected: false}), 'observed');
});

test('builds sanitized exact-SHA evidence', () => {
  const ledger = buildTestLedger({
    repository: 'jussray/jbh-private',
    sha: SHA,
    branch: 'main',
    runId: '1',
    checks: selectLatestChecks([run()], SHA),
    providerMembrane: {repositoryPrivate: true, visibility: 'private', mainProtected: true},
  });
  assert.equal(ledger.commitSha, SHA);
  assert.equal(ledger.source.includesAllDiscoveredChecks, true);
  assert.equal(ledger.externalEffects.cloudflareNonMainProductionBuild, 'passed');
  assert.equal(ledger.providerMembrane.state, 'passed');
  assert.equal(JSON.stringify(ledger).includes('token'), false);
});

test('keeps build-phase GitHub provider debt visible without converting green code into a false failure', () => {
  const ledger = buildTestLedger({
    repository: 'jussray/jbh-private',
    sha: SHA,
    branch: 'main',
    runId: '1',
    checks: selectLatestChecks([run()], SHA),
    providerMembrane: {repositoryPrivate: false, visibility: 'public', mainProtected: false},
  });
  assert.equal(ledger.providerMembrane.state, 'observed');
  assert.equal(ledger.providerMembrane.policy, CONTROL_ROOM_BUILD_PHASE_POLICY);
  assert.equal(ledger.aggregate.state, 'passed');
  assert.match(ledger.providerMembrane.exitGate, /before revenue activation/);
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

// --- Scoped required signals: required only when the change is in the trusted trigger scope. ---
import {fileMatchesPathFilter, parseWorkflowTriggers, requiredSignalScopeDecision, resolveRequiredSignalNames} from '../scripts/control-room-test-ledger.mjs';

const PAID_ORDER = '.github/workflows/paid-order-reconciliation-exact-head.yml';
const PAID_SIGNAL = 'Verify private paid-order reconciliation';
const trustedPaidOrder = `name: Paid Order\non:\n  pull_request:\n    paths:\n      - "admin/payment-worker/**"\n      - "package.json"\n      - "!admin/payment-worker/README.md"\n      - "${PAID_ORDER}"\n  workflow_dispatch:\n\npermissions:\n  contents: read\n`;
const decide = (overrides = {}) => requiredSignalScopeDecision({
  event: 'pull_request', triggers: parseWorkflowTriggers(trustedPaidOrder), workflowPath: PAID_ORDER,
  changedFiles: ['README.md'], changedFilesComplete: true, ...overrides,
});

test('parses trusted workflow triggers and their path filters', () => {
  const parsed = parseWorkflowTriggers(trustedPaidOrder);
  assert.equal(parsed.ok, true);
  assert.deepEqual([...parsed.triggers.keys()].sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(parsed.triggers.get('pull_request').paths, ['admin/payment-worker/**', 'package.json', '!admin/payment-worker/README.md', PAID_ORDER]);
  assert.equal(parsed.triggers.get('workflow_dispatch').paths, null);
  assert.equal(parseWorkflowTriggers('name: x\non: [push, pull_request]\n').triggers.has('push'), true);
  assert.equal(parseWorkflowTriggers('name: no triggers\n').ok, false);
});

test('applies GitHub path-filter semantics including ordered negation', () => {
  const patterns = ['admin/payment-worker/**', '!admin/payment-worker/README.md'];
  assert.equal(fileMatchesPathFilter('admin/payment-worker/src/index.ts', patterns), true);
  assert.equal(fileMatchesPathFilter('admin/payment-worker/README.md', patterns), false);
  assert.equal(fileMatchesPathFilter('admin/tests/x.test.mjs', patterns), false);
});

test('a change outside the trusted pull_request paths does not require the scoped signal', () => {
  const decision = decide({changedFiles: ['.github/workflows/agent-contract-v1.yml', 'admin/payment-worker/README.md']});
  assert.equal(decision.required, false);
  assert.match(decision.reason, /outside/);
});

test('a change inside the trusted paths, or to the workflow itself, requires the signal', () => {
  assert.equal(decide({changedFiles: ['admin/payment-worker/src/index.ts']}).required, true);
  assert.equal(decide({changedFiles: [PAID_ORDER]}).required, true);
  const selfless = parseWorkflowTriggers('on:\n  pull_request:\n    paths:\n      - "admin/payment-worker/**"\n');
  assert.equal(decide({triggers: selfless, changedFiles: [PAID_ORDER]}).required, true, 'editing the scope definition always requires the signal');
});

test('the scoped signal is not applicable on an event its workflow never triggers on', () => {
  const decision = decide({event: 'push', changedFiles: ['admin/payment-worker/src/index.ts']});
  assert.equal(decision.required, false);
  assert.match(decision.reason, /no push trigger/);
});

test('scope resolution fails closed', () => {
  assert.equal(decide({changedFilesComplete: false}).required, true, 'truncated/unknown changed files');
  assert.equal(decide({triggers: parseWorkflowTriggers('garbage')}).required, true, 'unparseable trusted workflow');
  assert.equal(decide({event: 'workflow_dispatch'}).required, true, 'trigger without path filter');
  assert.equal(decide({triggers: parseWorkflowTriggers('on:\n  pull_request:\n    paths-ignore:\n      - "docs/**"\n')}).required, true, 'paths-ignore is not narrowed');
});

test('resolves enforced signals: unscoped always, scoped when in scope or when the lane is present', () => {
  const signals = [{name: 'Always Required', scopeWorkflowPath: null}, {name: PAID_SIGNAL, scopeWorkflowPath: PAID_ORDER}];
  const outOfScope = {[PAID_SIGNAL]: {required: false, reason: 'outside'}};
  assert.deepEqual(resolveRequiredSignalNames(signals, outOfScope, []), ['Always Required']);
  const present = [{name: PAID_SIGNAL, app: 'github-actions', state: 'failed'}];
  assert.deepEqual(resolveRequiredSignalNames(signals, outOfScope, present), ['Always Required', PAID_SIGNAL]);
  assert.equal(aggregateTestLedger(present, resolveRequiredSignalNames(signals, outOfScope, present)).state, 'failed');
  assert.deepEqual(resolveRequiredSignalNames(signals, {}, []), ['Always Required', PAID_SIGNAL], 'missing decision fails closed');
});

test('an out-of-scope change with every lane green passes the ledger and records why', () => {
  const signals = [{name: PAID_SIGNAL, scopeWorkflowPath: PAID_ORDER}];
  const decisions = {[PAID_SIGNAL]: decide({changedFiles: ['scripts/scan_history.py']})};
  const checks = [{name: 'Secret History Scan', app: 'github-actions', state: 'passed'}];
  const ledger = buildTestLedger({repository: 'jussray/jbh-private', sha: SHA, branch: 'fix/x', runId: '1', checks,
    requiredSignalNames: resolveRequiredSignalNames(signals, decisions, checks), requiredSignalDecisions: decisions,
    providerMembrane: {repositoryPrivate: true, visibility: 'private', mainProtected: false}});
  assert.equal(ledger.aggregate.state, 'passed');
  assert.equal(ledger.requiredSignals[0].name, PAID_SIGNAL);
  assert.equal(ledger.requiredSignals[0].required, false);
});

test('the manifest scopes the paid-order signal to its own workflow', () => {
  const manifest = JSON.parse(readFileSync(new URL('../.control-room/repository.manifest.json', import.meta.url), 'utf8'));
  const signal = manifest.verification.requiredSignals.find((item) => item.name === PAID_SIGNAL);
  assert.equal(signal?.required, true);
  assert.equal(signal?.scope?.workflowPath, PAID_ORDER);
});

test('the ledger workflow hands trusted scope inputs to the observer', () => {
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /TRUSTED_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(workflow, /PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
});

// --- Hardening from independent review (latent false-green paths). ---
import {ledgerFailure} from '../scripts/control-room-test-ledger.mjs';

test('parser accepts any valid list indentation and refuses shapes it cannot read', () => {
  const at = (indent) => parseWorkflowTriggers(`on:\n  pull_request:\n    paths:\n${' '.repeat(indent)}- "admin/**"\n`);
  assert.deepEqual(at(4).triggers.get('pull_request').paths, ['admin/**']);
  assert.deepEqual(at(8).triggers.get('pull_request').paths, ['admin/**']);
  assert.equal(parseWorkflowTriggers('on:\n  pull_request:\n    paths:\n      - >-\n        admin/**\n').ok, false, 'folded scalar');
  assert.equal(parseWorkflowTriggers('on:\n  pull_request:\n    paths:\n  workflow_dispatch:\n').ok, false, 'empty paths');
  assert.equal(parseWorkflowTriggers('on:\n  pull_request:\n    paths:\n      - "a/**"\n      junk line\n').ok, false, 'unreadable line in paths');
});

test('globs never match less than GitHub: **/ spans zero dirs; unsupported syntax fails closed', () => {
  assert.equal(fileMatchesPathFilter('README.md', ['**/README.md']), true);
  assert.equal(fileMatchesPathFilter('admin/x.ts', ['admin/**/*.ts']), true);
  assert.equal(fileMatchesPathFilter('admin/a/b/x.ts', ['admin/**/*.ts']), true);
  for (const pattern of ['admin/tests?/x', 'admin/[ab].ts', 'admin/a+.ts']) {
    const triggers = parseWorkflowTriggers(`on:\n  pull_request:\n    paths:\n      - "${pattern}"\n`);
    assert.equal(decide({triggers, changedFiles: ['docs/unrelated.md']}).required, true, `unsupported glob ${pattern} must fail closed`);
  }
});

test('a run of the scoped workflow on this commit enforces the signal even before its check-run exists', () => {
  const signals = [{name: PAID_SIGNAL, scopeWorkflowPath: PAID_ORDER}];
  const outOfScope = {[PAID_SIGNAL]: {required: false, reason: 'outside'}};
  assert.deepEqual(resolveRequiredSignalNames(signals, outOfScope, [], {workflowRunPaths: [PAID_ORDER]}), [PAID_SIGNAL]);
  assert.deepEqual(resolveRequiredSignalNames(signals, outOfScope, [], {workflowRunPaths: [`${PAID_ORDER}@refs/pull/1/merge`]}), [PAID_SIGNAL]);
  assert.deepEqual(resolveRequiredSignalNames(signals, outOfScope, [], {workflowRunPaths: null}), [PAID_SIGNAL], 'unknown runs fail closed');
  assert.deepEqual(resolveRequiredSignalNames(signals, outOfScope, [], {workflowRunPaths: []}), []);
});

test('a pending or unknown ledger at window expiry fails instead of exiting green', () => {
  const base = {aggregate: {state: 'passed', counts: {total: 3}}, providerMembrane: {state: 'observed'}, runner: {observerState: 'stable'}};
  assert.equal(ledgerFailure(base), null);
  assert.match(ledgerFailure({...base, aggregate: {state: 'pending', counts: {total: 3}}, runner: {observerState: 'window-expired'}}), /did not settle/);
  assert.match(ledgerFailure({...base, aggregate: {state: 'failed', counts: {total: 3}}}), /failed closed/);
  assert.match(ledgerFailure({...base, aggregate: {state: 'passed', counts: {total: 0}}}), /No exact-head checks/);
});

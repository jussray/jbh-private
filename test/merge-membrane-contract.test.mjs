import assert from 'node:assert/strict';
import test from 'node:test';
import {BUILD_PHASE_PROVIDER_POLICY, evaluateMergeMembrane, findNonMainCloudflareProductionEffects, REQUIRED_MAIN_STATUS, requiredStatusContexts} from '../scripts/verify-merge-membrane.mjs';

const healthyRepository = {full_name: 'jussray/jbh-private', visibility: 'private', private: true};
const healthyMain = {
  protected: true,
  protection: {
    required_status_checks: {
      enforcement_level: 'everyone',
      contexts: [REQUIRED_MAIN_STATUS],
      checks: [],
    },
  },
};

const cloudflareProduction = {
  id: 1,
  name: 'Workers Builds: jbh-private',
  details_url: 'https://dash.cloudflare.com/example/workers/services/view/jbh-private/production/builds/build-id',
  app: {slug: 'cloudflare-workers-and-pages'},
};

test('accepts a private protected repo with the ledger required', () => {
  assert.deepEqual(evaluateMergeMembrane({repository: healthyRepository, main: healthyMain, checkRuns: [], branch: 'feature'}).failures, []);
});

test('records temporary public repository visibility without blocking the approved build phase', () => {
  const result = evaluateMergeMembrane({repository: {...healthyRepository, visibility: 'public', private: false}, main: healthyMain, checkRuns: [], branch: 'feature'});
  assert.deepEqual(result.failures, []);
  assert.equal(result.receipt.githubProviderPolicy, BUILD_PHASE_PROVIDER_POLICY);
  assert.match(result.receipt.providerObservations.join('\n'), /intentionally public/);
});

test('records deferred main protection without blocking the approved build phase', () => {
  const main = {...healthyMain, protected: false, protection: {required_status_checks: {enforcement_level: 'off', contexts: [], checks: []}}};
  const result = evaluateMergeMembrane({repository: healthyRepository, main, checkRuns: [], branch: 'feature'});
  assert.deepEqual(result.failures, []);
  assert.match(result.receipt.providerObservations.join('\n'), /main protection is deferred/);
  assert.match(result.receipt.providerObservations.join('\n'), /required main status checks are deferred/);
});

test('records intentional non-main Cloudflare production builds without blocking merge policy', () => {
  const result = evaluateMergeMembrane({repository: healthyRepository, main: healthyMain, checkRuns: [cloudflareProduction], branch: 'feature'});
  assert.deepEqual(result.failures, []);
  assert.equal(result.receipt.cloudflareProductionBuildPolicy, 'observed-allowed-during-build-phase');
  assert.equal(result.receipt.nonMainCloudflareProductionBuilds.length, 1);
  assert.match(result.receipt.providerObservations.join('\n'), /Cloudflare non-main deployment observed/);
  assert.equal(findNonMainCloudflareProductionEffects([cloudflareProduction], 'feature').length, 1);
});

test('does not classify main as a non-main Cloudflare build', () => {
  assert.equal(findNonMainCloudflareProductionEffects([cloudflareProduction], 'main').length, 0);
});

test('dedupes required contexts from contexts and checks', () => {
  const main = structuredClone(healthyMain);
  main.protection.required_status_checks.checks = [{context: REQUIRED_MAIN_STATUS}];
  assert.deepEqual(requiredStatusContexts(main), [REQUIRED_MAIN_STATUS]);
});

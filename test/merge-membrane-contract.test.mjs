import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateMergeMembrane, findNonMainCloudflareProductionEffects, REQUIRED_MAIN_STATUS, requiredStatusContexts} from '../scripts/verify-merge-membrane.mjs';

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

test('accepts a private protected repo with the ledger required and no PR production effect', () => {
  assert.deepEqual(evaluateMergeMembrane({repository: healthyRepository, main: healthyMain, checkRuns: [], branch: 'feature'}).failures, []);
});

test('fails when repository is public', () => {
  const result = evaluateMergeMembrane({repository: {...healthyRepository, visibility: 'public', private: false}, main: healthyMain, checkRuns: [], branch: 'feature'});
  assert.match(result.failures.join('\n'), /repository must be private/);
});

test('fails when main is unprotected', () => {
  const result = evaluateMergeMembrane({repository: healthyRepository, main: {...healthyMain, protected: false}, checkRuns: [], branch: 'feature'});
  assert.match(result.failures.join('\n'), /main branch must be protected/);
});

test('fails when required status checks are cosmetic or missing the ledger', () => {
  const off = structuredClone(healthyMain);
  off.protection.required_status_checks.enforcement_level = 'off';
  off.protection.required_status_checks.contexts = [];
  assert.match(evaluateMergeMembrane({repository: healthyRepository, main: off, checkRuns: [], branch: 'feature'}).failures.join('\n'), /required status check/);

  const wrong = structuredClone(healthyMain);
  wrong.protection.required_status_checks.contexts = ['Some Other Check'];
  assert.match(evaluateMergeMembrane({repository: healthyRepository, main: wrong, checkRuns: [], branch: 'feature'}).failures.join('\n'), /Verify test-ledger contract/);
});

test('fails closed on a non-main Cloudflare production build', () => {
  const result = evaluateMergeMembrane({repository: healthyRepository, main: healthyMain, checkRuns: [cloudflareProduction], branch: 'feature'});
  assert.match(result.failures.join('\n'), /Cloudflare production build/);
  assert.equal(findNonMainCloudflareProductionEffects([cloudflareProduction], 'feature').length, 1);
});

test('allows production-build classification on main', () => {
  assert.equal(findNonMainCloudflareProductionEffects([cloudflareProduction], 'main').length, 0);
});

test('dedupes required contexts from contexts and checks', () => {
  const main = structuredClone(healthyMain);
  main.protection.required_status_checks.checks = [{context: REQUIRED_MAIN_STATUS}];
  assert.deepEqual(requiredStatusContexts(main), [REQUIRED_MAIN_STATUS]);
});

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const REQUIRED_MAIN_STATUS = 'Verify test-ledger contract';

export function requiredStatusContexts(main) {
  const required = main?.protection?.required_status_checks;
  const contexts = Array.isArray(required?.contexts) ? required.contexts : [];
  const checks = Array.isArray(required?.checks)
    ? required.checks.map((item) => clean(item?.context)).filter(Boolean)
    : [];
  return [...new Set([...contexts.map(clean).filter(Boolean), ...checks])];
}

export function findNonMainCloudflareProductionEffects(checkRuns, branch) {
  if (clean(branch) === 'main') return [];
  return (Array.isArray(checkRuns) ? checkRuns : []).filter((run) => {
    const app = clean(run?.app?.slug) || clean(run?.app?.name);
    const detailsUrl = clean(run?.details_url);
    return app === 'cloudflare-workers-and-pages' && detailsUrl.includes('/production/builds/');
  });
}

export function evaluateMergeMembrane({repository, main, checkRuns, branch}) {
  const failures = [];
  const required = main?.protection?.required_status_checks;
  const contexts = requiredStatusContexts(main);

  if (repository?.private !== true) failures.push('repository must be private');
  if (main?.protected !== true) failures.push('main branch must be protected');
  if (required?.enforcement_level === 'off' || contexts.length === 0) {
    failures.push('main must enforce at least one required status check');
  }
  if (!contexts.includes(REQUIRED_MAIN_STATUS)) {
    failures.push(`${REQUIRED_MAIN_STATUS} must be required on main`);
  }

  const cloudflareEffects = findNonMainCloudflareProductionEffects(checkRuns, branch);
  if (cloudflareEffects.length > 0) {
    failures.push('non-main head received a Cloudflare production build');
  }

  return {
    failures,
    receipt: {
      repository: clean(repository?.full_name),
      visibility: clean(repository?.visibility),
      private: repository?.private === true,
      mainProtected: main?.protected === true,
      requiredStatusChecks: contexts,
      branch: clean(branch),
      nonMainCloudflareProductionBuilds: cloudflareEffects.map((run) => ({
        id: String(run?.id ?? ''),
        name: clean(run?.name),
        detailsUrl: clean(run?.details_url),
      })),
    },
  };
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'jbh-merge-membrane',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub provider read failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

async function fetchAllCheckRuns({repository, sha, token}) {
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`https://api.github.com/repos/${repository}/commits/${sha}/check-runs`);
    url.searchParams.set('filter', 'all');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const payload = await githubJson(url, token);
    const pageRuns = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
    runs.push(...pageRuns);
    if (pageRuns.length < 100) break;
  }
  return runs;
}

export async function verifyMergeMembrane(env = process.env) {
  const repositoryName = clean(env.GITHUB_REPOSITORY);
  const sha = clean(env.EXPECTED_HEAD_SHA || env.GITHUB_SHA);
  const branch = clean(env.EXPECTED_BRANCH || env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME);
  const token = clean(env.GITHUB_TOKEN || env.GH_TOKEN);
  const observationMs = Math.max(0, Number(env.MERGE_MEMBRANE_OBSERVATION_MS || 45_000));
  if (!repositoryName || !sha || !branch || !token) {
    throw new Error('GITHUB_REPOSITORY, EXPECTED_HEAD_SHA/GITHUB_SHA, EXPECTED_BRANCH, and GITHUB_TOKEN/GH_TOKEN are required');
  }

  const repository = await githubJson(`https://api.github.com/repos/${repositoryName}`, token);
  const main = await githubJson(`https://api.github.com/repos/${repositoryName}/branches/main`, token);

  const startedAt = Date.now();
  let checkRuns = [];
  while (true) {
    checkRuns = await fetchAllCheckRuns({repository: repositoryName, sha, token});
    const cloudflareEffects = findNonMainCloudflareProductionEffects(checkRuns, branch);
    if (cloudflareEffects.length > 0 || Date.now() - startedAt >= observationMs) break;
    await sleep(Math.min(5_000, Math.max(250, observationMs - (Date.now() - startedAt))));
  }

  const result = evaluateMergeMembrane({repository, main, checkRuns, branch});
  console.log(JSON.stringify(result.receipt, null, 2));
  if (result.failures.length > 0) {
    throw new Error(`Merge membrane failed: ${result.failures.join('; ')}`);
  }
  return result.receipt;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyMergeMembrane().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

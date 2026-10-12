import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const CONTROL_ROOM_TEST_LEDGER_SCHEMA_VERSION = 3;
export const CONTROL_ROOM_BUILD_PHASE_POLICY = 'temporary-public-unprotected-allowed-during-build-phase; restore private/protected before revenue activation';
const FAILURE_CONCLUSIONS = new Set(['action_required', 'cancelled', 'failure', 'startup_failure', 'stale', 'timed_out']);
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const normalizeSha = (value) => clean(value).toLowerCase();
const timestamp = (value) => Number.isFinite(Date.parse(value ?? '')) ? Date.parse(value ?? '') : 0;
const checkKey = (run) => `${clean(run?.app?.slug) || clean(run?.app?.name) || 'unknown-app'}\u0000${clean(run?.name)}`;
const REPOSITORY_MANIFEST_PATH = '.control-room/repository.manifest.json';

export function mapCheckState(run) {
  const status = clean(run?.status);
  const conclusion = clean(run?.conclusion);
  if (['queued', 'requested', 'waiting'].includes(status)) return 'queued';
  if (['in_progress', 'pending'].includes(status)) return 'running';
  if (status !== 'completed') return 'unknown';
  if (conclusion === 'success') return 'passed';
  if (conclusion === 'neutral' || conclusion === 'skipped') return 'skipped';
  if (FAILURE_CONCLUSIONS.has(conclusion)) return 'failed';
  return 'unknown';
}

export function selectLatestChecks(checkRuns, expectedSha, observerCheckName = '') {
  const exactSha = normalizeSha(expectedSha);
  const selected = new Map();
  for (const run of Array.isArray(checkRuns) ? checkRuns : []) {
    if (!run || normalizeSha(run.head_sha) !== exactSha || !clean(run.name)) continue;
    if (observerCheckName && clean(run.name) === observerCheckName) continue;
    const key = checkKey(run);
    const current = selected.get(key);
    if (!current || timestamp(run.completed_at ?? run.started_at) >= timestamp(current.completed_at ?? current.started_at)) selected.set(key, run);
  }
  return [...selected.values()].map((run) => ({
    id: String(run.id ?? ''),
    name: clean(run.name),
    app: clean(run?.app?.slug) || clean(run?.app?.name) || 'unknown-app',
    state: mapCheckState(run),
    status: clean(run.status) || 'unknown',
    conclusion: clean(run.conclusion) || null,
    headSha: normalizeSha(run.head_sha),
    startedAt: clean(run.started_at) || null,
    completedAt: clean(run.completed_at) || null,
    detailsUrl: clean(run.details_url) || clean(run.html_url) || null,
    externalId: clean(run.external_id) || null,
  })).sort((left, right) => left.name.localeCompare(right.name) || left.app.localeCompare(right.app));
}

export function requiredSignalState(checks, requiredSignalNames, requiredApp = 'github-actions') {
  const list = Array.isArray(checks) ? checks : [];
  const names = [...new Set((Array.isArray(requiredSignalNames) ? requiredSignalNames : []).map(clean).filter(Boolean))];
  if (names.length === 0) return 'passed';

  let hasPending = false;
  for (const name of names) {
    const matches = list.filter((check) => clean(check?.name) === name && clean(check?.app) === requiredApp);
    if (matches.length !== 1) return 'failed';
    const state = clean(matches[0]?.state);
    if (state === 'passed') continue;
    if (state === 'queued' || state === 'running') {
      hasPending = true;
      continue;
    }
    return 'failed';
  }
  return hasPending ? 'pending' : 'passed';
}

export function cloudflareProductionEffectState(checks, branch = '') {
  const list = Array.isArray(checks) ? checks : [];
  const normalizedBranch = clean(branch);
  const productionBuild = list.find((check) =>
    clean(check?.app) === 'cloudflare-workers-and-pages' &&
    /\/production\/builds\//.test(clean(check?.detailsUrl)),
  );
  if (!productionBuild || normalizedBranch === 'main') return 'passed';
  return 'observed';
}

export function githubProviderMembraneState(provider = {}) {
  return provider?.repositoryPrivate === true && provider?.mainProtected === true ? 'passed' : 'observed';
}

// ---------------------------------------------------------------------------
// Scoped required signals.
// A manifest signal may declare `scope.workflowPath`: it is then required only when
// GitHub would run that workflow for this change, judged from the TRUSTED copy of the
// workflow (PR base / pushed main), never the PR head. Every uncertain branch fails closed.
// A scoped signal whose lane is present on the commit is always enforced.
// ---------------------------------------------------------------------------
const escapeRegex = (value) => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// Glob syntax the matcher implements exactly: `*`, `**`, `**/`, leading `!`. Anything else
// (`?`, `+`, `[...]`) makes the decision fail closed rather than risk matching less than GitHub.
const UNSUPPORTED_GLOB = /[?+[\]]/u;

export function workflowGlobMatches(file, pattern) {
  const target = clean(file).replace(/^\.\//, '');
  const glob = clean(pattern).replace(/^\.\//, '');
  if (!target || !glob) return false;
  const source = escapeRegex(glob)
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0001/g, '(?:.*/)?')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${source}$`).test(target);
}

/** GitHub `paths` semantics: patterns apply in order; a `!pattern` un-matches. */
export function fileMatchesPathFilter(file, patterns) {
  let matched = false;
  for (const raw of Array.isArray(patterns) ? patterns : []) {
    const negated = clean(raw).startsWith('!');
    if (workflowGlobMatches(file, negated ? clean(raw).slice(1) : raw)) matched = !negated;
  }
  return matched;
}

/** Minimal, conservative parser for a workflow's `on:` block. Unknown shapes => ok:false. */
export function parseWorkflowTriggers(workflowSource) {
  const lines = String(workflowSource ?? '').split(/\r?\n/u);
  const onIndex = lines.findIndex((line) => /^(?:on|"on"|'on'):/u.test(line));
  if (onIndex === -1) return {ok: false, triggers: new Map()};
  const triggers = new Map();
  const inline = lines[onIndex].replace(/^(?:on|"on"|'on'):/u, '').replace(/#.*$/u, '').trim();
  if (inline) {
    for (const name of inline.replace(/^\[|\]$/gu, '').split(',').map((item) => clean(item.replace(/['"]/g, '')))) {
      if (!/^[a-z_]+$/u.test(name)) return {ok: false, triggers: new Map()};
      triggers.set(name, {paths: null});
    }
    return {ok: triggers.size > 0, triggers};
  }
  let current = null;
  let collecting = null;
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+#.*$/u, '');
    if (!line.trim()) continue;
    if (/^\S/u.test(line)) break;
    const eventMatch = line.match(/^ {2}([a-z_]+):\s*(.*)$/u);
    if (eventMatch) {
      current = {paths: null};
      triggers.set(eventMatch[1], current);
      collecting = null;
      continue;
    }
    if (!current) return {ok: false, triggers: new Map()};
    const keyMatch = line.match(/^ {4}([a-z_-]+):\s*(.*)$/u);
    if (keyMatch) {
      collecting = null;
      if (keyMatch[1] === 'paths') {
        if (keyMatch[2]) return {ok: false, triggers: new Map()};
        current.paths = [];
        collecting = 'paths';
      }  // paths-ignore / branches leave `paths` null => treated as always required (conservative)
      continue;
    }
    if (collecting === 'paths') {
      const itemMatch = line.match(/^ {4,}-\s+['"]?(.+?)['"]?\s*$/u);
      if (!itemMatch || /^[>|]/u.test(itemMatch[1])) return {ok: false, triggers: new Map()};
      current.paths.push(itemMatch[1]);
    }
  }
  const emptyFilter = [...triggers.values()].some((trigger) => Array.isArray(trigger.paths) && trigger.paths.length === 0);
  return {ok: triggers.size > 0 && !emptyFilter, triggers};
}

export function requiredSignalScopeDecision({event, triggers, workflowPath, changedFiles, changedFilesComplete}) {
  const required = (reason) => ({required: true, reason});
  if (!triggers?.ok) return required(`trusted triggers of ${workflowPath} could not be parsed`);
  const eventName = clean(event);
  if (!triggers.triggers.has(eventName)) return {required: false, reason: `${workflowPath} has no ${eventName || 'unknown'} trigger`};
  const trigger = triggers.triggers.get(eventName);
  if (!Array.isArray(trigger.paths)) return required(`${workflowPath} runs on every ${eventName}`);
  const unsupported = trigger.paths.find((pattern) => UNSUPPORTED_GLOB.test(clean(pattern).replace(/^!/u, '')));
  if (unsupported) return required(`trusted paths use glob syntax the ledger does not narrow (${unsupported})`);
  if (changedFilesComplete !== true) return required('changed-file list unavailable or truncated');
  const files = Array.isArray(changedFiles) ? changedFiles.map(clean).filter(Boolean) : [];
  if (files.includes(workflowPath)) return required(`${workflowPath} itself changed`);
  const hit = files.find((file) => fileMatchesPathFilter(file, trigger.paths));
  if (hit) return required(`change touches trusted ${eventName} paths (${hit})`);
  return {required: false, reason: `change is outside the trusted ${eventName} paths of ${workflowPath}`};
}

export function resolveRequiredSignalNames(signals, decisions = {}, checks = [], {workflowRunPaths} = {}) {
  const present = new Set((Array.isArray(checks) ? checks : []).map((check) => clean(check?.name)));
  // workflowRunPaths: undefined = not consulted; null = lookup failed (fail closed); array = run paths on this commit.
  const runStarted = (workflowPath) => workflowRunPaths === null || (Array.isArray(workflowRunPaths) &&
    workflowRunPaths.some((runPath) => clean(runPath) === workflowPath || clean(runPath).startsWith(`${workflowPath}@`)));
  return (Array.isArray(signals) ? signals : [])
    .filter((signal) => !signal.scopeWorkflowPath || decisions?.[signal.name]?.required !== false ||
      present.has(signal.name) || runStarted(signal.scopeWorkflowPath))
    .map((signal) => signal.name);
}

/** Final verdict: null when the ledger may pass, otherwise the fail-closed reason. */
export function ledgerFailure(ledger) {
  const state = clean(ledger?.aggregate?.state);
  if (!(ledger?.aggregate?.counts?.total > 0)) return 'No exact-head checks were discovered.';
  if (clean(ledger?.providerMembrane?.state) === 'failed') return 'GitHub provider membrane failed.';
  if (state === 'failed') return 'Exact-head ledger failed closed.';
  if (state === 'pending' || state === 'unknown') return `Exact-head ledger did not settle (state=${state}, observer=${clean(ledger?.runner?.observerState) || 'unknown'}).`;
  return null;
}

export function aggregateTestLedger(checks, requiredSignalNames = [], branch = '') {
  const list = Array.isArray(checks) ? checks : [];
  const counts = {
    total: list.length,
    passed: list.filter((check) => check.state === 'passed').length,
    failed: list.filter((check) => check.state === 'failed').length,
    queued: list.filter((check) => check.state === 'queued').length,
    running: list.filter((check) => check.state === 'running').length,
    skipped: list.filter((check) => check.state === 'skipped').length,
    unknown: list.filter((check) => check.state === 'unknown').length,
  };
  let state = 'passed';
  if (counts.total === 0) state = 'unknown';
  else if (counts.failed > 0) state = 'failed';
  else if (counts.queued > 0 || counts.running > 0) state = 'pending';
  else if (counts.skipped > 0 || counts.unknown > 0) state = 'warning';

  const requiredState = requiredSignalState(list, requiredSignalNames);
  if (requiredState === 'failed') state = 'failed';
  else if (requiredState === 'pending' && state !== 'failed') state = 'pending';
  return {state, counts};
}

function normalizeProviderMembrane(providerMembrane) {
  if (!providerMembrane || typeof providerMembrane !== 'object') {
    return {
      repositoryPrivate: null,
      visibility: null,
      mainProtected: null,
      state: 'unknown',
      policy: CONTROL_ROOM_BUILD_PHASE_POLICY,
      exitGate: 'restore private repository visibility, protect main, and require the test-ledger check before revenue activation',
    };
  }
  const normalized = {
    repositoryPrivate: providerMembrane.repositoryPrivate === true,
    visibility: clean(providerMembrane.visibility) || null,
    mainProtected: providerMembrane.mainProtected === true,
  };
  return {
    ...normalized,
    state: githubProviderMembraneState(normalized),
    policy: CONTROL_ROOM_BUILD_PHASE_POLICY,
    exitGate: 'restore private repository visibility, protect main, and require the test-ledger check before revenue activation',
  };
}

export function buildTestLedger({repository, sha, branch, runId, checks, requiredSignalNames = [], requiredSignalDecisions = {}, providerMembrane = null, observerState = 'observing', observedAt = new Date(), runtimeState = null}) {
  const normalizedBranch = clean(branch) || null;
  const cloudflareProductionState = cloudflareProductionEffectState(checks, normalizedBranch || '');
  const normalizedProviderMembrane = normalizeProviderMembrane(providerMembrane);
  const aggregate = aggregateTestLedger(checks, requiredSignalNames, normalizedBranch || '');
  if (normalizedProviderMembrane.state === 'failed') aggregate.state = 'failed';
  return {
    schemaVersion: CONTROL_ROOM_TEST_LEDGER_SCHEMA_VERSION,
    repository,
    commitSha: normalizeSha(sha),
    branch: normalizedBranch,
    generatedAt: observedAt.toISOString(),
    ...(runtimeState ? {runtimeState} : {}),
    source: {provider: 'github-check-runs', exactRef: 'commit-sha', dedupe: 'latest-by-app-and-name', includesAllDiscoveredChecks: true, excludesObserverCheck: true},
    runner: {provider: 'github-actions', runId: clean(runId) || null, observerState, authoritativeForMerge: false},
    providerMembrane: normalizedProviderMembrane,
    externalEffects: {
      cloudflareNonMainProductionBuild: cloudflareProductionState,
      policy: 'record Cloudflare non-main production builds as intentional observed external effects during the build phase',
    },
    aggregate,
    requiredSignals: Object.entries(requiredSignalDecisions ?? {}).map(([name, decision]) => ({
      name,
      enforced: requiredSignalNames.includes(name),
      required: decision?.required !== false,
      reason: clean(decision?.reason) || null,
    })),
    checks,
  };
}

async function githubJson(url, token) {
  const response = await fetch(url, {headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'control-room-test-ledger', 'X-GitHub-Api-Version': '2022-11-28'}});
  if (!response.ok) throw new Error(`GitHub lookup failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function fetchAllCheckRuns({repository, sha, token}) {
  const [owner, repo] = clean(repository).split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must use owner/repo format.');
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`);
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

export async function fetchGithubProviderMembrane({repository, token}) {
  const [owner, repo] = clean(repository).split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must use owner/repo format.');
  const repositoryState = await githubJson(`https://api.github.com/repos/${owner}/${repo}`, token);
  const mainState = await githubJson(`https://api.github.com/repos/${owner}/${repo}/branches/main`, token);
  const result = {
    repositoryPrivate: repositoryState?.private === true,
    visibility: clean(repositoryState?.visibility) || null,
    mainProtected: mainState?.protected === true,
  };
  return {...result, state: githubProviderMembraneState(result)};
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function writeLedger(outputPath, ledger) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

function loadRequiredSignals(manifestPath = REPOSITORY_MANIFEST_PATH) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const requiredSignals = Array.isArray(manifest?.verification?.requiredSignals) ? manifest.verification.requiredSignals : [];
  const signals = requiredSignals
    .filter((signal) => signal?.required === true && clean(signal?.name))
    .map((signal) => ({name: clean(signal.name), scopeWorkflowPath: clean(signal?.scope?.workflowPath) || null}));
  if (signals.length === 0) throw new Error('Repository control-room manifest must declare at least one required verification signal.');
  return signals;
}

async function fetchTrustedFile({repository, filePath, ref, token}) {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  const payload = await githubJson(`https://api.github.com/repos/${repository}/contents/${encoded}?ref=${encodeURIComponent(ref)}`, token);
  if (payload?.type !== 'file' || payload?.encoding !== 'base64') throw new Error(`trusted file unavailable: ${filePath}@${ref}`);
  return Buffer.from(String(payload.content).replace(/\s+/g, ''), 'base64').toString('utf8');
}

async function fetchChangedFiles({repository, event, prNumber, beforeSha, sha, token}) {
  if (event === 'pull_request' && /^\d+$/u.test(prNumber)) {
    const pull = await githubJson(`https://api.github.com/repos/${repository}/pulls/${prNumber}`, token);
    const files = [];
    let rowCount = 0;
    for (let page = 1; page <= 30; page += 1) {
      const rows = await githubJson(`https://api.github.com/repos/${repository}/pulls/${prNumber}/files?per_page=100&page=${page}`, token);
      const list = Array.isArray(rows) ? rows : [];
      rowCount += list.length;
      files.push(...list.flatMap((row) => [clean(row?.filename), clean(row?.previous_filename)]).filter(Boolean));
      if (list.length < 100) break;
    }
    // Completeness counts listed rows (one per changed file); renames add their old path as well.
    return {files: [...new Set(files)], complete: Number.isInteger(pull?.changed_files) && pull.changed_files === rowCount && rowCount < 3000};
  }
  if (event === 'push' && /^[0-9a-f]{40}$/u.test(beforeSha) && !/^0+$/u.test(beforeSha)) {
    const compare = await githubJson(`https://api.github.com/repos/${repository}/compare/${beforeSha}...${sha}`, token);
    const rows = Array.isArray(compare?.files) ? compare.files : [];
    const files = rows.flatMap((row) => [clean(row?.filename), clean(row?.previous_filename)]).filter(Boolean);
    return {files, complete: rows.length < 300};
  }
  return {files: [], complete: false};
}

async function fetchWorkflowRunPaths({repository, sha, token}) {
  try {
    const paths = [];
    for (let page = 1; page <= 10; page += 1) {
      const payload = await githubJson(`https://api.github.com/repos/${repository}/actions/runs?head_sha=${sha}&per_page=100&page=${page}`, token);
      const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
      paths.push(...runs.map((run) => clean(run?.path)).filter(Boolean));
      if (runs.length < 100) break;
    }
    return paths;
  } catch {
    return null;
  }
}

async function decideSignalScopes({signals, repository, event, prNumber, baseSha, beforeSha, sha, token}) {
  const decisions = {};
  const scoped = signals.filter((signal) => signal.scopeWorkflowPath);
  if (scoped.length === 0) return decisions;
  let changed = {files: [], complete: false};
  try {
    changed = await fetchChangedFiles({repository, event, prNumber, beforeSha, sha, token});
  } catch (error) {
    changed = {files: [], complete: false, error: error instanceof Error ? error.message : String(error)};
  }
  // pull_request: the PR base (main) is trusted, never the PR head. push: the pushed main commit is what
  // GitHub itself evaluates triggers from; it is trusted only because changes reach main through review.
  const trustedRef = event === 'pull_request' ? baseSha : sha;
  for (const signal of scoped) {
    try {
      if (!/^[0-9a-f]{40}$/u.test(trustedRef)) throw new Error('no trusted ref for this event');
      const source = await fetchTrustedFile({repository, filePath: signal.scopeWorkflowPath, ref: trustedRef, token});
      decisions[signal.name] = requiredSignalScopeDecision({event, triggers: parseWorkflowTriggers(source),
        workflowPath: signal.scopeWorkflowPath, changedFiles: changed.files, changedFilesComplete: changed.complete});
    } catch (error) {
      decisions[signal.name] = {required: true, reason: `scope unresolved, failing closed: ${error instanceof Error ? error.message : String(error)}`};
    }
  }
  return decisions;
}

export async function observeExactHeadChecks(env = process.env) {
  const repository = clean(env.GITHUB_REPOSITORY);
  const sha = normalizeSha(env.EXPECTED_HEAD_SHA || env.GITHUB_SHA);
  const branch = clean(env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME);
  const token = clean(env.GITHUB_TOKEN);
  const runId = clean(env.GITHUB_RUN_ID);
  const observerCheckName = clean(env.CONTROL_ROOM_LEDGER_SELF_CHECK || 'Publish exact-head test ledger');
  const outputPath = clean(env.CONTROL_ROOM_TEST_LEDGER_PATH) || 'artifacts/control-room-test-ledger.json';
  const runtimeStatePath = clean(env.CONTROL_ROOM_RUNTIME_STATE_PATH);
  const runtimeState = runtimeStatePath ? JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8')) : null;
  if (runtimeState) {
    if (clean(runtimeState.repository) !== repository) throw new Error('Runtime-state receipt repository does not match the ledger repository.');
    if (normalizeSha(runtimeState.sourceSha) !== sha) throw new Error('Runtime-state receipt sourceSha does not match the exact ledger head.');
    if (!/^sha256:[0-9a-f]{64}$/u.test(clean(runtimeState?.trackedConfig?.sha256))) throw new Error('Runtime-state receipt is missing a valid tracked-config fingerprint.');
  }
  const timeoutMs = Number(env.CONTROL_ROOM_LEDGER_TIMEOUT_MS || 20 * 60 * 1000);
  const pollMs = Number(env.CONTROL_ROOM_LEDGER_POLL_MS || 10_000);
  const minimumObservationMs = Number(env.CONTROL_ROOM_LEDGER_MINIMUM_MS || 30_000);
  if (!repository || !sha || !token) throw new Error('GITHUB_REPOSITORY, EXPECTED_HEAD_SHA/GITHUB_SHA, and GITHUB_TOKEN are required.');
  const requiredSignals = loadRequiredSignals();
  const requiredSignalDecisions = await decideSignalScopes({
    signals: requiredSignals, repository, sha, token,
    event: clean(env.GITHUB_EVENT_NAME),
    prNumber: clean(env.PR_NUMBER),
    baseSha: normalizeSha(env.TRUSTED_BASE_SHA),
    beforeSha: normalizeSha(env.PUSH_BEFORE_SHA),
  });
  let requiredSignalNames = resolveRequiredSignalNames(requiredSignals, requiredSignalDecisions, []);
  const providerMembrane = await fetchGithubProviderMembrane({repository, token});

  const startedAt = Date.now();
  let stableTerminalPolls = 0;
  let previousFingerprint = '';
  let checks = [];
  let reachedStableTerminal = false;
  while (Date.now() - startedAt < timeoutMs) {
    checks = selectLatestChecks(await fetchAllCheckRuns({repository, sha, token}), sha, observerCheckName);
    const workflowRunPaths = await fetchWorkflowRunPaths({repository, sha, token});
    requiredSignalNames = resolveRequiredSignalNames(requiredSignals, requiredSignalDecisions, checks, {workflowRunPaths});
    writeLedger(outputPath, buildTestLedger({repository, sha, branch, runId, checks, requiredSignalNames, requiredSignalDecisions, providerMembrane, runtimeState}));
    const fingerprint = JSON.stringify(checks.map((check) => [check.app, check.name, check.state, check.detailsUrl]));
    const terminal = !checks.some((check) => check.state === 'queued' || check.state === 'running');
    const oldEnough = Date.now() - startedAt >= minimumObservationMs;
    stableTerminalPolls = terminal && oldEnough && fingerprint === previousFingerprint ? stableTerminalPolls + 1 : 0;
    previousFingerprint = fingerprint;
    if (stableTerminalPolls >= 1) { reachedStableTerminal = true; break; }
    await sleep(pollMs);
  }

  const ledger = buildTestLedger({repository, sha, branch, runId, checks, requiredSignalNames, requiredSignalDecisions, providerMembrane, observerState: reachedStableTerminal ? 'stable' : 'window-expired', runtimeState});
  writeLedger(outputPath, ledger);
  const failure = ledgerFailure(ledger);
  if (failure) throw new Error(`${failure} repositoryPrivate=${ledger.providerMembrane.repositoryPrivate} mainProtected=${ledger.providerMembrane.mainProtected}. Evidence: ${outputPath}`);
  console.log(JSON.stringify(ledger, null, 2));
  return ledger;
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) observeExactHeadChecks().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exit(1); });

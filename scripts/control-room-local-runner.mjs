import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MANIFEST_PATH = 'control-room.manifest.json';
const OUTPUT_PATH = 'artifacts/control-room-local-runner.json';
const EXPECTED_REPOSITORY = 'jussray/jbh-private';
const ALLOWED_ADMIN_SCRIPTS = new Set([
  'check',
  'build',
  'verify:cookies',
  'verify:mcp',
  'verify:ai-skills',
  'verify:playwright',
]);

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const normalizeSha = (value) => clean(value).toLowerCase();
const safeTestPath = (value) => /^admin\/tests\/[A-Za-z0-9._/-]+\.mjs$/.test(value)
  && !value.includes('..')
  && !value.includes('\\');

export function parseCatalogCommand(command) {
  const value = clean(command);

  const npmMatch = value.match(/^npm --prefix admin run ([A-Za-z0-9:_-]+)$/);
  if (npmMatch && ALLOWED_ADMIN_SCRIPTS.has(npmMatch[1])) {
    return {file: 'npm', args: ['--prefix', 'admin', 'run', npmMatch[1]]};
  }

  if (value === 'node scripts/verify-plugin-management-contract.mjs') {
    return {file: 'node', args: ['scripts/verify-plugin-management-contract.mjs']};
  }

  if (value.startsWith('node --test ')) {
    const files = value.slice('node --test '.length).trim().split(/\s+/).filter(Boolean);
    if (files.length > 0 && files.every(safeTestPath)) {
      return {file: 'node', args: ['--test', ...files]};
    }
  }

  throw new Error(`unsupported control-room command: ${value || '<empty>'}`);
}

export function buildExecutionPlan(manifest) {
  if (manifest?.repository !== EXPECTED_REPOSITORY) {
    throw new Error(`control-room repository must be ${EXPECTED_REPOSITORY}`);
  }
  const catalog = Array.isArray(manifest?.tests?.catalog) ? manifest.tests.catalog : [];
  if (catalog.length === 0) throw new Error('control-room catalog is empty');

  const runnable = [];
  const founderGated = [];
  for (const entry of catalog) {
    if (!entry || typeof entry !== 'object') throw new Error('control-room catalog contains an invalid entry');
    if (entry.status === 'founder-gated') {
      founderGated.push({id: clean(entry.id), name: clean(entry.name), kind: clean(entry.kind), required: entry.required === true});
      continue;
    }
    if (entry.status !== 'active') continue;
    runnable.push({
      id: clean(entry.id),
      name: clean(entry.name),
      kind: clean(entry.kind),
      required: entry.required === true,
      spec: parseCatalogCommand(entry.command),
    });
  }
  if (runnable.length === 0) throw new Error('control-room catalog has no active runnable checks');
  return {runnable, founderGated};
}

function aggregate(results) {
  const list = Array.isArray(results) ? results : [];
  const requiredFailures = list.filter((item) => item.required && item.status !== 'passed').length;
  const failures = list.filter((item) => item.status === 'failed').length;
  return {
    state: list.length === 0 ? 'unknown' : (requiredFailures > 0 || failures > 0 ? 'failed' : 'passed'),
    counts: {
      total: list.length,
      passed: list.filter((item) => item.status === 'passed').length,
      failed: failures,
    },
  };
}

export function buildLocalReceipt({manifest, identity, results, founderGated, generatedAt = new Date(), manifestHash = null}) {
  const checks = (Array.isArray(results) ? results : []).map((item) => ({
    id: clean(item.id),
    name: clean(item.name),
    kind: clean(item.kind),
    required: item.required === true,
    status: item.status === 'passed' ? 'passed' : 'failed',
    detailsUrl: null,
  }));
  const gated = (Array.isArray(founderGated) ? founderGated : []).map((item) => ({
    id: clean(item.id),
    name: clean(item.name),
    kind: clean(item.kind),
    required: item.required === true,
    status: 'not-run-founder-gated',
  }));
  return {
    schemaVersion: 1,
    projectId: 'jbh-private',
    repository: {provider: 'github', identifier: manifest.repository},
    commitSha: normalizeSha(identity?.commitSha),
    branch: clean(identity?.branch) || null,
    manifestHash: manifestHash || null,
    generatedAt: generatedAt.toISOString(),
    runner: {
      provider: 'repo-local',
      runId: null,
      detailsUrl: null,
      authoritativeForMerge: false,
      providerSignalSubstitution: false,
    },
    aggregate: aggregate(checks),
    checks,
    founderGated: gated,
  };
}

function spawnResult(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {stdio: options.stdio ?? 'inherit', cwd: options.cwd ?? process.cwd(), env: options.env ?? process.env, shell: false});
    child.once('error', reject);
    child.once('close', (code) => resolve({code: Number.isInteger(code) ? code : 1}));
  });
}

async function capture(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {stdio: ['ignore', 'pipe', 'pipe'], shell: false});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(`${file} ${args.join(' ')} failed: ${stderr.trim().slice(0, 200)}`));
      else resolve(stdout.trim());
    });
  });
}

export async function resolveGitIdentity() {
  const commitSha = normalizeSha(await capture('git', ['rev-parse', 'HEAD']));
  const branch = clean(await capture('git', ['branch', '--show-current']));
  const dirty = clean(await capture('git', ['status', '--porcelain'])).length > 0;
  return {commitSha, branch, dirty};
}

export async function runLocalCatalog({manifest, expectedSha = '', identity, execute = spawnResult, manifestHash = null, generatedAt = new Date()}) {
  const subject = identity ?? await resolveGitIdentity();
  const actualSha = normalizeSha(subject?.commitSha);
  const requiredSha = normalizeSha(expectedSha);
  if (!actualSha) throw new Error('local control-room runner could not resolve git HEAD');
  if (requiredSha && actualSha !== requiredSha) throw new Error(`exact head mismatch: expected ${requiredSha}, observed ${actualSha}`);
  if (subject?.dirty === true) throw new Error('working tree is dirty; local evidence is not exact-head proof');

  const plan = buildExecutionPlan(manifest);
  const results = [];
  for (const entry of plan.runnable) {
    let code = 1;
    try {
      const outcome = await execute(entry.spec);
      code = outcome?.code === 0 ? 0 : 1;
    } catch {
      code = 1;
    }
    results.push({id: entry.id, name: entry.name, kind: entry.kind, required: entry.required, status: code === 0 ? 'passed' : 'failed'});
  }

  return buildLocalReceipt({manifest, identity: subject, results, founderGated: plan.founderGated, generatedAt, manifestHash});
}

async function main(env = process.env) {
  const raw = await readFile(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(raw);
  const manifestHash = createHash('sha256').update(raw).digest('hex');
  const receipt = await runLocalCatalog({manifest, expectedSha: clean(env.EXPECTED_HEAD_SHA), manifestHash});
  const outputPath = clean(env.CONTROL_ROOM_LOCAL_REPORT_PATH) || OUTPUT_PATH;
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt));
  if (receipt.aggregate.state !== 'passed') process.exitCode = 1;
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

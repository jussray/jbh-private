import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const MANIFEST_PATH = 'control-room.manifest.json';
const EXPECTED_REPOSITORY = 'jussray/jbh-private';
const ALLOWED_KINDS = new Set([
  'typecheck',
  'lint',
  'unit',
  'integration',
  'e2e',
  'contract',
  'security',
  'build',
  'deployment',
  'other',
]);
const ALLOWED_STATUSES = new Set(['active', 'founder-gated', 'missing', 'retired']);

function safePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.split('/').includes('..');
}

function singleLine(value, max = 500) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= max
    && !value.includes('\n')
    && !value.includes('\r');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function packageScript(command, packageJson) {
  const match = command.match(/^npm --prefix admin run ([a-zA-Z0-9:_-]+)$/);
  if (!match) return null;
  return Boolean(packageJson.scripts?.[match[1]]);
}

function nodeTestFiles(command) {
  const prefix = 'node --test ';
  if (!command.startsWith(prefix)) return null;
  return command.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
}

const raw = await readFile(MANIFEST_PATH, 'utf8');
const manifest = JSON.parse(raw);
const adminPackage = JSON.parse(await readFile('admin/package.json', 'utf8'));
const errors = [];

if (manifest.schemaVersion !== '1.0') errors.push('schemaVersion must be 1.0');
if (manifest.repository !== EXPECTED_REPOSITORY) errors.push(`repository must be ${EXPECTED_REPOSITORY}`);
if (manifest.portfolioHub !== 'jussray/founder-control-room') errors.push('portfolioHub must be Founder Control Room');
if (manifest.controlRoom?.privateContentAllowed !== false) errors.push('private content must be denied');
if (manifest.tests?.rawLogsAllowed !== false) errors.push('raw test logs must be denied');
if (!Array.isArray(manifest.tests?.catalog) || manifest.tests.catalog.length === 0) {
  errors.push('tests.catalog must contain repository-native tests');
}

const ids = new Set();
const observations = [];
for (const entry of Array.isArray(manifest.tests?.catalog) ? manifest.tests.catalog : []) {
  const entryErrors = [];
  if (!singleLine(entry.id, 100)) entryErrors.push('id is invalid');
  if (ids.has(entry.id)) entryErrors.push('id is duplicated');
  ids.add(entry.id);
  if (!singleLine(entry.name, 200)) entryErrors.push('name is invalid');
  if (!ALLOWED_KINDS.has(entry.kind)) entryErrors.push('kind is unsupported');
  if (!ALLOWED_STATUSES.has(entry.status)) entryErrors.push('status is unsupported');
  if (typeof entry.required !== 'boolean') entryErrors.push('required must be boolean');
  if (!singleLine(entry.command)) entryErrors.push('command must be single-line');
  if (!Array.isArray(entry.evidencePaths) || entry.evidencePaths.length === 0) {
    entryErrors.push('evidencePaths must not be empty');
  }

  const missingEvidencePaths = [];
  for (const evidencePath of Array.isArray(entry.evidencePaths) ? entry.evidencePaths : []) {
    if (!safePath(evidencePath)) {
      entryErrors.push(`unsafe evidence path: ${String(evidencePath)}`);
      continue;
    }
    if (!(await exists(evidencePath))) missingEvidencePaths.push(evidencePath);
  }
  if (missingEvidencePaths.length > 0) {
    entryErrors.push(`missing evidence: ${missingEvidencePaths.join(', ')}`);
  }

  const scriptExists = packageScript(entry.command, adminPackage);
  if (scriptExists === false) entryErrors.push('referenced admin package script is missing');
  const testFiles = nodeTestFiles(entry.command);
  if (testFiles) {
    for (const testFile of testFiles) {
      if (!safePath(testFile) || !(await exists(testFile))) {
        entryErrors.push(`referenced test file is missing or unsafe: ${testFile}`);
      }
    }
  }

  observations.push({
    id: entry.id,
    kind: entry.kind,
    required: entry.required,
    status: entry.status,
    catalogValid: entryErrors.length === 0,
    missingEvidencePaths,
  });
  for (const error of entryErrors) errors.push(`${entry.id || 'unknown'}: ${error}`);
}

if (/(service[_-]?role[_-]?key|api[_-]?key|database_url\s*[:=]|secret\s*[:=]|sk-[a-z0-9_-]{10,})/i.test(raw)) {
  errors.push('control-room manifest appears to contain secret material');
}

const report = {
  schemaVersion: 1,
  repository: EXPECTED_REPOSITORY,
  status: errors.length === 0 ? 'passed' : 'failed',
  generatedAt: new Date().toISOString(),
  tests: observations,
  summary: {
    total: observations.length,
    active: observations.filter((item) => item.status === 'active').length,
    founderGated: observations.filter((item) => item.status === 'founder-gated').length,
    missing: observations.filter((item) => item.status === 'missing').length,
    invalid: observations.filter((item) => !item.catalogValid).length,
  },
};

const reportPath = process.env.CONTROL_ROOM_TEST_REPORT_PATH;
if (reportPath) {
  await mkdir(path.dirname(reportPath), {recursive: true});
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (errors.length > 0) {
  console.error('Private control-room test catalog failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(JSON.stringify(report));

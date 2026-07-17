import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), process.cwd().endsWith(`${path.sep}admin`) ? '..' : '.');
const expectedServerNames = ['context7', 'github', 'playwright'];
const expectedGithubToolsets =
  'repos,issues,pull_requests,actions,code_security,secret_protection';
const pinnedPlaywrightPackage = '@playwright/mcp@0.0.78';

function fail(message) {
  throw new Error(`[verify:mcp] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath} is missing or invalid JSON: ${error.message}`);
  }
}

function validate(relativePath, servers, requireStdio = false) {
  assert(
    JSON.stringify(Object.keys(servers ?? {}).sort()) === JSON.stringify(expectedServerNames),
    `${relativePath} must contain exactly: ${expectedServerNames.join(', ')}`,
  );

  assert(servers.github?.type === 'http', `${relativePath}:github must use HTTP`);
  assert(
    servers.github?.url === 'https://api.githubcopilot.com/mcp/',
    `${relativePath}:github URL drifted`,
  );
  assert(
    servers.github?.headers?.['X-MCP-Toolsets'] === expectedGithubToolsets,
    `${relativePath}:github toolsets drifted`,
  );
  assert(!servers.github?.headers?.Authorization, `${relativePath}:do not commit GitHub authorization headers`);
  assert(
    servers.github?.headers?.['X-MCP-Insiders'] !== 'true',
    `${relativePath}:GitHub Insiders is private opt-in only`,
  );

  assert(servers.context7?.type === 'http', `${relativePath}:context7 must use HTTP`);
  assert(
    servers.context7?.url === 'https://mcp.context7.com/mcp',
    `${relativePath}:context7 URL drifted`,
  );

  if (requireStdio) {
    assert(servers.playwright?.type === 'stdio', `${relativePath}:playwright must use stdio`);
  }
  assert(servers.playwright?.command === 'npx', `${relativePath}:playwright command must be npx`);
  assert(Array.isArray(servers.playwright?.args), `${relativePath}:playwright args are missing`);
  assert(
    servers.playwright.args.includes(pinnedPlaywrightPackage),
    `${relativePath}:playwright must stay pinned to ${pinnedPlaywrightPackage}`,
  );
  assert(!servers.playwright.args.some((arg) => String(arg).includes('@latest')), `${relativePath}:MCP packages cannot use @latest`);
  assert(servers.playwright.args.includes('--isolated'), `${relativePath}:playwright must use an isolated profile`);

  for (const forbidden of ['supabase', 'dbhub', 'netdata-cloud', 'cloudflare-builds', 'cloudflare-observability']) {
    assert(!servers[forbidden], `${relativePath}:${forbidden} is not part of the private-admin default boundary`);
  }
}

function assertNoCommittedSecrets(relativePath, parsed) {
  const serialized = JSON.stringify(parsed);
  const patterns = [
    /github_pat_/i,
    /ghp_[A-Za-z0-9]{20,}/,
    /sk_(?:live|test)_[A-Za-z0-9]{16,}/i,
    /whsec_[A-Za-z0-9]{12,}/i,
    /Bearer\s+[A-Za-z0-9._-]{12,}/i,
    /DATABASE_URL/,
    /CLOUDFLARE_API_TOKEN/,
  ];
  for (const pattern of patterns) {
    assert(!pattern.test(serialized), `${relativePath} appears to contain a committed credential`);
  }
}

const projectConfig = readJson('.mcp.json');
const exampleConfig = readJson('.mcp.example.json');
const vscodeConfig = readJson('.vscode/mcp.json');

validate('.mcp.json', projectConfig.mcpServers);
validate('.mcp.example.json', exampleConfig.mcpServers);
validate('.vscode/mcp.json', vscodeConfig.servers, true);

assertNoCommittedSecrets('.mcp.json', projectConfig);
assertNoCommittedSecrets('.mcp.example.json', exampleConfig);
assertNoCommittedSecrets('.vscode/mcp.json', vscodeConfig);

console.log('[verify:mcp] Private-admin MCP configuration is scoped, pinned, and credential-free.');

import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile(new URL('../.control-room/plugin-management.json', import.meta.url), 'utf8'),
);

const failures = [];
const fail = (message) => failures.push(message);
const expectedPlugins = ['GitHub', 'Shopify', 'HubSpot'];
const allowedManifestKeys = [
  'schemaVersion',
  'contract',
  'repository',
  'authorityRepository',
  'controlPlane',
  'runtimeDiscoveryRequired',
  'liveStateStored',
  'writesRequireExplicitUserIntent',
  'writesRequireFreshRepositoryAuthority',
  'permissionStateSource',
  'connectionStateSource',
  'truthBoundary',
  'safetyBoundary',
  'plugins',
].sort();
const allowedPluginKeys = ['name', 'role', 'runtimeDiscoveryRequired', 'defaultMode'].sort();
const forbiddenLiveStateKeys = new Set([
  'installed',
  'connected',
  'connection',
  'permission',
  'permissions',
  'permissionmode',
  'oauthscopes',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'secrets',
]);

const normalizedKey = (key) => key.replace(/[_-]/g, '').toLowerCase();

function forbiddenLiveStatePaths(value, path = 'manifest') {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => forbiddenLiveStatePaths(entry, `${path}[${index}]`));
  }
  if (value === null || typeof value !== 'object') return [];

  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenLiveStateKeys.has(normalizedKey(key))) paths.push(childPath);
    paths.push(...forbiddenLiveStatePaths(child, childPath));
  }
  return paths;
}

if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1');
if (manifest.contract !== 'juss/chatgpt-plugin-management@v1') fail('unexpected contract');
if (manifest.repository !== 'jussray/jbh-private') fail('repository identity mismatch');
if (manifest.authorityRepository !== 'jussray/founder-control-room') fail('authority repository mismatch');
if (manifest.controlPlane !== 'ChatGPT Plugin Management') fail('control plane mismatch');
if (manifest.runtimeDiscoveryRequired !== true) fail('runtime discovery must be required');
if (manifest.liveStateStored !== false) fail('live plugin state must not be stored in Git');
if (manifest.writesRequireExplicitUserIntent !== true) fail('plugin writes must require explicit user intent');
if (manifest.writesRequireFreshRepositoryAuthority !== true) fail('plugin writes must require fresh repository authority');
if (manifest.permissionStateSource !== 'chatgpt-runtime') fail('permission state source must be chatgpt-runtime');
if (manifest.connectionStateSource !== 'chatgpt-runtime') fail('connection state source must be chatgpt-runtime');
if (!/does not prove.*installed.*connected.*permitted.*executed/i.test(manifest.truthBoundary || '')) {
  fail('truth boundary must reject live-state claims');
}
if (!/supplier intelligence.*truthful commerce.*purchasing.*customer contact.*separately gated/i.test(manifest.safetyBoundary || '')) {
  fail('commerce authority boundary is missing');
}

if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(allowedManifestKeys)) {
  fail(`manifest schema mismatch: ${JSON.stringify(Object.keys(manifest).sort())}`);
}
for (const path of forbiddenLiveStatePaths(manifest)) fail(`forbidden live-state key at ${path}`);

const plugins = Array.isArray(manifest.plugins) ? manifest.plugins : [];
const pluginNames = plugins.map((plugin) => plugin?.name);
if (JSON.stringify(pluginNames) !== JSON.stringify(expectedPlugins)) {
  fail(`plugin set mismatch: ${JSON.stringify(pluginNames)}`);
}

for (const plugin of plugins) {
  if (!plugin || typeof plugin !== 'object') {
    fail('plugin entries must be objects');
    continue;
  }
  if (JSON.stringify(Object.keys(plugin).sort()) !== JSON.stringify(allowedPluginKeys)) {
    fail(`${plugin.name || 'unknown'}: plugin schema mismatch`);
  }
  if (typeof plugin.role !== 'string' || plugin.role.trim() === '') fail(`${plugin.name}: missing role`);
  if (plugin.runtimeDiscoveryRequired !== true) fail(`${plugin.name}: runtime discovery must be required`);
  if (plugin.defaultMode !== 'read-first') fail(`${plugin.name}: default mode must be read-first`);
}

if (failures.length) {
  console.error('Private hair plugin management contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Private hair plugin management contract passed (${plugins.length} plugins).`);

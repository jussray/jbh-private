import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile(new URL('../.control-room/plugin-management.json', import.meta.url), 'utf8'),
);

const failures = [];
const fail = (message) => failures.push(message);
const expectedPlugins = ['GitHub', 'Shopify', 'HubSpot'];
const forbiddenLiveStateKeys = new Set([
  'installed',
  'connected',
  'permission',
  'permissionMode',
  'permission_mode',
  'oauthScopes',
  'token',
  'secret',
]);

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
  if (typeof plugin.role !== 'string' || plugin.role.trim() === '') fail(`${plugin.name}: missing role`);
  if (plugin.runtimeDiscoveryRequired !== true) fail(`${plugin.name}: runtime discovery must be required`);
  if (plugin.defaultMode !== 'read-first') fail(`${plugin.name}: default mode must be read-first`);
  for (const key of Object.keys(plugin)) {
    if (forbiddenLiveStateKeys.has(key)) fail(`${plugin.name}: forbidden live-state key ${key}`);
  }
}

if (failures.length) {
  console.error('Private hair plugin management contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Private hair plugin management contract passed (${plugins.length} plugins).`);

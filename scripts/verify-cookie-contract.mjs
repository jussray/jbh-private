import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../', import.meta.url);
const policy = JSON.parse(await readFile(new URL('.control-room/cookie-policy.json', root), 'utf8'));
const errors = [];
const requireValue = (condition, message) => {
  if (!condition) errors.push(message);
};

requireValue(policy.repository === 'jussray/jbh-private', 'repository mismatch');
requireValue(policy.firstPartyCookies?.length === 0, 'first-party cookie count must remain zero');
requireValue(policy.platformManagedCookies?.length === 0, 'platform cookie count must remain zero');

const extensions = new Set(['.html', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const excluded = new Set(['node_modules', 'dist', 'build', 'coverage', 'docs', 'vendor-docs', 'brand']);
const patterns = [
  ['document.cookie', /\bdocument\.cookie\b/],
  ['Cookie Store API', /\bcookieStore\b/],
  ['Set-Cookie', /['"`]Set-Cookie['"`]/i],
  ['cookie dependency import', /from\s+['"](?:js-cookie|universal-cookie|cookie|cookie-parser)['"]/],
];

async function scan(directory) {
  let entries;
  try {
    entries = await readdir(new URL(`${directory}/`, root), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const relative = join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      await scan(relative);
      continue;
    }
    if (!extensions.has(extname(entry.name))) continue;
    const source = await readFile(new URL(relative, root), 'utf8');
    for (const [label, pattern] of patterns) {
      if (pattern.test(source)) errors.push(`${relative}: forbidden ${label}`);
    }
  }
}

await scan('admin');

if (errors.length > 0) {
  console.error('Private hair cookie contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Private hair cookie contract verified.');
console.log('Cookies: 0');
console.log('Remote admin authentication: not claimed');

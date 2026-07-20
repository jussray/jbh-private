import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, '.security/cookies.json'), 'utf8'));
const errors = [];
const requireValue = (condition, message) => { if (!condition) errors.push(message); };

requireValue(manifest.schemaVersion === 1, 'schemaVersion must be 1');
requireValue(manifest.defaultPolicy === 'deny-undeclared', 'defaultPolicy must be deny-undeclared');
requireValue(Array.isArray(manifest.cookies) && manifest.cookies.length === 0, 'JBH Private must not issue first-party cookies');
requireValue(Array.isArray(manifest.allowedCookieWriters) && manifest.allowedCookieWriters.length === 0, 'JBH Private must not declare first-party cookie writers');
const access = (manifest.externalCookieProviders ?? []).find((provider) => provider.provider === 'Cloudflare Access');
requireValue(access?.cookie === 'CF_Authorization', 'Cloudflare Access CF_Authorization must be declared as provider-owned');
requireValue(access?.logoutPath === '/cdn-cgi/access/logout', 'Cloudflare Access logout path must be declared');

const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.vercel']);
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html']);
const writerPatterns = [/document\.cookie\s*=/, /setHeader\(\s*['"]Set-Cookie['"]/, /headers\.append\(\s*['"]Set-Cookie['"]/, /createCookieSessionStorage\s*</, /serializeCookieHeader\s*\(/, /\bsetCookie\s*\(/];
const ext = (path) => path.slice(path.lastIndexOf('.'));
async function walk(path) {
  const info = await stat(path);
  if (info.isDirectory()) {
    if (ignored.has(path.split('/').at(-1))) return [];
    return (await Promise.all((await readdir(path)).map((child) => walk(resolve(path, child))))).flat();
  }
  return extensions.has(ext(path)) ? [path] : [];
}

for (const scanRoot of manifest.scanRoots ?? []) {
  let files = [];
  try { files = await walk(resolve(root, scanRoot)); } catch { errors.push(`scan root does not exist: ${scanRoot}`); continue; }
  for (const file of files) {
    const repoPath = relative(root, file).replaceAll('\\', '/');
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(repoPath) || repoPath.includes('/__tests__/')) continue;
    const source = await readFile(file, 'utf8');
    if (writerPatterns.some((pattern) => pattern.test(source))) errors.push(`undeclared first-party cookie writer: ${repoPath}`);
  }
}

const appSource = await readFile(resolve(root, 'admin/client/src/App.tsx'), 'utf8');
requireValue(!appSource.includes('pages/Admin'), 'the local-only Admin.tsx page must not be imported into the production router');
requireValue(appSource.includes('Admin dashboard intentionally NOT bundled'), 'the production router must retain the explicit admin exclusion comment');

const accessSource = await readFile(resolve(root, 'admin/api/_lib/admin.ts'), 'utf8');
for (const fragment of [
  'cf-access-jwt-assertion',
  'RSASSA-PKCS1-v1_5',
  'claims.exp',
  'audiences.includes(expectedAud)',
  'allowedEmails.has(email)',
  'Cache-Control',
]) {
  requireValue(accessSource.includes(fragment), `Cloudflare Access validation is missing ${fragment}`);
}
requireValue(!accessSource.includes('CF_Authorization'), 'the origin must not read the Cloudflare Access browser cookie');

const sessionSource = await readFile(resolve(root, 'admin/api/admin/session.ts'), 'utf8');
requireValue(sessionSource.includes('checkAdmin(req, res)'), 'admin session probe must use the canonical Access validator');
requireValue(sessionSource.includes('private, no-store'), 'admin session probe must be private, no-store');
requireValue(sessionSource.includes('/cdn-cgi/access/logout'), 'admin session probe must expose the Access logout path');

const localAdminSource = await readFile(resolve(root, 'admin/client/src/pages/Admin.tsx'), 'utf8');
requireValue(!appSource.includes('VITE_ADMIN_PASSWORD'), 'production router must not reference a browser-bundled admin password');
requireValue(localAdminSource.includes('Local storage-backed admin dashboard'), 'legacy local dashboard must remain explicitly local-only');

if (errors.length) {
  console.error('Cookie contract verification failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Cookie contract verified for ${manifest.repository}.`);
console.log('First-party cookies: 0');
console.log('Provider cookie: Cloudflare Access CF_Authorization');
console.log('Origin trust input: Cf-Access-Jwt-Assertion');

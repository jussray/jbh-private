import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const wrangler = readFileSync(
  new URL('../../wrangler.toml', import.meta.url),
  'utf8',
);

test('runs the private worker proof bundle before every Wrangler upload', () => {
  assert.match(
    wrangler,
    /^\[build\]\ncommand = "npm run verify:worker:predeploy"$/m,
  );

  const predeploy = pkg.scripts['verify:worker:predeploy'];
  assert.equal(typeof predeploy, 'string');
  assert.match(predeploy, /npm run verify:commerce-seam/);
  assert.match(predeploy, /npm run typecheck:worker/);
  assert.match(predeploy, /npm run test:worker/);
  assert.doesNotMatch(predeploy, /\bwrangler\b|\bdeploy\b/);
});

test('keeps the explicit worker verifier on the same Wrangler build path', () => {
  assert.equal(pkg.scripts['verify:worker'], 'npm run dry-run:worker');
  assert.match(pkg.scripts['dry-run:worker'], /^wrangler deploy --dry-run\b/);
  assert.equal(pkg.scripts.deploy, 'wrangler deploy');
});

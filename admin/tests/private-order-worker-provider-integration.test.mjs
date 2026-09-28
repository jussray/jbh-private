import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('private provider lane remains behind existing Cloudflare Access validation', async () => {
  const index = await read('admin/payment-worker/src/index.ts');
  const admin = await read('admin/payment-worker/src/provider-admin.ts');
  assert.match(index, /pathname === "\/api\/admin\/providers"/);
  assert.match(admin, /validateAccess\(request, env\)/);
  assert.match(admin, /authority: 'none'/);
});

test('private provider runtime keeps keys server-side and bounded', async () => {
  const runtime = await read('admin/payment-worker/src/provider-runtime.ts');
  assert.match(runtime, /OPENAI_API_KEY/);
  assert.match(runtime, /ANTHROPIC_API_KEY/);
  assert.match(runtime, /MODEL_API_KEY/);
  assert.match(runtime, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(runtime, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(runtime, /https:\/\/api\.meta\.ai\/v1\/responses/);
  assert.match(runtime, /restricted_context/);
  assert.match(runtime, /MAX_RESPONSE_BYTES/);
});

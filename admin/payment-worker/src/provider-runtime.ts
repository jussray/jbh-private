import type { Env } from './shared';

const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 60_000;

type ProviderName = 'openai' | 'anthropic' | 'muse';

const PROVIDERS = {
  openai: {key: 'OPENAI_API_KEY', model: 'JBH_PRIVATE_OPENAI_MODEL', defaultModel: 'gpt-5.6-sol', url: 'https://api.openai.com/v1/responses'},
  anthropic: {key: 'ANTHROPIC_API_KEY', model: 'JBH_PRIVATE_ANTHROPIC_MODEL', defaultModel: 'claude-sonnet-5', url: 'https://api.anthropic.com/v1/messages'},
  muse: {key: 'MODEL_API_KEY', model: 'JBH_PRIVATE_MUSE_MODEL', defaultModel: 'muse-spark-1.3', url: 'https://api.meta.ai/v1/responses'},
} as const;

function configFor(env: Env, provider: ProviderName) {
  const config = PROVIDERS[provider];
  return {
    ...config,
    keyValue: String(env[config.key] || '').trim(),
    modelName: String(env[config.model] || '').trim() || config.defaultModel,
  };
}

export function providerStates(env: Env) {
  return Object.fromEntries((Object.keys(PROVIDERS) as ProviderName[]).map((provider) => {
    const config = configFor(env, provider);
    return [provider, {state: config.keyValue ? 'INTEGRATED' : 'ABSENT', model: config.modelName}];
  }));
}

function validId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(id) ? id : null;
}

function extractText(provider: ProviderName, body: Record<string, unknown>): string {
  if (provider === 'anthropic') {
    return (Array.isArray(body.content) ? body.content : []).flatMap((entry) => {
      const block = entry && typeof entry === 'object' ? entry as Record<string, unknown> : null;
      return block?.type === 'text' && typeof block.text === 'string' && block.text.trim() ? [block.text.trim()] : [];
    }).join('\n');
  }
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(body.output) ? body.output : []) {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : null;
    for (const entry of Array.isArray(record?.content) ? record.content : []) {
      const block = entry && typeof entry === 'object' ? entry as Record<string, unknown> : null;
      if (typeof block?.text === 'string' && block.text.trim()) parts.push(block.text.trim());
    }
  }
  return parts.join('\n');
}

export async function invokeProvider(
  env: Env,
  input: {provider?: unknown; prompt?: unknown; sensitivity?: unknown},
  fetchImpl: typeof fetch = fetch,
) {
  const provider = String(input.provider || '').trim().toLowerCase() as ProviderName;
  if (!(provider in PROVIDERS)) throw new Error('unsupported_provider');
  const prompt = String(input.prompt || '').trim();
  if (!prompt || prompt.length > 12_000) throw new Error('invalid_prompt');
  if (String(input.sensitivity || 'standard').trim().toLowerCase() === 'restricted') throw new Error('restricted_context');
  const config = configFor(env, provider);
  if (!config.keyValue) throw new Error(`${provider}_not_configured`);

  const headers: Record<string, string> = provider === 'anthropic'
    ? {'x-api-key': config.keyValue, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}
    : {authorization: `Bearer ${config.keyValue}`, 'content-type': 'application/json'};
  const body = provider === 'anthropic'
    ? {model: config.modelName, max_tokens: 1200, messages: [{role: 'user', content: prompt}]}
    : {model: config.modelName, input: prompt, store: false, max_output_tokens: 1200};

  let response: Response;
  try {
    response = await fetchImpl(config.url, {method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS)});
  } catch {
    throw new Error(`${provider}_request_failed`);
  }
  if (!response.ok) throw new Error(`${provider}_http_${response.status}`);
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) throw new Error(`${provider}_response_too_large`);
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error(`${provider}_invalid_json`); }
  const id = validId(parsed.id);
  if (!id) throw new Error(`${provider}_invalid_response_id`);
  const text = extractText(provider, parsed);
  if (!text) throw new Error(`${provider}_empty_response`);
  return {
    state: 'INTEGRATED' as const,
    provider,
    model: config.modelName,
    responseId: id,
    evidenceRef: `provider:${provider === 'muse' ? 'meta' : provider}:${id}`,
    authority: 'none' as const,
    text,
  };
}

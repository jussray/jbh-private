import { validateAccess } from './access';
import { invokeProvider, providerStates } from './provider-runtime';
import { type Env, json, MAX_ADMIN_BODY_BYTES, readBoundedText, safeErrorCode } from './shared';

export async function handleProviderAdminRequest(request: Request, env: Env): Promise<Response> {
  if (!(await validateAccess(request, env))) {
    return json({error: 'Unauthorized'}, 401);
  }

  if (request.method === 'GET') {
    return json({service: 'jbh-private-order-control', providers: providerStates(env), authority: 'none'});
  }

  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, 405, {Allow: 'GET, POST'});
  }

  let input: Record<string, unknown>;
  try {
    const raw = await readBoundedText(request, MAX_ADMIN_BODY_BYTES);
    input = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({error: 'Invalid request'}, 400);
  }

  try {
    const result = await invokeProvider(env, input);
    return json({service: 'jbh-private-order-control', result});
  } catch (error) {
    return json({error: safeErrorCode(error)}, 503);
  }
}

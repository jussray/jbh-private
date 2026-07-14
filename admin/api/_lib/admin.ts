/**
 * admin/api/_lib/admin.ts
 *
 * Cloudflare Access JWT validation — replaces the x-admin-password header.
 *
 * Usage (in any admin route):
 *   import { validateCfAccessJwt } from './_lib/admin';
 *   const ok = await validateCfAccessJwt(request, env.CF_ACCESS_AUD);
 *   if (!ok) return new Response('Unauthorized', { status: 401 });
 *
 * CF_ACCESS_AUD is set as a Worker secret via: wrangler secret put CF_ACCESS_AUD
 * The value is the Application Audience (AUD) tag shown in the Access app settings.
 */

const CF_ACCESS_CERTS_URL =
  'https://[your-team].cloudflareaccess.com/cdn-cgi/access/certs';
// Replace [your-team] with your Cloudflare Access team name before deploying.
// Example: https://jbh.cloudflareaccess.com/cdn-cgi/access/certs

/** Cache public keys for the lifetime of the Worker instance. */
let cachedKeys: CryptoKey[] | null = null;
let cacheExpiry = 0;

async function getPublicKeys(): Promise<CryptoKey[]> {
  const now = Date.now();
  if (cachedKeys && now < cacheExpiry) return cachedKeys;

  const res = await fetch(CF_ACCESS_CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch CF certs: ${res.status}`);

  const { keys } = await res.json() as { keys: JsonWebKey[] };

  cachedKeys = await Promise.all(
    keys.map((jwk) =>
      crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )
    )
  );
  cacheExpiry = now + 10 * 60 * 1000; // re-fetch every 10 minutes
  return cachedKeys;
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    str.length + (4 - (str.length % 4)) % 4,
    '='
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Validates the Cloudflare Access JWT present in the request.
 *
 * Checks:
 *  1. JWT is present in Cf-Access-Jwt-Assertion header
 *  2. Signature is valid against Cloudflare's public keys
 *  3. `aud` claim matches the expected audience tag
 *  4. Token is not expired (`exp` in the future)
 *
 * Returns true only if all four checks pass.
 */
export async function validateCfAccessJwt(
  request: Request,
  expectedAud: string
): Promise<boolean> {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return false;

  const parts = jwt.split('.');
  if (parts.length !== 3) return false;

  let payload: { aud?: string | string[]; exp?: number };
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    return false;
  }

  // Check expiry
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false;

  // Check audience
  const aud = payload.aud;
  const audList = Array.isArray(aud) ? aud : [aud];
  if (!audList.includes(expectedAud)) return false;

  // Verify signature against all known public keys
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);

  try {
    const keys = await getPublicKeys();
    for (const key of keys) {
      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        signature,
        signingInput
      );
      if (valid) return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Legacy shim — kept so existing route files that call checkAdmin()
 * don't break during the transition. Remove once all routes are
 * updated to call validateCfAccessJwt() directly.
 *
 * @deprecated Use validateCfAccessJwt() instead.
 */
export async function checkAdmin(
  request: Request,
  expectedAud: string
): Promise<boolean> {
  return validateCfAccessJwt(request, expectedAud);
}

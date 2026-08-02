import {
  ACCESS_KEY_CACHE_MS,
  type Env,
  SafeProcessingError,
} from "./shared";

type CloudflareJwk = JsonWebKey & { kid?: string };

interface AccessClaims {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

let cachedIssuer = "";
let cachedKeys = new Map<string, CryptoKey>();
let cacheExpiresAt = 0;

function accessIssuer(env: Env): string | null {
  const raw = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  if (!raw) return null;
  const candidate = raw.includes("://")
    ? raw
    : raw.endsWith(".cloudflareaccess.com")
      ? `https://${raw}`
      : `https://${raw}.cloudflareaccess.com`;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !hostname.endsWith(".cloudflareaccess.com") ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }
    return `${url.protocol}//${hostname}`;
  } catch {
    return null;
  }
}

function allowedOwnerEmails(env: Env): Set<string> {
  return new Set(
    (env.CF_ACCESS_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function decodeBase64UrlBytes(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function decodeBase64UrlJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64UrlBytes(segment))) as T;
}

async function refreshAccessKeys(issuer: string): Promise<void> {
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new SafeProcessingError("access_keys_unavailable");

  const body = (await response.json()) as { keys?: CloudflareJwk[] };
  const next = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    next.set(jwk.kid, key);
  }
  cachedIssuer = issuer;
  cachedKeys = next;
  cacheExpiresAt = Date.now() + ACCESS_KEY_CACHE_MS;
}

async function accessPublicKey(issuer: string, kid: string): Promise<CryptoKey | null> {
  if (issuer !== cachedIssuer || Date.now() >= cacheExpiresAt) {
    await refreshAccessKeys(issuer);
  }
  let key = cachedKeys.get(kid) ?? null;
  if (!key) {
    await refreshAccessKeys(issuer);
    key = cachedKeys.get(kid) ?? null;
  }
  return key;
}

export async function validateAccess(request: Request, env: Env): Promise<boolean> {
  const issuer = accessIssuer(env);
  const audience = env.CF_ACCESS_AUD?.trim();
  const allowedEmails = allowedOwnerEmails(env);
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!issuer || !audience || allowedEmails.size === 0 || !jwt) return false;

  const parts = jwt.split(".");
  if (parts.length !== 3) return false;

  let header: JwtHeader;
  let claims: AccessClaims;
  try {
    header = decodeBase64UrlJson<JwtHeader>(parts[0]);
    claims = decodeBase64UrlJson<AccessClaims>(parts[1]);
  } catch {
    return false;
  }

  if (header.alg !== "RS256" || !header.kid) return false;
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now) return false;
  if (claims.nbf && claims.nbf > now) return false;
  if (claims.iat && claims.iat > now + 60) return false;
  if (!claims.sub || claims.iss?.replace(/\/+$/, "") !== issuer) return false;

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) return false;

  const email = claims.email?.trim().toLowerCase();
  if (!email || !allowedEmails.has(email)) return false;

  try {
    const key = await accessPublicKey(issuer, header.kid);
    if (!key) return false;
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64UrlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

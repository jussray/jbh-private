import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Cloudflare Access validation for the owner-only JBH admin API.
 *
 * Required server-side environment variables:
 * - CF_ACCESS_TEAM_DOMAIN: team slug or full https://<team>.cloudflareaccess.com URL
 * - CF_ACCESS_AUD: Access application audience tag
 * - CF_ACCESS_ALLOWED_EMAILS: comma-separated owner email allowlist
 *
 * This module fails closed. It never accepts a browser-bundled password and it
 * never logs JWTs, email addresses, or claims.
 */

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type AccessClaims = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
};

type CloudflareJwk = JsonWebKey & {
  kid?: string;
};

const KEY_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedIssuer = "";
let cachedKeys = new Map<string, CryptoKey>();
let cacheExpiresAt = 0;

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as T;
}

function decodeBase64UrlBytes(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function getIssuer(): string | null {
  const raw = process.env.CF_ACCESS_TEAM_DOMAIN?.trim();
  if (!raw) return null;

  const candidate = raw.includes("://")
    ? raw
    : `https://${raw}.cloudflareaccess.com`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !host.endsWith(".cloudflareaccess.com") ||
      url.pathname !== "/"
    ) {
      return null;
    }
    return `${url.protocol}//${host}`;
  } catch {
    return null;
  }
}

function getAllowedEmails(): Set<string> {
  return new Set(
    (process.env.CF_ACCESS_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function getPublicKey(issuer: string, kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  if (issuer !== cachedIssuer || now >= cacheExpiresAt) {
    cachedIssuer = issuer;
    cachedKeys = new Map<string, CryptoKey>();

    const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error("Cloudflare Access signing keys unavailable");
    }

    const body = (await response.json()) as { keys?: CloudflareJwk[] };
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "RSA") continue;
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      cachedKeys.set(jwk.kid, key);
    }

    cacheExpiresAt = now + KEY_CACHE_TTL_MS;
  }

  return cachedKeys.get(kid) ?? null;
}

function getJwt(req: VercelRequest): string | null {
  const value = req.headers["cf-access-jwt-assertion"];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

async function validateAccessJwt(req: VercelRequest): Promise<boolean> {
  const issuer = getIssuer();
  const expectedAud = process.env.CF_ACCESS_AUD?.trim();
  const allowedEmails = getAllowedEmails();
  const jwt = getJwt(req);

  if (!issuer || !expectedAud || allowedEmails.size === 0 || !jwt) {
    return false;
  }

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
  if (!claims.sub || claims.iss?.replace(/\/+$/, "") !== issuer) return false;

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expectedAud)) return false;

  const email = claims.email?.trim().toLowerCase();
  if (!email || !allowedEmails.has(email)) return false;

  try {
    const key = await getPublicKey(issuer, header.kid);
    if (!key) return false;

    const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = decodeBase64UrlBytes(parts[2]);
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      signedContent,
    );
  } catch {
    return false;
  }
}

/**
 * Authenticate an owner-only admin request and write a safe failure response.
 */
export async function checkAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");

  const configured =
    Boolean(getIssuer()) &&
    Boolean(process.env.CF_ACCESS_AUD?.trim()) &&
    getAllowedEmails().size > 0;

  if (!configured) {
    res.status(503).json({ error: "Admin access is not configured" });
    return false;
  }

  if (!(await validateAccessJwt(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

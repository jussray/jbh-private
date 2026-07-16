import { neon } from "@neondatabase/serverless";
import {
  ACCESS_KEY_CACHE_MS,
  type AccessClaims,
  baseHeaders,
  type CloudflareJwk,
  type Env,
  json,
  type JwtHeader,
  MAX_EXPORT_ORDERS,
  type OnlineOrderRow,
  safeErrorCode,
  SafeProcessingError,
  storedItemsSchema,
  text,
} from "./shared";

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
    // Cloudflare rotates Access signing keys. Refresh once on an unknown key ID.
    await refreshAccessKeys(issuer);
    key = cachedKeys.get(kid) ?? null;
  }
  return key;
}

async function validateAccess(request: Request, env: Env): Promise<boolean> {
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

function safeDate(value: string | Date | null): string {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : new Date(0).toISOString();
}

function exportAddress(value: unknown): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const decoded = typeof value === "string" ? JSON.parse(value) : value;
  const record =
    decoded && typeof decoded === "object"
      ? (decoded as Record<string, unknown>)
      : {};
  return {
    street: typeof record.street === "string" ? record.street : "",
    city: typeof record.city === "string" ? record.city : "",
    state: typeof record.state === "string" ? record.state : "",
    zip: typeof record.zip === "string" ? record.zip : "",
  };
}

function exportItems(value: unknown) {
  const decoded = typeof value === "string" ? JSON.parse(value) : value;
  const parsed = storedItemsSchema.safeParse(decoded);
  if (!parsed.success) throw new SafeProcessingError("invalid_stored_items");
  return parsed.data.map((item) => ({
    id: item.id,
    name: item.name,
    variant: item.variant,
    price: item.priceCents / 100,
    qty: item.quantity,
    assignedVendorId: "",
    routeId: "",
    vendorSku: "",
    vendorUnitCost: 0,
    vendorStatus: "unassigned",
  }));
}

export async function handleAdminOrderExport(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET") {
    return text("Method not allowed", 405, { Allow: "GET" });
  }
  if (!(await validateAccess(request, env))) {
    return json({ error: "Unauthorized" }, 401, {
      "Cache-Control": "private, no-store, max-age=0",
    });
  }
  if (!env.DATABASE_URL) return json({ error: "Order storage unavailable" }, 503);

  try {
    const sql = neon(env.DATABASE_URL);
    const rows = (await sql`
      SELECT checkout_attempt_id, stripe_session_id, payment_status, currency,
             subtotal_cents, shipping_cents, total_cents, items_json,
             customer_name, customer_email, customer_phone,
             shipping_address_json, created_at, paid_at
      FROM online_orders
      WHERE payment_status = 'paid'
      ORDER BY paid_at DESC
      LIMIT ${MAX_EXPORT_ORDERS}
    `) as unknown as OnlineOrderRow[];

    const orders = rows.map((row) => ({
      id: `WEB-${row.checkout_attempt_id}`,
      createdAt: safeDate(row.paid_at ?? row.created_at),
      source: "website",
      customerName: row.customer_name ?? "",
      email: row.customer_email ?? "",
      phone: row.customer_phone ?? "",
      address: exportAddress(row.shipping_address_json),
      items: exportItems(row.items_json),
      subtotal: Number(row.subtotal_cents) / 100,
      shipping: Number(row.shipping_cents) / 100,
      total: Number(row.total_cents) / 100,
      status: "paid",
      notes: "",
      paymentLink: "",
    }));

    const headers = baseHeaders();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set(
      "Content-Disposition",
      'attachment; filename="jbh-online-orders-export.json"',
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    return new Response(
      JSON.stringify(
        {
          exportType: "jbh-online-orders-export",
          version: 1,
          exportedAt: new Date().toISOString(),
          orders,
        },
        null,
        2,
      ),
      { status: 200, headers },
    );
  } catch (error) {
    console.error(`[ADMIN] order export failed (${safeErrorCode(error)})`);
    return json({ error: "Unable to export orders" }, 500, {
      "Cache-Control": "private, no-store, max-age=0",
    });
  }
}

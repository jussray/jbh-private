import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import { z } from "zod";
import { getProduct } from "../../client/src/lib/catalog";

interface Env {
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STORE_ORIGIN: string;
  WORKER_HOST: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  CF_ACCESS_ALLOWED_EMAILS: string;
}

interface OnlineOrderRow {
  checkout_attempt_id: string;
  cart_fingerprint: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_status: string;
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  items_json: unknown;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address_json: unknown;
  created_at: string | Date;
  paid_at: string | Date | null;
}

interface StripeSessionCompat extends Stripe.Checkout.Session {
  collected_information?: {
    shipping_details?: {
      name?: string | null;
      address?: Stripe.Address | null;
    } | null;
  } | null;
  shipping_details?: {
    name?: string | null;
    address?: Stripe.Address | null;
  } | null;
}

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

type CloudflareJwk = JsonWebKey & { kid?: string };

const FREE_SHIPPING_THRESHOLD_CENTS = 15_000;
const FLAT_SHIPPING_CENTS = 999;
const MAX_CHECKOUT_BODY_BYTES = 64 * 1024;
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const MAX_EXPORT_ORDERS = 5_000;
const EVENT_LEASE_MINUTES = 10;
const STRIPE_API_VERSION = "2025-02-24.acacia" as const;

const checkoutSchema = z.object({
  checkoutAttemptId: z.string().uuid(),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        variant: z.string().trim().min(1).max(100),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(20),
});

class SafeProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SafeProcessingError";
  }
}

let cachedIssuer = "";
let cachedKeys = new Map<string, CryptoKey>();
let cacheExpiresAt = 0;
const ACCESS_KEY_CACHE_MS = 10 * 60 * 1000;

function baseHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = baseHeaders();
  if (extra) {
    const additions = new Headers(extra);
    additions.forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function text(body: string, status: number, extra?: HeadersInit): Response {
  const headers = baseHeaders();
  headers.set("Content-Type", "text/plain; charset=utf-8");
  if (extra) {
    const additions = new Headers(extra);
    additions.forEach((value, key) => headers.set(key, value));
  }
  return new Response(body, { status, headers });
}

function safeErrorCode(error: unknown): string {
  if (error instanceof SafeProcessingError) return error.code.slice(0, 80);
  if (error instanceof Error) return (error.name || "Error").slice(0, 80);
  return "UnknownError";
}

function getConfiguredOrigin(env: Env): string | null {
  try {
    const url = new URL(env.STORE_ORIGIN);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isApprovedHost(request: Request, env: Env): boolean {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const expected = env.WORKER_HOST?.trim().toLowerCase();
  return Boolean(expected) && hostname === expected;
}

function rejectHost(): Response {
  return text("Not found", 404);
}

function checkoutCors(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SafeProcessingError("payload_too_large");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new SafeProcessingError("payload_too_large");
  }
  return raw;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getStripe(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new SafeProcessingError("stripe_not_configured");
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

async function handleCheckout(request: Request, env: Env): Promise<Response> {
  const storeOrigin = getConfiguredOrigin(env);
  if (!storeOrigin || !env.DATABASE_URL || !env.STRIPE_SECRET_KEY) {
    return json({ error: "Payments are not configured" }, 503);
  }

  const requestOrigin = request.headers.get("Origin");
  if (!requestOrigin || requestOrigin !== storeOrigin) {
    return json({ error: "Origin not allowed" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...checkoutCors(requestOrigin),
        "Cache-Control": "no-store",
      },
    });
  }

  if (request.method !== "POST") {
    return text("Method not allowed", 405, {
      ...checkoutCors(requestOrigin),
      Allow: "POST, OPTIONS",
    });
  }

  let input: z.infer<typeof checkoutSchema>;
  try {
    const raw = await readBoundedText(request, MAX_CHECKOUT_BODY_BYTES);
    const parsed = checkoutSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json({ error: "Invalid cart" }, 400, checkoutCors(requestOrigin));
    input = parsed.data;
  } catch (error) {
    const status = safeErrorCode(error) === "payload_too_large" ? 413 : 400;
    return json({ error: status === 413 ? "Request too large" : "Invalid request" }, status, checkoutCors(requestOrigin));
  }

  const canonicalItems: Array<{
    id: string;
    name: string;
    variant: string;
    priceCents: number;
    quantity: number;
    image: string;
  }> = [];

  for (const requested of input.items) {
    const product = getProduct(requested.id);
    const variant = product?.variants.find((candidate) => candidate.option === requested.variant);
    if (!product || !variant) {
      return json(
        { error: "Cart contains an unavailable item" },
        400,
        checkoutCors(requestOrigin),
      );
    }
    canonicalItems.push({
      id: product.id,
      name: product.name,
      variant: variant.option,
      priceCents: Math.round(variant.price * 100),
      quantity: requested.quantity,
      image: new URL(product.image, storeOrigin).toString(),
    });
  }

  const subtotalCents = canonicalItems.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const shippingCents =
    subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
  const totalCents = subtotalCents + shippingCents;
  const canonicalJson = JSON.stringify(canonicalItems);
  const cartFingerprint = await sha256Hex(canonicalJson);
  const sql = neon(env.DATABASE_URL);

  try {
    await sql`
      INSERT INTO online_orders (
        checkout_attempt_id,
        cart_fingerprint,
        currency,
        subtotal_cents,
        shipping_cents,
        total_cents,
        items_json
      ) VALUES (
        ${input.checkoutAttemptId}::uuid,
        ${cartFingerprint},
        'usd',
        ${subtotalCents},
        ${shippingCents},
        ${totalCents},
        ${canonicalJson}::jsonb
      )
      ON CONFLICT (checkout_attempt_id) DO NOTHING
    `;

    const rows = (await sql`
      SELECT checkout_attempt_id, cart_fingerprint, stripe_session_id,
             payment_status, currency, subtotal_cents, shipping_cents,
             total_cents, items_json
      FROM online_orders
      WHERE checkout_attempt_id = ${input.checkoutAttemptId}::uuid
      LIMIT 1
    `) as unknown as OnlineOrderRow[];
    const existing = rows[0];
    if (!existing) throw new SafeProcessingError("checkout_record_missing");
    if (
      existing.cart_fingerprint !== cartFingerprint ||
      Number(existing.total_cents) !== totalCents ||
      existing.currency !== "usd"
    ) {
      return json(
        { error: "Checkout attempt conflict" },
        409,
        checkoutCors(requestOrigin),
      );
    }

    const stripe = getStripe(env);
    if (existing.stripe_session_id) {
      const prior = await stripe.checkout.sessions.retrieve(existing.stripe_session_id);
      if (prior.url && prior.status === "open") {
        return json({ url: prior.url }, 200, checkoutCors(requestOrigin));
      }
      return json(
        { error: "Checkout attempt expired. Return to cart and try again." },
        409,
        checkoutCors(requestOrigin),
      );
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = canonicalItems.map(
      (item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: item.priceCents,
          product_data: {
            name: `${item.name} (${item.variant})`,
            images: [item.image],
          },
        },
      }),
    );

    if (shippingCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: shippingCents,
          product_data: { name: "Shipping" },
        },
      });
    }

    const reference = input.checkoutAttemptId;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_creation: "always",
        line_items: lineItems,
        billing_address_collection: "required",
        shipping_address_collection: { allowed_countries: ["US"] },
        phone_number_collection: { enabled: true },
        client_reference_id: reference,
        metadata: { checkout_attempt_id: reference },
        payment_intent_data: {
          metadata: { checkout_attempt_id: reference },
        },
        // Promotion codes remain disabled until discounts are modeled in the
        // private order ledger and included in webhook amount reconciliation.
        success_url: `${storeOrigin}/#/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${storeOrigin}/#/cart`,
      },
      { idempotencyKey: `jbh-checkout-${reference}` },
    );

    if (!session.url) throw new SafeProcessingError("stripe_session_url_missing");

    const attached = (await sql`
      UPDATE online_orders
      SET stripe_session_id = ${session.id}, updated_at = NOW()
      WHERE checkout_attempt_id = ${reference}::uuid
        AND (stripe_session_id IS NULL OR stripe_session_id = ${session.id})
      RETURNING checkout_attempt_id
    `) as unknown as Array<{ checkout_attempt_id: string }>;
    if (!attached[0]) throw new SafeProcessingError("stripe_session_attach_conflict");

    return json({ url: session.url }, 200, checkoutCors(requestOrigin));
  } catch (error) {
    console.error(`[CHECKOUT] failed (${safeErrorCode(error)})`);
    return json(
      { error: "Checkout failed. Please try again." },
      500,
      checkoutCors(requestOrigin),
    );
  }
}

async function claimWebhookEvent(
  sql: ReturnType<typeof neon>,
  eventId: string,
  eventType: string,
): Promise<"claimed" | "completed" | "busy"> {
  const claimed = (await sql`
    INSERT INTO stripe_webhook_receipts (
      stripe_event_id,
      event_type,
      status,
      attempts,
      lease_started_at,
      updated_at
    ) VALUES (
      ${eventId},
      ${eventType},
      'processing',
      1,
      NOW(),
      NOW()
    )
    ON CONFLICT (stripe_event_id) DO UPDATE SET
      event_type = EXCLUDED.event_type,
      status = 'processing',
      attempts = stripe_webhook_receipts.attempts + 1,
      lease_started_at = NOW(),
      completed_at = NULL,
      last_error = NULL,
      updated_at = NOW()
    WHERE stripe_webhook_receipts.status = 'failed'
       OR (
         stripe_webhook_receipts.status = 'processing'
         AND stripe_webhook_receipts.lease_started_at < NOW() - (${EVENT_LEASE_MINUTES} * INTERVAL '1 minute')
       )
    RETURNING stripe_event_id
  `) as unknown as Array<{ stripe_event_id: string }>;
  if (claimed[0]) return "claimed";

  const existing = (await sql`
    SELECT status
    FROM stripe_webhook_receipts
    WHERE stripe_event_id = ${eventId}
    LIMIT 1
  `) as unknown as Array<{ status: string }>;
  return existing[0]?.status === "completed" ? "completed" : "busy";
}

async function completeWebhookEvent(
  sql: ReturnType<typeof neon>,
  eventId: string,
): Promise<void> {
  await sql`
    UPDATE stripe_webhook_receipts
    SET status = 'completed', completed_at = NOW(), last_error = NULL, updated_at = NOW()
    WHERE stripe_event_id = ${eventId}
  `;
}

async function failWebhookEvent(
  sql: ReturnType<typeof neon>,
  eventId: string,
  error: unknown,
): Promise<void> {
  await sql`
    UPDATE stripe_webhook_receipts
    SET status = 'failed', last_error = ${safeErrorCode(error)}, updated_at = NOW()
    WHERE stripe_event_id = ${eventId}
  `;
}

function parseItems(value: unknown): Array<{
  id: string;
  name: string;
  variant: string;
  priceCents: number;
  quantity: number;
}> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new SafeProcessingError("invalid_stored_items");
  return parsed as Array<{
    id: string;
    name: string;
    variant: string;
    priceCents: number;
    quantity: number;
  }>;
}

async function markOnlineOrderPaid(
  sql: ReturnType<typeof neon>,
  session: StripeSessionCompat,
): Promise<void> {
  const reference = session.metadata?.checkout_attempt_id;
  if (!reference || !z.string().uuid().safeParse(reference).success) {
    throw new SafeProcessingError("invalid_checkout_reference");
  }
  if (session.payment_status !== "paid") return;

  const rows = (await sql`
    SELECT checkout_attempt_id, stripe_session_id, payment_status, currency,
           subtotal_cents, shipping_cents, total_cents, items_json
    FROM online_orders
    WHERE checkout_attempt_id = ${reference}::uuid
    LIMIT 1
  `) as unknown as OnlineOrderRow[];
  const order = rows[0];
  if (!order) throw new SafeProcessingError("online_order_not_found");
  if (!order.stripe_session_id || order.stripe_session_id !== session.id) {
    throw new SafeProcessingError("stripe_session_mismatch");
  }
  if (session.currency !== order.currency || session.amount_total !== Number(order.total_cents)) {
    throw new SafeProcessingError("amount_or_currency_mismatch");
  }

  const shipping =
    session.collected_information?.shipping_details ?? session.shipping_details ?? null;
  const address = shipping?.address ?? null;
  const customerName = shipping?.name?.trim() || session.customer_details?.name?.trim() || null;
  const customerEmail = session.customer_details?.email?.trim().toLowerCase() || null;
  const customerPhone = session.customer_details?.phone?.trim() || null;
  if (!customerName || !customerEmail || !address?.line1 || !address.city || !address.state || !address.postal_code) {
    throw new SafeProcessingError("required_customer_details_missing");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  const addressJson = JSON.stringify({
    street: address.line2 ? `${address.line1}, ${address.line2}` : address.line1,
    city: address.city,
    state: address.state,
    zip: address.postal_code,
    country: address.country ?? "US",
  });

  const updated = (await sql`
    UPDATE online_orders
    SET payment_status = 'paid',
        fulfillment_status = CASE
          WHEN fulfillment_status = 'new' THEN 'processing'
          ELSE fulfillment_status
        END,
        stripe_payment_intent_id = ${paymentIntentId},
        customer_name = ${customerName},
        customer_email = ${customerEmail},
        customer_phone = ${customerPhone},
        shipping_address_json = ${addressJson}::jsonb,
        paid_at = COALESCE(paid_at, NOW()),
        updated_at = NOW()
    WHERE checkout_attempt_id = ${reference}::uuid
      AND stripe_session_id = ${session.id}
      AND currency = ${session.currency}
      AND total_cents = ${session.amount_total}
    RETURNING checkout_attempt_id
  `) as unknown as Array<{ checkout_attempt_id: string }>;
  if (!updated[0]) throw new SafeProcessingError("paid_order_update_failed");
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return text("Method not allowed", 405, { Allow: "POST" });
  }
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.DATABASE_URL) {
    return text("Stripe not configured", 503);
  }

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) return text("Missing signature", 400);

  let event: Stripe.Event;
  try {
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BODY_BYTES);
    const stripe = getStripe(env);
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    console.error("[WEBHOOK] signature verification failed");
    return text("Invalid signature", 400);
  }

  const supported =
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded";
  if (!supported) return json({ received: true });

  const sql = neon(env.DATABASE_URL);
  let claim: "claimed" | "completed" | "busy";
  try {
    claim = await claimWebhookEvent(sql, event.id, event.type);
  } catch {
    return text("Webhook processing unavailable", 500);
  }
  if (claim === "completed") return json({ received: true, duplicate: true });
  if (claim === "busy") return text("Webhook already processing", 409);

  try {
    await markOnlineOrderPaid(sql, event.data.object as StripeSessionCompat);
    await completeWebhookEvent(sql, event.id);
    console.log(`[WEBHOOK] processed ${event.type} event …${event.id.slice(-8)}`);
    return json({ received: true });
  } catch (error) {
    try {
      await failWebhookEvent(sql, event.id, error);
    } catch {
      console.error(`[WEBHOOK] receipt update failed for event …${event.id.slice(-8)}`);
    }
    console.error(
      `[WEBHOOK] processing failed for event …${event.id.slice(-8)} (${safeErrorCode(error)})`,
    );
    return text("Webhook processing failed", 500);
  }
}

function getIssuer(env: Env): string | null {
  const raw = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  if (!raw) return null;
  const candidate = raw.includes("://") ? raw : `https://${raw}.cloudflareaccess.com`;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !hostname.endsWith(".cloudflareaccess.com") ||
      url.pathname !== "/"
    ) {
      return null;
    }
    return `${url.protocol}//${hostname}`;
  } catch {
    return null;
  }
}

function getAllowedEmails(env: Env): Set<string> {
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

async function getAccessPublicKey(issuer: string, kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  if (issuer !== cachedIssuer || now >= cacheExpiresAt) {
    cachedIssuer = issuer;
    cachedKeys = new Map<string, CryptoKey>();
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new SafeProcessingError("access_keys_unavailable");
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
    cacheExpiresAt = now + ACCESS_KEY_CACHE_MS;
  }
  return cachedKeys.get(kid) ?? null;
}

async function validateAccess(request: Request, env: Env): Promise<boolean> {
  const issuer = getIssuer(env);
  const expectedAudience = env.CF_ACCESS_AUD?.trim();
  const allowedEmails = getAllowedEmails(env);
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!issuer || !expectedAudience || allowedEmails.size === 0 || !jwt) return false;

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
  if (!audiences.includes(expectedAudience)) return false;
  const email = claims.email?.trim().toLowerCase();
  if (!email || !allowedEmails.has(email)) return false;

  try {
    const key = await getAccessPublicKey(issuer, header.kid);
    if (!key) return false;
    const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64UrlBytes(parts[2]),
      signedContent,
    );
  } catch {
    return false;
  }
}

function safeDate(value: string | Date | null): string {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function addressForExport(value: unknown): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return {
    street: typeof record.street === "string" ? record.street : "",
    city: typeof record.city === "string" ? record.city : "",
    state: typeof record.state === "string" ? record.state : "",
    zip: typeof record.zip === "string" ? record.zip : "",
  };
}

async function handleAdminOrderExport(request: Request, env: Env): Promise<Response> {
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
      address: addressForExport(row.shipping_address_json),
      items: parseItems(row.items_json).map((item) => ({
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
      })),
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
    headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isApprovedHost(request, env)) return rejectHost();
    const url = new URL(request.url);

    if (url.pathname === "/api/checkout") return handleCheckout(request, env);
    if (url.pathname === "/api/stripe/webhook") return handleWebhook(request, env);
    if (url.pathname === "/api/admin/orders/export") {
      return handleAdminOrderExport(request, env);
    }
    return json({ error: "Not found" }, 404);
  },
};

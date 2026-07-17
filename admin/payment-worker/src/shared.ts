import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import { z } from "zod";

export interface Env {
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STORE_ORIGIN: string;
  WORKER_HOST: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  CF_ACCESS_ALLOWED_EMAILS: string;
}

export interface OnlineOrderRow {
  checkout_attempt_id: string;
  cart_fingerprint: string;
  stripe_session_id: string | null;
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

export type Sql = ReturnType<typeof neon<false, false>>;
export type CloudflareJwk = JsonWebKey & { kid?: string };

export interface AccessClaims {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
}

export interface JwtHeader {
  alg?: string;
  kid?: string;
}

export const FREE_SHIPPING_THRESHOLD_CENTS = 15_000;
export const FLAT_SHIPPING_CENTS = 999;
export const MAX_CHECKOUT_BODY_BYTES = 64 * 1024;
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
export const MAX_EXPORT_ORDERS = 5_000;
export const EVENT_LEASE_MINUTES = 10;
export const ACCESS_KEY_CACHE_MS = 10 * 60 * 1000;
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-02-24.acacia";

export const checkoutSchema = z.object({
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

export const storedItemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  variant: z.string().max(500),
  priceCents: z.number().int().min(0).max(100_000_000),
  quantity: z.number().int().min(1).max(999),
});
export const storedItemsSchema = z.array(storedItemSchema).min(1).max(100);
export type StoredItem = z.infer<typeof storedItemSchema>;

export class SafeProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SafeProcessingError";
  }
}

export function baseHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
}

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = baseHeaders();
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

export function text(body: string, status: number, extra?: HeadersInit): Response {
  const headers = baseHeaders();
  headers.set("Content-Type", "text/plain; charset=utf-8");
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(body, { status, headers });
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof SafeProcessingError) return error.code.slice(0, 80);
  if (error instanceof Error) return (error.name || "Error").slice(0, 80);
  return "UnknownError";
}

export function checkoutCors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function configuredStoreOrigin(env: Env): string | null {
  try {
    const url = new URL(env.STORE_ORIGIN);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function configuredWorkerHost(env: Env): string | null {
  const value = env.WORKER_HOST?.trim().toLowerCase();
  if (!value || value.includes("://") || value.includes("/") || value.includes(":")) {
    return null;
  }
  if (
    value === "localhost" ||
    value === "127.0.0.1" ||
    value.endsWith(".workers.dev") ||
    value.endsWith(".pages.dev")
  ) {
    return null;
  }
  return value;
}

export function isApprovedHost(request: Request, env: Env): boolean {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const expected = configuredWorkerHost(env);
  return Boolean(expected) && hostname === expected;
}

export async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string> {
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

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function stripeClient(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new SafeProcessingError("stripe_not_configured");
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

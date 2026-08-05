import Stripe from "stripe";

export interface Env {
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  WORKER_HOST: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  CF_ACCESS_ALLOWED_EMAILS: string;
  SHOPIFY_WEBHOOK_SECRET: string;
  SHOPIFY_SHOP_DOMAIN: string;
}

export class SafeProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SafeProcessingError";
  }
}

export const MAX_WEBHOOK_BYTES = 1024 * 1024;
export const MAX_ADMIN_BODY_BYTES = 64 * 1024;
export const MAX_ADMIN_ORDERS = 1000;
export const ACCESS_KEY_CACHE_MS = 10 * 60 * 1000;
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-02-24.acacia";

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

export function stripeClient(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new SafeProcessingError("stripe_not_configured");
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

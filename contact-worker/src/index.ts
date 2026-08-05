import { neon } from "@neondatabase/serverless";
import { z } from "zod";

interface Env {
  DATABASE_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  ALLOWED_CONTACT_ORIGINS?: string;
  ALLOWED_CONTACT_HOSTNAMES?: string;
}

interface TurnstileResult {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

const MAX_BODY_BYTES = 12_000;
const CONTACT_ACTION = "contact";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(2).max(5000),
  consent: z.literal(true),
  turnstileToken: z.string().min(1).max(4096),
  companyWebsite: z.string().max(0).optional().default(""),
});

function splitList(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function responseHeaders(origin?: string): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(body: unknown, status: number, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function approvedOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get("Origin") || undefined;
  if (!origin || !splitList(env.ALLOWED_CONTACT_ORIGINS).includes(origin)) return undefined;
  return origin;
}

function options(origin: string): Response {
  const headers = responseHeaders(origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(null, { status: 204, headers });
}

async function readJson(request: Request, origin: string): Promise<unknown | Response> {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413, origin);

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Request too large" }, 413, origin);
    }
    return JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request" }, 400, origin);
  }
}

async function verifyTurnstile(
  token: string,
  request: Request,
  env: Env,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return false;

  try {
    const form = new FormData();
    form.set("secret", env.TURNSTILE_SECRET_KEY);
    form.set("response", token);
    const remoteIp = request.headers.get("CF-Connecting-IP");
    if (remoteIp) form.set("remoteip", remoteIp);

    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form },
    );
    if (!verification.ok) return false;

    const result = (await verification.json()) as TurnstileResult;
    const allowedHostnames = splitList(env.ALLOWED_CONTACT_HOSTNAMES);
    return Boolean(
      result.success &&
        result.action === CONTACT_ACTION &&
        result.hostname &&
        allowedHostnames.includes(result.hostname),
    );
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`[CONTACT_INGRESS] turnstile_unavailable type=${errorType}`);
    return false;
  }
}

async function fingerprint(email: string, message: string): Promise<string> {
  const tenMinuteBucket = Math.floor(Date.now() / 600_000);
  const normalized = `${email.toLowerCase()}\n${message.trim()}\n${tenMinuteBucket}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  const origin = approvedOrigin(request, env);
  if (!origin) return json({ error: "Origin not allowed" }, 403);
  if (request.method === "OPTIONS") return options(origin);
  if (request.method !== "POST") {
    const headers = responseHeaders(origin);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  if (!env.DATABASE_URL || !env.TURNSTILE_SECRET_KEY) {
    return json({ error: "Contact service unavailable" }, 503, origin);
  }

  const body = await readJson(request, origin);
  if (body instanceof Response) return body;

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid contact message" }, 400, origin);

  const challengePassed = await verifyTurnstile(
    parsed.data.turnstileToken,
    request,
    env,
  );
  if (!challengePassed) return json({ error: "Verification failed" }, 403, origin);

  const receipt = crypto.randomUUID();
  const submissionFingerprint = await fingerprint(
    parsed.data.email,
    parsed.data.message,
  );

  try {
    const sql = neon(env.DATABASE_URL);
    const inserted = await sql`
      INSERT INTO contact_messages (
        name,
        email,
        message,
        receipt_id,
        submission_fingerprint,
        consent_at,
        source
      ) VALUES (
        ${parsed.data.name},
        ${parsed.data.email.toLowerCase()},
        ${parsed.data.message},
        ${receipt},
        ${submissionFingerprint},
        NOW(),
        'jussbeautifulhair.com'
      )
      ON CONFLICT DO NOTHING
      RETURNING receipt_id
    `;

    const storedReceipt = inserted[0]?.receipt_id as string | undefined;
    if (!storedReceipt) {
      return json({ received: true, duplicate: true }, 202, origin);
    }

    return json(
      { received: true, receipt: storedReceipt, duplicate: false },
      201,
      origin,
    );
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`[CONTACT_INGRESS] persistence_failed type=${errorType}`);
    return json({ error: "We couldn't save your message" }, 500, origin);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/contact") return json({ error: "Not found" }, 404);
    return handleContact(request, env);
  },
};

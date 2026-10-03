export type RateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

type RateLimitEnv = {
  JBH_PRIVATE_RATE_LIMITER?: RateLimitBinding;
};

const RETRY_AFTER_SECONDS = 60;

function rateLimitKey(request: Request): string {
  // CF-Connecting-IP is supplied by Cloudflare at the trusted Worker edge.
  // Never use caller-controlled forwarding headers to select limiter buckets.
  const connectingIp = request.headers.get("CF-Connecting-IP")?.trim();
  return connectingIp ? `ip:${connectingIp}` : "ip:unknown";
}

function limitedJson(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(RETRY_AFTER_SECONDS),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function enforcePrivateRateLimit(
  request: Request,
  env: RateLimitEnv,
): Promise<Response | null> {
  const limiter = env.JBH_PRIVATE_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") {
    return limitedJson(503, "rate_limit_unavailable");
  }

  const { success } = await limiter.limit({ key: rateLimitKey(request) });
  if (success) return null;

  return limitedJson(429, "rate_limit_exceeded");
}

import assert from "node:assert/strict";
import test from "node:test";

import { enforcePrivateRateLimit } from "../../.worker-test-dist/rate-limit.js";

function request(path = "/health", headers = {}) {
  return new Request(`https://jbh-private.example${path}`, { headers });
}

test("missing limiter fails closed before private route work", async () => {
  const response = await enforcePrivateRateLimit(request(), {});
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), { error: "rate_limit_unavailable" });
});

test("trusted Cloudflare client IP selects the limiter bucket", async () => {
  let observedKey = null;
  const response = await enforcePrivateRateLimit(
    request("/webhooks/shopify/orders-paid", { "CF-Connecting-IP": "203.0.113.44" }),
    {
      JBH_PRIVATE_RATE_LIMITER: {
        async limit({ key }) {
          observedKey = key;
          return { success: true };
        },
      },
    },
  );

  assert.equal(response, null);
  assert.equal(observedKey, "ip:203.0.113.44");
});

test("caller-controlled forwarding headers cannot rotate limiter buckets", async () => {
  const observed = [];
  const env = {
    JBH_PRIVATE_RATE_LIMITER: {
      async limit({ key }) {
        observed.push(key);
        return { success: true };
      },
    },
  };

  await enforcePrivateRateLimit(request("/api/admin/providers", { "X-Forwarded-For": "198.51.100.10" }), env);
  await enforcePrivateRateLimit(request("/api/admin/providers", { "X-Forwarded-For": "198.51.100.11" }), env);
  assert.deepEqual(observed, ["ip:unknown", "ip:unknown"]);
});

test("exhausted bucket returns 429 with a bounded retry receipt", async () => {
  const response = await enforcePrivateRateLimit(request("/api/stripe/webhook"), {
    JBH_PRIVATE_RATE_LIMITER: {
      async limit() {
        return { success: false };
      },
    },
  });

  assert.equal(response?.status, 429);
  assert.equal(response?.headers.get("retry-after"), "60");
  assert.equal(response?.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "rate_limit_exceeded" });
});

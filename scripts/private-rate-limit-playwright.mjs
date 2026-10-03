/* global process, fetch */

import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.JBH_PRIVATE_EDGE_BASE_URL;
if (!baseURL) throw new Error("JBH_PRIVATE_EDGE_BASE_URL is required");

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const health = await page.goto(`${baseURL}/health`);
  assert.equal(health?.status(), 200, "private health route must be reachable before bucket exhaustion");

  const proof = await page.evaluate(async () => {
    const statuses = [];
    let retryAfter = null;
    let denialBody = null;

    for (let i = 0; i < 160; i += 1) {
      const response = await fetch("/health", { cache: "no-store" });
      statuses.push(response.status);
      if (response.status === 429) {
        retryAfter = response.headers.get("retry-after");
        denialBody = await response.json();
        break;
      }
    }

    const adminAfterExhaustion = await fetch("/api/admin/providers", { cache: "no-store" });
    const shopifyAfterExhaustion = await fetch("/webhooks/shopify/orders-paid", {
      method: "POST",
      cache: "no-store",
    });
    const unknownAfterExhaustion = await fetch("/not-a-route", { cache: "no-store" });

    return {
      statuses,
      retryAfter,
      denialBody,
      adminStatus: adminAfterExhaustion.status,
      shopifyStatus: shopifyAfterExhaustion.status,
      unknownStatus: unknownAfterExhaustion.status,
    };
  });

  assert.ok(proof.statuses.includes(429), "real Worker limiter must eventually reject approved-host traffic");
  assert.equal(proof.retryAfter, "60");
  assert.deepEqual(proof.denialBody, { error: "rate_limit_exceeded" });
  assert.equal(proof.adminStatus, 429, "owner API must share the exhausted ingress bucket");
  assert.equal(proof.shopifyStatus, 429, "signed Shopify webhook must share the exhausted ingress bucket");
  assert.equal(proof.unknownStatus, 429, "unknown approved-host routes must not bypass the broad ingress baseline");

  console.log(JSON.stringify({
    contract: "jbh-private/ingress-rate-limit-browser-proof@v1",
    engine: "playwright+wrangler",
    observedStatuses: proof.statuses,
    adminStatus: proof.adminStatus,
    shopifyStatus: proof.shopifyStatus,
    unknownStatus: proof.unknownStatus,
    retryAfter: proof.retryAfter,
    verifiedOutcome: true,
  }));
} finally {
  await browser.close();
}

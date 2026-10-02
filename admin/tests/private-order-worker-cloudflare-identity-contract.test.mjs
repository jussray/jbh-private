import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("../../scripts/verify-cloudflare-worker-identity.mjs", import.meta.url);
const wrangler = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const seam = JSON.parse(
  readFileSync(new URL("../../.control-room/commerce-seam.json", import.meta.url), "utf8"),
);

function runIdentityCheck(override) {
  const env = { ...process.env };
  if (override === undefined) {
    delete env.WRANGLER_CI_OVERRIDE_NAME;
  } else {
    env.WRANGLER_CI_OVERRIDE_NAME = override;
  }

  return spawnSync(process.execPath, [fileURLToPath(scriptUrl)], {
    env,
    encoding: "utf8",
  });
}

test("runs a non-recursive exact-head Worker proof before every Wrangler upload", () => {
  assert.match(
    wrangler,
    /^\[build\]\ncommand = "npm run verify:worker:cloudflare"$/m,
  );
  const proof = pkg.scripts["verify:worker:cloudflare"];
  assert.equal(typeof proof, "string");
  assert.match(proof, /verify-cloudflare-worker-identity\.mjs/);
  assert.match(proof, /npm run verify:commerce-seam/);
  assert.match(proof, /npm run typecheck:worker/);
  assert.match(proof, /npm run test:worker/);
  assert.doesNotMatch(proof, /\bwrangler\b|\bdeploy\b|\bdry-run:worker\b/);
});

test("uses the canonical private payment-control Worker as the one source service identity", () => {
  assert.equal(seam.privateOrderControl.serviceName, "jbh-private-payment-control");
  assert.equal(seam.privateOrderControl.providerServiceAliases, undefined);
});

test("allows local or ordinary dry runs when Cloudflare supplies no override", () => {
  const result = runIdentityCheck(undefined);
  assert.equal(result.status, 0, result.stderr);
});

test("allows the exact canonical Cloudflare Worker identity", () => {
  const result = runIdentityCheck("jbh-private-payment-control");
  assert.equal(result.status, 0, result.stderr);
});

test("rejects the stale provider Worker label without logging it", () => {
  const result = runIdentityCheck("jbh-private");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cloudflare_worker_identity_mismatch/);
  assert.doesNotMatch(result.stderr, /WRANGLER_CI_OVERRIDE_NAME=/);
});

test("fails closed for any unrecognized Cloudflare Worker override without logging it", () => {
  const result = runIdentityCheck("jbh-private-unknown");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cloudflare_worker_identity_mismatch/);
  assert.doesNotMatch(result.stderr, /jbh-private-unknown/);
  assert.doesNotMatch(result.stderr, /WRANGLER_CI_OVERRIDE_NAME=/);
});

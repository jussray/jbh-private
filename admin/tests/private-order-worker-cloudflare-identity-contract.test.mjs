import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptUrl = new URL("../../scripts/verify-cloudflare-worker-identity.mjs", import.meta.url);
const wrangler = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");

function runIdentityCheck(override) {
  const env = { ...process.env };
  if (override === undefined) {
    delete env.WRANGLER_CI_OVERRIDE_NAME;
  } else {
    env.WRANGLER_CI_OVERRIDE_NAME = override;
  }

  return spawnSync(process.execPath, [scriptUrl], {
    env,
    encoding: "utf8",
  });
}

test("runs the Worker identity guard before every Wrangler upload", () => {
  assert.match(
    wrangler,
    /^\[build\]\ncommand = "node scripts\/verify-cloudflare-worker-identity\.mjs"$/m,
  );
});

test("allows local or ordinary dry runs when Cloudflare supplies no override", () => {
  const result = runIdentityCheck(undefined);
  assert.equal(result.status, 0, result.stderr);
});

test("allows the canonical Cloudflare Worker identity", () => {
  const result = runIdentityCheck("jbh-private-payment-control");
  assert.equal(result.status, 0, result.stderr);
});

test("fails closed when Workers Builds overrides the canonical Worker identity", () => {
  const result = runIdentityCheck("jbh-private");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cloudflare_worker_identity_mismatch/);
  assert.doesNotMatch(result.stderr, /WRANGLER_CI_OVERRIDE_NAME=/);
});

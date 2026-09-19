import { readFileSync } from "node:fs";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const sourceNameMatch = wrangler.match(/^name\s*=\s*"([^"]+)"\s*$/m);

if (!sourceNameMatch) {
  console.error("cloudflare_worker_identity_source_missing");
  process.exit(1);
}

const sourceName = sourceNameMatch[1];
const providerOverride = (process.env.WRANGLER_CI_OVERRIDE_NAME ?? "").trim();

if (providerOverride && providerOverride !== sourceName) {
  console.error("cloudflare_worker_identity_mismatch");
  process.exit(1);
}

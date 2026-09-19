import { readFileSync } from "node:fs";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const contract = JSON.parse(
  readFileSync(new URL("../.control-room/commerce-seam.json", import.meta.url), "utf8"),
);
const sourceNameMatch = wrangler.match(/^name\s*=\s*"([^"]+)"\s*$/m);

if (!sourceNameMatch) {
  console.error("cloudflare_worker_identity_source_missing");
  process.exit(1);
}

const sourceName = sourceNameMatch[1];
const canonicalName = contract?.privateOrderControl?.serviceName;
const aliases = Array.isArray(contract?.privateOrderControl?.providerServiceAliases)
  ? contract.privateOrderControl.providerServiceAliases.filter(
      (value) => typeof value === "string" && value.trim().length > 0,
    )
  : [];

if (!canonicalName || sourceName !== canonicalName) {
  console.error("cloudflare_worker_identity_contract_mismatch");
  process.exit(1);
}

const allowedProviderNames = new Set([canonicalName, ...aliases]);
const providerOverride = (process.env.WRANGLER_CI_OVERRIDE_NAME ?? "").trim();

if (providerOverride && !allowedProviderNames.has(providerOverride)) {
  console.error("cloudflare_worker_identity_mismatch");
  process.exit(1);
}

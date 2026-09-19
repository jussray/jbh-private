import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const contract = JSON.parse(read(".control-room/commerce-seam.json"));
const index = read("admin/payment-worker/src/index.ts");
const model = read("admin/payment-worker/src/shopify-physical-order-model.ts");
const webhook = read("admin/payment-worker/src/shopify-physical-webhook.ts");
const shared = read("admin/payment-worker/src/shared.ts");
const wrangler = read("wrangler.toml");
const readme = read("README.md");
const adminReadme = read("admin/README.md");

function requireTruth(condition, message) {
  if (!condition) {
    console.error(`[commerce-seam] ${message}`);
    process.exit(1);
  }
}

requireTruth(contract.schemaVersion === 1, "schemaVersion must remain 1");
requireTruth(contract.contractId === "jbh-shopify-private-orders@v1", "unexpected contract id");
requireTruth(contract.publicRepository === "jussray/jussbeautifulhair-site", "public repository authority drifted");
requireTruth(contract.privateRepository === "jussray/jbh-private", "private repository authority drifted");
requireTruth(contract.shopify.shopGid === "gid://shopify/Shop/84576043251", "Shopify immutable shop id drifted");
requireTruth(contract.shopify.shopDomain === "8qp1z2-az.myshopify.com", "Shopify shop domain drifted");
requireTruth(contract.shopify.primaryDomain === "jussbeautifulhair.com", "Shopify primary domain drifted");
requireTruth(contract.shopify.apiVersion === "2026-07", "Storefront API version drifted");
requireTruth(contract.shopify.publicVendor === "JBH", "public Shopify vendor boundary drifted");
requireTruth(contract.shopify.catalogPath === "/api/shopify/catalog", "catalog route drifted");
requireTruth(contract.shopify.cartPath === "/api/shopify/cart", "cart route drifted");
requireTruth(contract.shopify.paidTopic === "orders/paid", "paid-order topic drifted");
requireTruth(contract.privateOrderControl.serviceName === "jbh-private-payment-control", "private Worker identity drifted");
requireTruth(
  Array.isArray(contract.privateOrderControl.providerServiceAliases) &&
    contract.privateOrderControl.providerServiceAliases.length === 1 &&
    contract.privateOrderControl.providerServiceAliases[0] === "jbh-private",
  "Cloudflare provider service alias drifted",
);
requireTruth(contract.privateOrderControl.healthPath === "/health", "private health route drifted");
requireTruth(contract.privateOrderControl.paidWebhookPath === "/webhooks/shopify/orders-paid", "private paid webhook route drifted");
requireTruth(contract.productionTruth.authority === "external-provider-evidence", "production truth must stay provider-backed");
requireTruth(contract.productionTruth.repoMergeAloneIsActivationProof === false, "a repository merge must never count as activation proof");
requireTruth(contract.productionTruth.requiredProof.includes("live Shopify shop.id matches shopGid and myshopifyDomain matches shopDomain before provider-affecting actions"), "provider identity preflight is missing from required production proof");

requireTruth(index.includes(`pathname === "${contract.privateOrderControl.healthPath}"`), "private health route does not match the seam contract");
requireTruth(index.includes('service: "jbh-private-order-control"'), "private health route no longer exposes the expected service identity");
requireTruth(index.includes(`pathname === "${contract.privateOrderControl.paidWebhookPath}"`), "private Shopify webhook route does not match the seam contract");
requireTruth(model.includes(`export const SHOPIFY_PAID_TOPIC = "${contract.shopify.paidTopic}"`), "private paid-order topic does not match the seam contract");
requireTruth(webhook.includes("env.SHOPIFY_WEBHOOK_SECRET"), "private webhook no longer requires the Shopify signing secret");
requireTruth(webhook.includes("env.SHOPIFY_SHOP_DOMAIN"), "private webhook no longer requires the canonical Shopify shop domain");
requireTruth(shared.includes("SHOPIFY_WEBHOOK_SECRET: string"), "private Env contract is missing SHOPIFY_WEBHOOK_SECRET");
requireTruth(shared.includes("SHOPIFY_SHOP_DOMAIN: string"), "private Env contract is missing SHOPIFY_SHOP_DOMAIN");
requireTruth(wrangler.includes(`name = "${contract.privateOrderControl.serviceName}"`), "Wrangler service name does not match the seam contract");
requireTruth(wrangler.includes("workers_dev = false"), "private Worker must keep workers.dev disabled");
requireTruth(wrangler.includes("preview_urls = false"), "private Worker must keep preview URLs disabled");

requireTruth(readme.includes(contract.publicRepository), "private README must name the canonical public repository");
requireTruth(readme.includes(contract.contractId), "private README must name the shared commerce contract id");
requireTruth(adminReadme.includes(contract.privateOrderControl.paidWebhookPath), "private admin README must document the Shopify paid-order webhook path");
requireTruth(adminReadme.includes(contract.shopify.shopDomain), "private admin README must document the canonical Shopify shop domain");

console.log(`[commerce-seam] private contract verified: ${contract.contractId}`);

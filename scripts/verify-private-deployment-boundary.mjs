import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function collectFiles(relativePath = ".") {
  const absolute = path.join(root, relativePath);
  if (!(await exists(relativePath))) return [];

  const info = await stat(absolute);
  if (info.isFile()) return [relativePath];

  const result = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) result.push(...(await collectFiles(child)));
    if (entry.isFile()) result.push(child);
  }
  return result;
}

const allFiles = await collectFiles();
const forbiddenManifestNames = new Set([
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
  "vercel.json",
  "netlify.toml",
  "firebase.json",
  "fly.toml",
  "render.yaml",
]);

for (const relativePath of allFiles) {
  if (forbiddenManifestNames.has(path.basename(relativePath))) {
    failures.push(`Deployment manifest is forbidden in the private repository: ${relativePath}`);
  }
}

const packageJson = JSON.parse(await read("admin/package.json"));
if (packageJson.private !== true) {
  failures.push("admin/package.json must set private = true.");
}

const expectedDenyCommand = "node scripts/deny-deploy.mjs";
for (const scriptName of ["security:deny-deploy", "predeploy", "deploy"]) {
  if (packageJson.scripts?.[scriptName] !== expectedDenyCommand) {
    failures.push(`admin package script ${scriptName} must fail closed through ${expectedDenyCommand}.`);
  }
}
if (!String(packageJson.scripts?.dev || "").includes("127.0.0.1")) {
  failures.push("Private admin dev server must bind to 127.0.0.1.");
}
if (!String(packageJson.scripts?.preview || "").includes("127.0.0.1")) {
  failures.push("Private admin preview server must bind to 127.0.0.1.");
}

const viteConfig = await read("admin/vite.config.ts");
const loopbackHostEntries = viteConfig.match(/host:\s*"127\.0\.0\.1"/g) || [];
if (loopbackHostEntries.length < 2) {
  failures.push("Vite server and preview configuration must both bind to loopback.");
}
if (!/dist\/private-local-only/.test(viteConfig)) {
  failures.push("Private build output must remain clearly marked private-local-only.");
}

const workflowFiles = allFiles.filter((file) =>
  file.replaceAll("\\", "/").startsWith(".github/workflows/"),
);
const forbiddenWorkflowPatterns = [
  /cloudflare\/wrangler-action/i,
  /\bwrangler\s+(deploy|versions\s+upload|pages\s+deploy)\b/i,
  /\bnpx\s+vercel\b/i,
  /\bvercel\s+deploy\b/i,
  /\bnpm\s+run\s+deploy\b/i,
  /--temporary\b/i,
  /--preview-alias\b/i,
];

for (const relativePath of workflowFiles) {
  const text = await read(relativePath);
  for (const pattern of forbiddenWorkflowPatterns) {
    if (pattern.test(text)) {
      failures.push(`Private workflow contains a deployment action (${pattern}): ${relativePath}`);
    }
  }
}

if (failures.length) {
  console.error("JBH private deployment boundary verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("JBH private deployment boundary verified: loopback only, no deploy manifests, deploy command denied.");

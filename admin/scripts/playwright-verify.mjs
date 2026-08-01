import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {chromium} from 'playwright';

const host = '127.0.0.1';
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://${host}:${port}`;
const vitePath = fileURLToPath(
  new URL('../node_modules/vite/bin/vite.js', import.meta.url),
);
let serverOutput = '';

const server = spawn(
  process.execPath,
  [vitePath, '--host', host, '--port', String(port)],
  {
    env: {...process.env},
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    serverOutput += text;
    process.stdout.write(text);
  });
}

async function waitForServer(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before verification.\n${serverOutput}`);
    }
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseURL}.\n${serverOutput}`);
}

async function stopServer(timeoutMs = 5_000) {
  if (server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await exited;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});

  await page.goto(baseURL, {waitUntil: 'domcontentloaded'});
  const moat = page.getByTestId('brand-moat');
  await moat.waitFor({state: 'visible'});
  const moatText = normalize(await moat.innerText());
  assert(moatText.includes('Story. Quality. Care. Proof.'), 'Current hair truth heading is missing.');
  assert(moatText.includes('Missing proof stays missing until verified.'), 'Proof boundary is missing.');

  for (const pillar of ['story', 'quality', 'care', 'proof']) {
    assert(
      await page.getByTestId(`brand-moat-${pillar}`).isVisible(),
      `Hair moat pillar ${pillar} is missing.`,
    );
  }

  const homeText = normalize(await page.locator('body').innerText());
  assert(homeText.includes('Royal Raw Indian Temple Bundle'), 'Existing signature hair product disappeared.');
  assert(homeText.includes('16 products across bundles, wigs, closures & essentials.'), 'Hair catalog count or categories changed.');
  assert(!homeText.includes('Crown Logo Cap'), 'Untold Stories products leaked into the hair catalog.');
  for (const unsupported of [
    'Quality Guaranteed',
    'Most orders ship in 2–3 business days',
    'never tangles',
    'lasts 2+ years',
  ]) {
    assert(!homeText.includes(unsupported), `Unsupported homepage certainty remains: ${unsupported}`);
  }

  await page.goto(`${baseURL}/about`, {waitUntil: 'domcontentloaded'});
  const aboutText = normalize(await page.locator('body').innerText());
  assert(aboutText.includes('Beauty can carry memory.'), 'Current hair brand philosophy is missing from About.');
  assert(aboutText.includes('Story, Quality, Care, and Proof'), 'Shared truth language is missing from About.');
  for (const unsupported of ['trusted factories', 'factory pricing']) {
    assert(!aboutText.includes(unsupported), `Unsupported About certainty remains: ${unsupported}`);
  }

  await page.setViewportSize({width: 390, height: 844});
  await page.goto(baseURL, {waitUntil: 'domcontentloaded'});
  await page.getByTestId('button-shop-hero-mobile').waitFor({state: 'visible'});
  assert(await page.getByTestId('brand-moat').isVisible(), 'Brand moat is not visible on mobile.');

  console.log('Playwright verification passed: approved truth mirror, catalog separation, desktop, and mobile.');
} finally {
  await browser?.close();
  await stopServer();
}

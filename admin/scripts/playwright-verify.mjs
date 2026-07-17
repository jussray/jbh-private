import {spawn} from 'node:child_process';
import process from 'node:process';
import {chromium} from 'playwright';

const host = '127.0.0.1';
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://${host}:${port}`;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let serverOutput = '';

const server = spawn(
  npmCommand,
  ['run', 'dev', '--', '--host', host, '--port', String(port)],
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});

  await page.goto(baseURL, {waitUntil: 'networkidle'});
  const moat = page.getByTestId('brand-moat');
  assert(await moat.isVisible(), 'Brand moat section is not visible on the hair homepage.');
  assert((await moat.innerText()).includes('Every crown carries a chapter.'), 'Hair story heading is missing.');

  for (const pillar of ['story', 'quality', 'care', 'proof']) {
    assert(
      await page.getByTestId(`brand-moat-${pillar}`).isVisible(),
      `Hair moat pillar ${pillar} is missing.`,
    );
  }

  const homeText = await page.locator('body').innerText();
  assert(homeText.includes('Royal Raw Indian Temple Bundle'), 'Existing signature hair product disappeared.');
  assert(homeText.includes('16 products across bundles, wigs, closures & essentials.'), 'Hair catalog count or categories changed.');
  assert(!homeText.includes('Crown Logo Cap'), 'Untold Stories products leaked into the hair catalog.');

  await page.goto(`${baseURL}/about`, {waitUntil: 'networkidle'});
  const aboutText = await page.locator('body').innerText();
  assert(aboutText.includes('Beauty carries memory.'), 'Expanded hair brand philosophy is missing from About.');
  assert(aboutText.includes('story, quality, care, and proof'), 'Shared moat language is missing from About.');

  await page.setViewportSize({width: 390, height: 844});
  await page.goto(baseURL, {waitUntil: 'networkidle'});
  assert(await page.getByTestId('button-shop-hero-mobile').isVisible(), 'Mobile hair CTA is not visible.');
  assert(await page.getByTestId('brand-moat').isVisible(), 'Brand moat is not visible on mobile.');

  console.log('Playwright verification passed: hair moat, catalog separation, desktop, and mobile.');
} finally {
  await browser?.close();
  if (server.exitCode === null) server.kill('SIGTERM');
}

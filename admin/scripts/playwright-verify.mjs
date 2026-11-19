import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {chromium} from 'playwright';
import ts from 'typescript';

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

async function loadCommerceRenderer() {
  const source = await readFile(
    new URL('../payment-worker/src/commerce-operations.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('type RecordRow =');
  const end = source.indexOf('function protectedHeaders()', start);
  assert(start >= 0 && end > start, 'Commerce renderer must have stable pure bounds.');
  const {outputText} = ts.transpileModule(source.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
  );
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

  await page.goto(`${baseURL}/#/about`, {waitUntil: 'domcontentloaded'});
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

  const {renderCommerceOperations} = await loadCommerceRenderer();
  const commerceHtml = renderCommerceOperations(
    {
      vendors: [
        {id: 'v-1', display_name: '<script>supplier()</script>'},
        {id: 'v-2', display_name: 'Verified Vendor'},
      ],
      quotes: [
        {
          id: 1,
          vendor_id: 'v-2',
          status: 'verified',
          reply_received_at: '2026-11-18T12:00:00Z',
          source_message_id: 'msg-1',
          valid_until: '2026-12-31',
          currency: 'USD',
          minimum_order_cents: 5000,
          quoted_shipping_cents: 1200,
          branding_summary: 'Private label available',
          shipping_summary: 'Lead time recorded',
          items: [{productId: 'bundle-18', variant: '18 inch', unitCostCents: 2500}],
        },
        {
          id: 2,
          vendor_id: 'v-1',
          status: 'expired',
          reply_received_at: '2026-09-01T12:00:00Z',
          source_thread_id: 'thread-2',
          valid_until: '2026-09-30',
          currency: 'USD',
          items: [],
        },
        {
          id: 3,
          vendor_id: 'v-1',
          status: 'pending',
          currency: 'USD',
          items: [],
        },
      ],
      sampleRequests: [
        {
          id: 7,
          vendor_id: 'v-2',
          status: 'awaiting_owner_approval',
          total_cents: 3500,
          currency: 'USD',
          created_at: '2026-11-18T12:00:00Z',
        },
      ],
    },
    {
      orders: [
        {
          id: 99,
          order_name: '#JBH99',
          shopify_order_id: 'shopify-99',
          payment_status: 'paid',
          total_cents: 11000,
          currency: 'USD',
          procurement_status: 'procurement_needed',
          created_at: '2026-11-18T12:00:00Z',
        },
      ],
    },
    new Date('2026-11-19T12:00:00Z'),
    {
      orders: [
        {
          id: 101,
          paymentStatus: 'paid',
          stripeSessionId: 'cs_test_playwright_123456789012',
          stripePaymentIntentId: 'pi_test_playwright',
          total: 120,
          status: 'processing',
          createdAt: '2026-11-18T12:00:00Z',
          items: [{name: 'Body Wave', variant: '18 inch', qty: 1}],
        },
      ],
    },
  );

  await page.setViewportSize({width: 1440, height: 1000});
  await page.setContent(commerceHtml, {waitUntil: 'domcontentloaded'});
  const commerceText = normalize(await page.locator('body').innerText());

  assert(
    commerceText.includes('Commerce operations, with receipts.'),
    'Commerce workspace heading is missing.',
  );
  for (const stage of ['REVIEW', 'VERIFY', 'PREPARE', 'FULFILL', 'LEARN']) {
    assert(commerceText.includes(stage), `Commerce stage ${stage} is missing.`);
  }
  for (const state of ['CONFIRMED', 'STALE', 'UNKNOWN', 'SANDBOX']) {
    assert(
      await page.locator(`.state.${state.toLowerCase()}`).count() > 0,
      `Commerce evidence state ${state} is missing.`,
    );
  }
  assert(
    commerceText.includes('No vendor selection, messages, orders, refunds, or spending actions run from this page.'),
    'Commerce read-only authority boundary is missing.',
  );
  assert(
    await page.locator('form, button, input, textarea, select').count() === 0,
    'Commerce workspace unexpectedly exposes mutating controls.',
  );
  assert(await page.locator('script').count() === 0, 'Untrusted commerce content created a script element.');
  assert(
    commerceText.includes('<script>supplier()</script>'),
    'Escaped supplier text is not visible as inert text.',
  );

  await page.setViewportSize({width: 390, height: 844});
  await page.setContent(commerceHtml, {waitUntil: 'domcontentloaded'});
  const noBodyOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  assert(noBodyOverflow, 'Commerce workspace overflows the mobile viewport.');

  console.log(
    'Playwright verification passed: approved truth mirror, catalog separation, commerce evidence states, read-only authority, escaping, desktop, and mobile.',
  );
} finally {
  await browser?.close();
  await stopServer();
}

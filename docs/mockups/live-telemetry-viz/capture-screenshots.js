const { chromium } = require('playwright');
const path = require('path');

const OUT = '/opt/cursor/artifacts/screenshots';
const BASE = 'http://127.0.0.1:8765';

const pages = [
  { url: `${BASE}/index.html`, name: 'mockup-index' },
  { url: `${BASE}/resource-monitor-live.html`, name: 'resource-monitor-live-mockup' },
  { url: `${BASE}/environment-intel-live.html`, name: 'environment-intel-live-mockup' },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  for (const page of pages) {
    const p = await context.newPage();
    await p.goto(page.url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2500);
    await p.screenshot({
      path: path.join(OUT, `${page.name}.png`),
      fullPage: true,
    });
    console.log('saved', page.name);
    await p.close();
  }

  await browser.close();
})();

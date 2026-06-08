const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = '/opt/cursor/artifacts/screenshots';
const VIDEO_DIR = '/opt/cursor/artifacts/videos';
const BASE = 'http://127.0.0.1:8765';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const pages = [
  { url: `${BASE}/index.html`, name: 'mockup-index', dwell: 2000 },
  { url: `${BASE}/resource-monitor-live.html`, name: 'resource-monitor-live-mockup', dwell: 8000 },
  { url: `${BASE}/environment-intel-live.html`, name: 'environment-intel-live-mockup', dwell: 8000 },
];

(async () => {
  const browser = await chromium.launch();

  for (const spec of pages) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
    });
    const page = await context.newPage();
    await page.goto(spec.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(OUT_DIR, `${spec.name}.png`),
      fullPage: true,
    });
    console.log('screenshot', spec.name);

    // Scroll through page in fixed steps (long pages)
    await page.evaluate(async () => {
      const step = 120;
      const maxY = document.body.scrollHeight - window.innerHeight;
      for (let y = 0; y <= maxY; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 16));
      }
    });
    await page.waitForTimeout(spec.dwell);

    const video = await page.video();
    await context.close();
    if (video) {
      const webmPath = await video.path();
      const dest = path.join(VIDEO_DIR, `${spec.name}.webm`);
      fs.renameSync(webmPath, dest);
      console.log('video', dest);
    }
  }

  await browser.close();
})();

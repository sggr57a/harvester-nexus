const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = __dirname;
const PREVIEW_DIR = path.join(ROOT, 'previews');
const ARTIFACT_SCREENSHOTS = '/opt/cursor/artifacts/screenshots';
const ARTIFACT_VIDEOS = '/opt/cursor/artifacts/videos';
const BASE = 'http://127.0.0.1:8765';

[PREVIEW_DIR, ARTIFACT_SCREENSHOTS, ARTIFACT_VIDEOS].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const pages = [
  { url: `${BASE}/index.html`, name: 'mockup-index', dwell: 1500, fullPage: true, record: false },
  {
    url: `${BASE}/resource-monitor-live.html`,
    name: 'resource-monitor-live-mockup',
    dwell: 8000,
    fullPage: false,
    record: true,
  },
  {
    url: `${BASE}/environment-intel-live.html`,
    name: 'environment-intel-live-mockup',
    dwell: 8000,
    fullPage: false,
    record: true,
  },
];

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

function buildWalkthroughMp4(sources, dest) {
  if (!sources.every((s) => fs.existsSync(s))) return false;
  const listPath = path.join(PREVIEW_DIR, 'concat-list.txt');
  fs.writeFileSync(listPath, sources.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${dest}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const browser = await chromium.launch();
  const recorded = [];

  for (const spec of pages) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      recordVideo: spec.record ? { dir: ARTIFACT_VIDEOS, size: { width: 1440, height: 900 } } : undefined,
    });
    const page = await context.newPage();
    await page.goto(spec.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const pngName = `${spec.name}.png`;
    const pngPreview = path.join(PREVIEW_DIR, pngName);
    const pngArtifact = path.join(ARTIFACT_SCREENSHOTS, pngName);
    await page.screenshot({ path: pngPreview, fullPage: spec.fullPage !== false });
    copyFile(pngPreview, pngArtifact);
    console.log('screenshot', spec.name);

    if (spec.record) {
      // Let animations run without scrolling (single-screen HUD)
      await page.waitForTimeout(spec.dwell);
    }

    const video = spec.record ? await page.video() : null;
    await context.close();

    if (video) {
      const webmPath = await video.path();
      const webmName = `${spec.name}.webm`;
      const webmPreview = path.join(PREVIEW_DIR, webmName);
      const webmArtifact = path.join(ARTIFACT_VIDEOS, webmName);
      fs.copyFileSync(webmPath, webmPreview);
      copyFile(webmPreview, webmArtifact);
      recorded.push(webmPreview);
      console.log('video', webmPreview);
    }
  }

  await browser.close();

  const walkPreview = path.join(PREVIEW_DIR, 'live-telemetry-mockup-walkthrough.mp4');
  const walkArtifact = '/opt/cursor/artifacts/live-telemetry-mockup-walkthrough.mp4';
  if (buildWalkthroughMp4(recorded, walkPreview)) {
    copyFile(walkPreview, walkArtifact);
    console.log('walkthrough', walkPreview);
  }
})();

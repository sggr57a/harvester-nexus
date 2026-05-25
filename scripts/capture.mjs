// Capture screenshots from the local dev server at http://localhost:4173.
// Usage: node scripts/capture.mjs <route-id> <out-path> [theme-id]
// route-id is one of the CockpitView ids (e.g. dashboard, mission-control,
// telemetry-wave, networking, storage, machines, processor-memory,
// poly-compute, acceleration, environment, activity, operations).
import { chromium } from 'playwright';

const [route = 'dashboard', out = '/opt/cursor/artifacts/shot.png', theme] = process.argv.slice(2);

const BUTTON_LABELS = {
  'mission-control': 'Mission Control',
  dashboard: 'HUD Dashboard',
  'telemetry-wave': 'Telemetry Wave',
  networking: 'Networking',
  storage: 'Storage',
  machines: 'Machines',
  'processor-memory': 'Processor & Memory',
  'poly-compute': 'Poly-Compute',
  acceleration: 'Acceleration',
  operations: 'Operations',
  'resource-monitoring': 'Resource Monitor',
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1.25 });
const page = await context.newPage();
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.getByPlaceholder('USER').fill('admin');
await page.getByPlaceholder('PASSWORD').fill('demo');
await page.getByRole('button', { name: /enter/i }).click();
await page.waitForSelector('.app-shell', { timeout: 20000 });
await page.waitForTimeout(1100);

if (theme) {
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; window.localStorage.setItem('nexus.theme', t); }, theme);
  await page.waitForTimeout(400);
}

const label = BUTTON_LABELS[route];
if (label) {
  // The nav-item buttons in the sidebar render label as inner text; click the first match.
  const candidates = page.locator('.nav-item');
  const count = await candidates.count();
  let clicked = false;
  for (let i = 0; i < count; i += 1) {
    const text = (await candidates.nth(i).innerText()).trim();
    if (text.includes(label)) {
      await candidates.nth(i).click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    // fall back to plain sidebar list buttons
    await page.getByRole('button', { name: label, exact: false }).first().click();
  }
  await page.waitForTimeout(900);
}

await page.screenshot({ path: out, fullPage: true });
console.log('captured', out);
await context.close();
await browser.close();

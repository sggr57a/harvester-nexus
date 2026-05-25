// Captures the login screen at /workspace artifacts dir.
// Usage: node scripts/capture-login.mjs <out-path>
import { chromium } from 'playwright';

const out = process.argv[2] ?? '/opt/cursor/artifacts/login.png';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
const page = await context.newPage();
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.screenshot({ path: out, fullPage: false });
console.log('captured', out);
await context.close();
await browser.close();

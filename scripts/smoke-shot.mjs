import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'artifacts', 'smoke');

const dashboards = ['Networking', 'Storage', 'Machines & Containers', 'Processor & Memory', 'Operations & Compliance'];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('USER').fill('admin');
  await page.getByPlaceholder('PASSWORD').fill('demo');
  await page.getByRole('button', { name: /enter/i }).click();
  await page.waitForSelector('.app-shell', { timeout: 15000 });
  await page.waitForTimeout(900);

  for (const label of dashboards) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(600);
    const file = join(OUT, `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('captured', file);
  }

  const themes = ['Emerald Console', 'Solar Flare', 'Route Grid'];
  for (const theme of themes) {
    await page.getByRole('button', { name: 'Networking', exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator('.theme-picker .theme-option', { hasText: theme }).click();
    await page.waitForTimeout(700);
    const file = join(OUT, `theme-${theme.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-networking.png`);
    await page.screenshot({ path: file });
    console.log('captured', file);
  }

  await context.close();
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });

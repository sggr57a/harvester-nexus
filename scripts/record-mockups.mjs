import { chromium } from 'playwright';
import { mkdir, rename, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'artifacts', 'mockups');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

const VIEWPORT = { width: 1440, height: 900 };
const VIDEO_SIZE = { width: 1440, height: 900 };

const THEMES = [
  { id: 'route-grid', name: 'Route Grid' },
  { id: 'emerald-console', name: 'Emerald Console' },
  { id: 'solar-flare', name: 'Solar Flare' },
];

const DASHBOARDS = [
  { label: 'HUD Dashboard', dwellMs: 1300, scroll: 0 },
  { label: 'Networking', dwellMs: 2400, scroll: 600 },
  { label: 'Storage', dwellMs: 2400, scroll: 700 },
  { label: 'Machines & Containers', dwellMs: 2400, scroll: 600 },
  { label: 'Processor & Memory', dwellMs: 2200, scroll: 500 },
  { label: 'Operations & Compliance', dwellMs: 2600, scroll: 800 },
];

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function newSession(name) {
  const sessionDir = join(OUT, `_raw_${name}`);
  if (existsSync(sessionDir)) await rm(sessionDir, { recursive: true, force: true });
  await mkdir(sessionDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: sessionDir, size: VIDEO_SIZE },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  return { browser, context, page, sessionDir };
}

async function finalize(name, ctx) {
  await ctx.page.close();
  await ctx.context.close();
  await ctx.browser.close();
  const files = (await readdir(ctx.sessionDir)).filter((f) => f.endsWith('.webm'));
  if (files.length === 0) throw new Error(`No video produced for ${name}`);
  const final = join(OUT, `${name}.webm`);
  if (existsSync(final)) await rm(final);
  await rename(join(ctx.sessionDir, files[0]), final);
  await rm(ctx.sessionDir, { recursive: true, force: true });
  console.log(`Recorded ${final}`);
}

async function loginAndLaunch(page) {
  await page.getByPlaceholder('USER').fill('admin', { delay: 70 });
  await pause(300);
  await page.getByPlaceholder('PASSWORD').fill('demo', { delay: 70 });
  await pause(300);
  await page.getByRole('button', { name: /enter|elevating/i }).click();
  await page.waitForSelector('.app-shell', { timeout: 15000 });
  await pause(900);
}

async function selectTheme(page, themeId) {
  const theme = page.locator('.theme-picker .theme-option', { hasText: themeId === 'route-grid' ? 'Route Grid' : themeId === 'emerald-console' ? 'Emerald Console' : 'Solar Flare' });
  await theme.click();
  await pause(700);
}

async function tourDashboards(page) {
  for (const dash of DASHBOARDS) {
    await page.getByRole('button', { name: dash.label, exact: true }).click();
    await pause(900);
    if (dash.scroll > 0) {
      await page.mouse.wheel(0, dash.scroll);
      await pause(dash.dwellMs);
      await page.mouse.wheel(0, -dash.scroll);
      await pause(700);
    } else {
      await pause(dash.dwellMs);
    }
  }
}

async function recordThemeTour(themeId) {
  const name = `theme-${themeId}`;
  const ctx = await newSession(name);
  try {
    await pause(900);
    await loginAndLaunch(ctx.page);
    await selectTheme(ctx.page, themeId);
    await tourDashboards(ctx.page);
  } finally {
    await finalize(name, ctx);
  }
}

async function recordLoginDashboardMenu() {
  const name = '01-login-dashboard-menu';
  const ctx = await newSession(name);
  try {
    await pause(1100);
    await loginAndLaunch(ctx.page);
    const menuButtons = ['HUD Dashboard', 'Networking', 'Storage', 'Machines & Containers', 'Processor & Memory', 'Operations & Compliance', 'Resource Monitoring'];
    for (const label of menuButtons) {
      await ctx.page.getByRole('button', { name: label, exact: true }).click();
      await pause(1100);
    }
    await ctx.page.getByRole('button', { name: 'HUD Dashboard', exact: true }).click();
    await pause(1400);
  } finally {
    await finalize(name, ctx);
  }
}

async function recordResourceMonitoringSecurity() {
  const name = '02-resource-monitoring-security';
  const ctx = await newSession(name);
  try {
    await pause(900);
    await loginAndLaunch(ctx.page);
    await ctx.page.getByRole('button', { name: 'Resource Monitoring', exact: true }).click();
    await pause(1200);
    await ctx.page.mouse.wheel(0, 400);
    await pause(900);
    await ctx.page.mouse.wheel(0, 500);
    await pause(900);
    await ctx.page.mouse.wheel(0, -1200);
    await pause(800);
  } finally {
    await finalize(name, ctx);
  }
}

async function recordClusterMachineWizard() {
  const name = '03-cluster-machine-wizard';
  const ctx = await newSession(name);
  try {
    await pause(800);
    await loginAndLaunch(ctx.page);
    await ctx.page.getByRole('button', { name: 'Cluster Console', exact: true }).click();
    await pause(1300);
    await ctx.page.mouse.wheel(0, 600);
    await pause(800);
    await ctx.page.mouse.wheel(0, -600);
    await pause(500);
    await ctx.page.getByRole('button', { name: 'Machine Wizard', exact: true }).click();
    await pause(1200);
    await ctx.page.getByRole('button', { name: 'Manifest Wizard', exact: true }).click();
    await pause(1200);
    const steps = ['2. Storage', '3. Networking', '4. Security', '5. Monitoring', '6. GitOps', '7. Review'];
    for (const step of steps) {
      await ctx.page.getByRole('button', { name: step, exact: true }).click();
      await pause(800);
    }
    await pause(900);
  } finally {
    await finalize(name, ctx);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const args = process.argv.slice(2);
  const subset = args.length > 0 ? new Set(args) : null;
  const all = [
    { id: 'login-tour', run: recordLoginDashboardMenu },
    { id: 'resource-monitoring', run: recordResourceMonitoringSecurity },
    { id: 'cluster-wizards', run: recordClusterMachineWizard },
    ...THEMES.map((theme) => ({ id: theme.id, run: () => recordThemeTour(theme.id) })),
  ];
  for (const entry of all) {
    if (subset && !subset.has(entry.id)) continue;
    await entry.run();
  }
  console.log('Mockup videos written to', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

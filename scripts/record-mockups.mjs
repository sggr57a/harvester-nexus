import { chromium } from 'playwright';
import { mkdir, rename, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'artifacts', 'mockups');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

const VIEWPORT = { width: 1440, height: 900 };
const VIDEO_SIZE = { width: 1440, height: 900 };

async function pause(ms) {
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
  await page.getByPlaceholder('USER').fill('admin', { delay: 90 });
  await pause(400);
  await page.getByPlaceholder('PASSWORD').fill('demo', { delay: 90 });
  await pause(400);
  await page.getByRole('button', { name: /enter|elevating/i }).click();
  await page.waitForSelector('.app-shell', { timeout: 15000 });
  await pause(900);
}

async function recordLoginDashboardMenu() {
  const name = '01-login-dashboard-menu';
  const ctx = await newSession(name);
  try {
    await pause(1200);
    await loginAndLaunch(ctx.page);
    const menuButtons = ['HUD Dashboard', 'Resource Monitoring', 'Cluster Console', 'Machine Wizard', 'Manifest Wizard'];
    for (const label of menuButtons) {
      await ctx.page.getByRole('button', { name: label, exact: true }).click();
      await pause(1300);
    }
    await ctx.page.getByRole('button', { name: 'HUD Dashboard', exact: true }).click();
    await pause(1500);
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
    const monitoringMenu = ctx.page.locator('.active-work-menu button');
    const monitoringCount = await monitoringMenu.count();
    for (let i = 0; i < Math.min(monitoringCount, 6); i++) {
      await monitoringMenu.nth(i).hover();
      await pause(450);
    }
    await ctx.page.mouse.wheel(0, 350);
    await pause(900);
    await ctx.page.mouse.wheel(0, 500);
    await pause(900);
    await ctx.page.mouse.wheel(0, -1200);
    await pause(800);
    const audits = ctx.page.locator('.security-audit-card');
    const auditsCount = await audits.count();
    for (let i = 0; i < Math.min(auditsCount, 4); i++) {
      await audits.nth(i).hover();
      await pause(500);
    }
    await pause(1200);
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
    await pause(1500);
    await ctx.page.mouse.wheel(0, 600);
    await pause(900);
    await ctx.page.mouse.wheel(0, -600);
    await pause(600);

    await ctx.page.getByRole('button', { name: 'Machine Wizard', exact: true }).click();
    await pause(1300);
    const hostNameInput = ctx.page.locator('.machine-wizard-form input').first();
    await hostNameInput.click();
    await hostNameInput.fill('');
    await hostNameInput.type('nexus-edge-04', { delay: 60 });
    await pause(700);

    const installSelect = ctx.page.locator('.machine-wizard-form select').first();
    await installSelect.selectOption('join');
    await pause(800);
    await installSelect.selectOption('create');
    await pause(700);

    await ctx.page.mouse.wheel(0, 500);
    await pause(900);
    await ctx.page.mouse.wheel(0, 500);
    await pause(900);

    await ctx.page.getByRole('button', { name: 'Manifest Wizard', exact: true }).click();
    await pause(1400);
    const steps = ['2. Storage', '3. Networking', '4. Security', '5. Monitoring', '6. GitOps', '7. Review'];
    for (const step of steps) {
      await ctx.page.getByRole('button', { name: step, exact: true }).click();
      await pause(900);
    }
    await pause(1200);
  } finally {
    await finalize(name, ctx);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await recordLoginDashboardMenu();
  await recordResourceMonitoringSecurity();
  await recordClusterMachineWizard();
  console.log('All mockup videos written to', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

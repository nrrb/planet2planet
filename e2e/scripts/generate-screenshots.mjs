// Generates the README screenshots in docs/images.
//
//   make screenshots     (needs `make up && make seed` first)
//
// The maps are held still (reduced motion) so the same data gives the same pictures. Set BASE_URL to
// photograph a running site instead of starting the dev server.
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../docs/images');
const port = Number(process.env.E2E_PORT ?? 5197);
const base = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const URL_PATH = '/?from=earth&to=mars';

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function startDevServer() {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
    cwd: resolve(here, '../../frontend'),
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await reachable(base)) return child;
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error(`The dev server did not start on ${base}`);
}

/** The share of pixels that differ from the corner: a map that has not drawn is 0. */
function inkShare(buffer) {
  const png = PNG.sync.read(buffer);
  const [r, g, b] = [png.data[0], png.data[1], png.data[2]];
  let ink = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i] - r) + Math.abs(png.data[i + 1] - g) + Math.abs(png.data[i + 2] - b) > 40) ink += 1;
  }
  return ink / (png.width * png.height);
}

async function mapDrawn(canvas) {
  await canvas.waitFor({ state: 'visible', timeout: 60_000 });
  for (let i = 0; i < 40; i += 1) {
    await canvas.page().waitForTimeout(500);
    if (inkShare(await canvas.screenshot()) > 0.003) return;
  }
  throw new Error('A map never drew anything (no WebGL?), so no screenshots were written');
}

const server = process.env.BASE_URL ? null : await startDevServer();
let browser;
try {
  if (!(await reachable(`${base}/api/worlds/`))) throw new Error('The API is not answering. Start it with: make up && make seed');
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  mkdirSync(outDir, { recursive: true });
  const shots = [];

  async function shoot(name, { viewport, scale = 1, theme = 'light', mobile = false }, take) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: scale,
      reducedMotion: 'reduce',
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript((value) => window.localStorage.setItem('p2p-theme', value), theme);
    const page = await context.newPage();
    await page.goto(base + URL_PATH);
    await page.locator('table tbody tr, ul[aria-label="Plans"] > li').first().waitFor({ timeout: 60_000 });
    await take(page, resolve(outDir, `${name}.png`));
    await context.close();
    shots.push(name);
  }

  await shoot('compare', { viewport: { width: 1440, height: 900 } }, async (page, path) => {
    await mapDrawn(page.locator('canvas').first());
    await page.waitForTimeout(800);
    await page.screenshot({ path });
  });

  await shoot('route-map', { viewport: { width: 1100, height: 760 }, theme: 'dark' }, async (page, path) => {
    await page.locator('table tbody tr').first().getByRole('button', { name: 'Route' }).click();
    const dialog = page.getByRole('dialog', { name: /^Route:/ });
    await mapDrawn(dialog.locator('canvas'));
    await page.waitForTimeout(800);
    await dialog.screenshot({ path });
  });

  await shoot('compare-phone', { viewport: { width: 412, height: 915 }, scale: 2, mobile: true }, async (page, path) => {
    // Start at the results heading so the "Sort by" select and the first cards fill the screen.
    await page.getByRole('combobox', { name: 'Sort by' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -130));
    await page.waitForTimeout(500);
    await page.screenshot({ path });
  });

  for (const name of shots) console.log(`Wrote docs/images/${name}.png (${Math.round(statSync(resolve(outDir, `${name}.png`)).size / 1024)} KB)`);
} finally {
  await browser?.close();
  server?.kill();
}

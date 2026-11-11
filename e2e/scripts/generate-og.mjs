// Generates frontend/public/og.png, the picture shown when the site is shared as a link.
//
//   make og            (needs `make up && make seed` first)
//
// It photographs the /share-preview page at 1200 x 630 with the map held still, so the same data gives the same
// picture. Set BASE_URL to photograph a running site instead of starting the dev server.
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../frontend/public/og.png');
const port = Number(process.env.E2E_PORT ?? 5198);
const base = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const W = 1200;
const H = 630;

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

/** The share of pixels that differ from the corner. Only the middle of the picture is checked, where the map is and the text is not. */
function inkShare(buffer) {
  const png = PNG.sync.read(buffer);
  const [r, g, b] = [png.data[0], png.data[1], png.data[2]];
  let ink = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i] - r) + Math.abs(png.data[i + 1] - g) + Math.abs(png.data[i + 2] - b) > 40) ink += 1;
  }
  return ink / (png.width * png.height);
}

const server = process.env.BASE_URL ? null : await startDevServer();
let browser;
try {
  if (!(await reachable(`${base}/api/worlds/`))) {
    throw new Error('The API is not answering. Start it with: make up && make seed');
  }
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto(`${base}/share-preview`);
  await page.waitForSelector('[data-ready="true"] canvas', { timeout: 60_000 });

  // The map draws a moment after its canvas appears; wait until the picture has real content.
  let share = 0;
  for (let i = 0; i < 40 && share < 0.01; i += 1) {
    await page.waitForTimeout(500);
    share = inkShare(await page.screenshot({ clip: { x: 380, y: 0, width: 440, height: H } }));
  }
  if (share < 0.01) throw new Error('The map never drew anything (no WebGL?), so no image was written');
  await page.waitForTimeout(1000);

  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`Wrote ${out} (${Math.round(statSync(out).size / 1024)} KB, ${W} x ${H})`);
} finally {
  await browser?.close();
  server?.kill();
}

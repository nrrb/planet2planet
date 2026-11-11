// Fails if the first page load gets heavier than its budget, or pulls in the map renderer.
// Run after `npm run build`: node scripts/check-bundle.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;
const BUDGET = {
  initialJsGzipKb: 125, // React, the router and the data layer
  initialCssGzipKb: 10,
  lazyChunkGzipKb: 130, // any one lazy chunk, e.g. the map renderer
};
// Anything matching these must be loaded lazily, never as part of the first page.
const MUST_BE_LAZY = /pixi|NetworkScene|MapView|WebGL|WebGPU|CanvasRenderer|Canon|About/i;

const kb = (bytes) => bytes / 1024;
const gzipKb = (file) => kb(gzipSync(readFileSync(join(DIST, file))).length);

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const initialJs = initial.filter((f) => f.endsWith('.js'));
const initialCss = initial.filter((f) => f.endsWith('.css'));

const rows = readdirSync(join(DIST, 'assets'))
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => ({ file: `assets/${f}`, gz: gzipKb(`assets/${f}`), initial: initial.includes(`assets/${f}`) }))
  .sort((a, b) => b.gz - a.gz);

console.log('Chunk'.padEnd(52), 'gzip KB', 'loaded');
for (const r of rows)
  console.log(r.file.padEnd(52), r.gz.toFixed(1).padStart(7), r.initial ? 'first page' : 'on demand');

const jsTotal = initialJs.reduce((sum, f) => sum + gzipKb(f), 0);
const cssTotal = initialCss.reduce((sum, f) => sum + gzipKb(f), 0);
const problems = [];
if (jsTotal > BUDGET.initialJsGzipKb)
  problems.push(`first-page JS is ${jsTotal.toFixed(1)} KB gzipped; budget ${BUDGET.initialJsGzipKb} KB`);
if (cssTotal > BUDGET.initialCssGzipKb)
  problems.push(`first-page CSS is ${cssTotal.toFixed(1)} KB gzipped; budget ${BUDGET.initialCssGzipKb} KB`);
for (const f of initial) {
  if (MUST_BE_LAZY.test(f)) problems.push(`${f} is loaded on the first page but should be lazy`);
}
for (const r of rows) {
  if (!r.initial && r.gz > BUDGET.lazyChunkGzipKb)
    problems.push(`${r.file} is ${r.gz.toFixed(1)} KB gzipped; lazy chunk budget ${BUDGET.lazyChunkGzipKb} KB`);
}
console.log(`\nFirst page: ${jsTotal.toFixed(1)} KB JS + ${cssTotal.toFixed(1)} KB CSS gzipped`);
if (problems.length) {
  console.error('\nBundle check failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Bundle check passed.');

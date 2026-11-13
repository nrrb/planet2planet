// Turns a full dump of the old Django backend's API output into the small fixtures the engine tests use.
//
//   GOLDEN_DIR=/path/to/dump node scripts/make-golden.mjs
//
// The dump comes from the full-stack-aws branch (see docs/adr/0007-static-hosting.md). It holds one JSON
// file per endpoint, quotes-all.json (every ordered pair of worlds) and filtered.json (filtered, sorted
// and invalid queries). This script keeps whole responses for a dozen pairs and every small endpoint,
// and a digest for everything else, so the repository stays small.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = process.env.GOLDEN_DIR;
if (!DIR) throw new Error('Set GOLDEN_DIR to the dump folder.');
const OUT = new URL('../src/engine/__golden__/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const read = (name) => JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf8'));
const write = (name, data) => writeFileSync(new URL(name, OUT), `${JSON.stringify(data)}\n`);

/** Stable JSON: keys sorted. Must match canonical() in src/engine/golden.ts. */
const canonical = (v) =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canonical).join(',')}]`
      : `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(',')}}`;
const digest = (v) => createHash('sha1').update(canonical(v)).digest('hex');

const worlds = read('worlds');
write('catalog.json', {
  worlds,
  regions: read('regions'),
  companies: read('companies'),
  history: read('history'),
  meta: read('meta'),
  network: read('network'),
  canonFacts: read('canon-facts'),
  simulation: read('simulation'),
  worldDetails: Object.fromEntries(worlds.map((w) => [w.id, read(`world-${w.id}`)])),
});

const quotes = read('quotes-all');
const SAMPLE = [
  'jupiter|saturn',
  'earth|mars',
  'earth|neptune',
  'io|europa',
  'ariel|callisto',
  'moon|pluto',
  'venus|eris',
  'titan|mars',
  'ceres|earth',
  'uranus|earth',
  'eris|mercury',
  'ganymede|titan',
];
write('quote-pairs.json', Object.fromEntries(SAMPLE.map((p) => [p, quotes[p]])));

// Errors reach the client as field messages: a list of messages is joined into one string.
const normalise = ({ status, body }) => ({
  status,
  body:
    status === 400
      ? Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : v]))
      : status === 200
        ? body
        : {},
});
const queries = read('filtered');
write('digests.json', {
  quotes: Object.fromEntries(Object.entries(quotes).map(([pair, body]) => [pair, digest(body)])),
  queries: Object.fromEntries(
    Object.entries(queries)
      .filter(([, v]) => v.status === 200)
      .map(([key, v]) => [key, digest(normalise(v))]),
  ),
  failures: Object.fromEntries(
    Object.entries(queries)
      .filter(([, v]) => v.status !== 200)
      .map(([key, v]) => [key, normalise(v)]),
  ),
});
console.log('Wrote fixtures to', OUT.pathname);

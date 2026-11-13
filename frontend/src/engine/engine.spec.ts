import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalogFixture from './__golden__/catalog.json';
import digests from './__golden__/digests.json';
import pairFixtures from './__golden__/quote-pairs.json';
import { digest, firstDiff, plain } from './golden';
import { loadCanon, loadEngine, networkView, quoteFor } from './index';
import { handle } from './router';
import { addDays, pyRound, pyRoundTo, sha1Hex } from './util';

/**
 * The fixtures are what the Django backend answered (see docs/adr/0007-static-hosting.md): the
 * whole catalog, network, canon and simulation, twelve complete quotes, and digests of every
 * other quote. The engine has to reproduce them exactly, so the site shows what it always showed.
 *
 * Set GOLDEN_FULL_DIR to a full dump (with quotes-all.json) to compare all 1,056 pairs.
 */
const catalog = catalogFixture as unknown as Record<string, unknown>;

describe('engine matches the Django backend', () => {
  it('serves the catalog endpoints', async () => {
    const { catalog: engine } = await loadEngine();
    const worlds = catalog.worlds as { id: string }[];
    const actual: Record<string, unknown> = {
      worlds: engine.worldList(),
      regions: engine.regions(),
      companies: engine.companyList(),
      history: engine.history(),
      meta: engine.meta(),
    };
    for (const key of Object.keys(actual)) expect(firstDiff(plain(actual[key]), catalog[key]), key).toBeNull();
    const details = catalog.worldDetails as Record<string, unknown>;
    for (const w of worlds) expect(firstDiff(plain(engine.worldDetail(w.id)), details[w.id]), w.id).toBeNull();
  });

  it('builds the network', async () => {
    expect(firstDiff(plain(networkView(await loadEngine())), catalog.network)).toBeNull();
  });

  it('serves canon facts and the simulation', async () => {
    const canon = await loadCanon();
    expect(firstDiff(plain(canon.canonFacts()), catalog.canonFacts)).toBeNull();
    expect(firstDiff(plain(canon.simulation()), catalog.simulation)).toBeNull();
  });

  it.each(Object.entries(pairFixtures))('quotes %s exactly', async (pair, expected) => {
    const [from, to] = pair.split('|');
    expect(firstDiff(plain(await quoteFor({ from, to })), expected)).toBeNull();
  });

  it('quotes every eighth pair to the same digest', { timeout: 120_000 }, async () => {
    const wrong: string[] = [];
    for (const [i, [pair, expected]] of Object.entries(digests.quotes).entries()) {
      if (i % 8 !== 0) continue;
      const [from, to] = pair.split('|');
      if (digest(plain(await quoteFor({ from, to }))) !== expected) wrong.push(pair);
    }
    expect(wrong).toEqual([]);
  });

  it('filters and sorts like the server did', { timeout: 120_000 }, async () => {
    const wrong: string[] = [];
    for (const [key, expected] of Object.entries(digests.queries)) {
      const reply = await handle(key.startsWith('/api/') ? key : `/api/quotes/?${key}`);
      if (reply.status !== 200 || digest({ status: 200, body: plain(await reply.json()) }) !== expected)
        wrong.push(key);
    }
    expect(wrong).toEqual([]);
  });

  it('rejects bad requests with the same status and messages', async () => {
    for (const [key, expected] of Object.entries(digests.failures) as [string, { status: number; body: unknown }][]) {
      const reply = await handle(key.startsWith('/api/') ? key : `/api/quotes/?${key}`);
      expect({ status: reply.status, body: await reply.json() }, key).toEqual(expected);
    }
  });
});

const FULL = process.env.GOLDEN_FULL_DIR;
describe.skipIf(!FULL || !existsSync(`${FULL}/quotes-all.json`))('every pair of worlds', () => {
  it('matches the full dump', { timeout: 600_000 }, async () => {
    const quotes = JSON.parse(readFileSync(`${FULL}/quotes-all.json`, 'utf8')) as Record<string, unknown>;
    const mismatches: Record<string, string> = {};
    for (const [pair, expected] of Object.entries(quotes)) {
      const [from, to] = pair.split('|');
      const d = firstDiff(plain(await quoteFor({ from, to })), expected);
      if (d) mismatches[pair] = d;
    }
    expect({ count: Object.keys(mismatches).length, shown: Object.entries(mismatches).slice(0, 15) }).toEqual({
      count: 0,
      shown: [],
    });
  });
});

describe('numeric helpers behave like Python', () => {
  it('rounds halves to even, like round()', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4, 2.6].map(pyRound)).toEqual([0, 2, 2, 0, -2, 2, 3]);
  });

  it('rounds to digits like round(x, n), including exact ties', () => {
    expect(pyRoundTo(0.125, 2)).toBe(0.12);
    expect(pyRoundTo(0.375, 2)).toBe(0.38);
    expect(pyRoundTo(2.675, 2)).toBe(2.67);
    expect(pyRoundTo(316.4149, 2)).toBe(316.41);
    expect(pyRoundTo(1, 3)).toBe(1);
  });

  it('hashes like sha1', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex('The quick brown fox jumps over the lazy dog')).toBe('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
    // 56 bytes: the padding spills into a second block.
    expect(sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    );
  });

  it('steps dates across month ends', () => {
    expect(addDays('2380-02-28', 2)).toBe('2380-03-01');
    expect(addDays('2380-06-09', -1)).toBe('2380-06-08');
  });
});

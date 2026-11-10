import { describe, expect, it } from 'vitest';
import type { Offer } from '../../api/types';
import { defaultDir, isSortKey, sortOffers } from './sorting';

const offer = (id: string, patch: Record<string, unknown> = {}): Offer =>
  ({
    id,
    title: id,
    leadCompanyId: id,
    serviceClass: 'shared',
    throughput: 10,
    resilienceTier: 'standard',
    conjunction: 'degraded',
    hops: 3,
    handoffs: 0,
    onNetworkShare: 1,
    latencyMs: { now: 70, min: 70, max: 90 },
    price: { monthly: 500, setup: 300 },
    ...patch,
  }) as unknown as Offer;

const ids = (offers: Offer[]) => offers.map((o) => o.id);
const name = (o: Offer) => o.leadCompanyId;

describe('sortOffers', () => {
  const a = offer('a', { price: { monthly: 900, setup: 100 }, hops: 5, latencyMs: { now: 80, min: 75, max: 120 } });
  const b = offer('b', { price: { monthly: 300, setup: 400 }, hops: 3, latencyMs: { now: 60, min: 60, max: 70 } });
  const c = offer('c', { price: { monthly: 600, setup: 250 }, hops: 4, latencyMs: { now: 70, min: 65, max: 95 } });

  it('sorts numeric columns in either direction', () => {
    expect(ids(sortOffers([a, b, c], 'price', 'asc', name))).toEqual(['b', 'c', 'a']);
    expect(ids(sortOffers([a, b, c], 'price', 'desc', name))).toEqual(['a', 'c', 'b']);
    expect(ids(sortOffers([a, b, c], 'setup', 'asc', name))).toEqual(['a', 'c', 'b']);
    expect(ids(sortOffers([a, b, c], 'hops', 'asc', name))).toEqual(['b', 'c', 'a']);
    expect(ids(sortOffers([a, b, c], 'worst-latency', 'asc', name))).toEqual(['b', 'c', 'a']);
    expect(ids(sortOffers([a, b, c], 'min-latency', 'asc', name))).toEqual(['b', 'c', 'a']);
    expect(ids(sortOffers([a, b, c], 'latency', 'desc', name))).toEqual(['a', 'c', 'b']);
  });

  it('keeps the incoming order for ties', () => {
    const x = offer('x');
    const y = offer('y');
    const z = offer('z');
    expect(ids(sortOffers([x, y, z], 'hops', 'asc', name))).toEqual(['x', 'y', 'z']);
    expect(ids(sortOffers([x, y, z], 'hops', 'desc', name))).toEqual(['x', 'y', 'z']);
  });

  it('orders tiers by resilience and classes by service level', () => {
    const std = offer('std');
    const hard = offer('hard', { resilienceTier: 'hardened' });
    const cont = offer('cont', { resilienceTier: 'contingency' });
    expect(ids(sortOffers([std, cont, hard], 'tier', 'desc', name))).toEqual(['cont', 'hard', 'std']);
    const sync = offer('sync', { serviceClass: 'synchronized' });
    const ded = offer('ded', { serviceClass: 'dedicated' });
    expect(ids(sortOffers([sync, std, ded], 'class', 'asc', name))).toEqual(['std', 'ded', 'sync']);
  });

  it('sorts text columns without regard to case', () => {
    const p = offer('p', { title: 'banana', leadCompanyId: 'Zed' });
    const q = offer('q', { title: 'Apple', leadCompanyId: 'alpha' });
    expect(ids(sortOffers([p, q], 'plan', 'asc', name))).toEqual(['q', 'p']);
    expect(ids(sortOffers([p, q], 'provider', 'asc', name))).toEqual(['q', 'p']);
  });

  it('puts rerouting plans first when sorting by conjunction', () => {
    const r = offer('r', { conjunction: 'rerouted' });
    expect(ids(sortOffers([a, r], 'conjunction', 'asc', name))).toEqual(['r', 'a']);
  });

  it('does not change its input', () => {
    const input = [a, b, c];
    sortOffers(input, 'price', 'asc', name);
    expect(ids(input)).toEqual(['a', 'b', 'c']);
  });
});

describe('sort keys', () => {
  it('knows the keys and starts best-first for resilience, throughput and share', () => {
    expect(isSortKey('price')).toBe(true);
    expect(isSortKey('nonsense')).toBe(false);
    expect(isSortKey(null)).toBe(false);
    expect(defaultDir('tier')).toBe('desc');
    expect(defaultDir('price')).toBe('asc');
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from '../../map/adapter';
import { networkHash, parseNetworkHash } from './networkHash';

describe('network hash', () => {
  it('round-trips filters', () => {
    const filters = {
      layers: ['backbone', 'cross'],
      kinds: ['backbone'],
      providers: ['cassini-link', 'a'],
      region: 'jovian',
    };
    expect(parseNetworkHash(networkHash(filters))).toEqual(filters);
  });

  it('is just #network with no filters, and parses to none', () => {
    expect(networkHash(EMPTY_FILTERS)).toBe('#network');
    expect(parseNetworkHash('#network')).toEqual(EMPTY_FILTERS);
    expect(parseNetworkHash('')).toEqual(EMPTY_FILTERS);
  });

  it('ignores unrelated hashes', () => {
    expect(parseNetworkHash('#history')).toEqual(EMPTY_FILTERS);
  });
});

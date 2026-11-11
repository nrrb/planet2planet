import type { Offer } from '../../api/types';

/** Every column of the comparison table can be sorted. */
export const SORT_KEYS = [
  'plan',
  'provider',
  'price',
  'setup',
  'latency',
  'min-latency',
  'worst-latency',
  'class',
  'throughput',
  'tier',
  'hops',
  'handoffs',
  'share',
  'conjunction',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export const DEFAULT_SORT: SortKey = 'price';

export const isSortKey = (value: string | null): value is SortKey => SORT_KEYS.includes(value as SortKey);

/** Most resilient last, so "descending" puts the best-protected plans first. */
const TIER_ORDER = ['standard', 'hardened', 'diverse-path', 'terraforming-zone', 'contingency'];
const CLASS_ORDER = ['shared', 'dedicated', 'synchronized'];

/** Numbers where bigger is better start with the biggest. */
export const defaultDir = (key: SortKey): SortDir => (['tier', 'throughput', 'share'].includes(key) ? 'desc' : 'asc');

type Name = (offer: Offer) => string;

function value(offer: Offer, key: SortKey, providerName: Name): number | string {
  switch (key) {
    case 'plan':
      return offer.title.toLowerCase();
    case 'provider':
      return providerName(offer).toLowerCase();
    case 'price':
      return offer.price.monthly;
    case 'setup':
      return offer.price.setup;
    case 'latency':
      return offer.latencyMs.now;
    case 'min-latency':
      return offer.latencyMs.min;
    case 'worst-latency':
      return offer.latencyMs.max;
    case 'class':
      return CLASS_ORDER.indexOf(offer.serviceClass);
    case 'throughput':
      return offer.throughput;
    case 'tier':
      return TIER_ORDER.indexOf(offer.resilienceTier);
    case 'hops':
      return offer.hops;
    case 'handoffs':
      return offer.handoffs;
    case 'share':
      return offer.onNetworkShare;
    case 'conjunction':
      return offer.conjunction === 'rerouted' ? 0 : 1;
  }
}

/** A stable sort: ties keep the server's order (cheapest first). */
export function sortOffers(offers: readonly Offer[], key: SortKey, dir: SortDir, providerName: Name): Offer[] {
  const sign = dir === 'asc' ? 1 : -1;
  return offers
    .map((offer, index) => ({ offer, index, v: value(offer, key, providerName) }))
    .sort((a, b) => {
      if (a.v < b.v) return -sign;
      if (a.v > b.v) return sign;
      return a.index - b.index;
    })
    .map((entry) => entry.offer);
}

/** Full names for the sort choices, for places that have no column header to click. */
export const SORT_LABELS: Record<SortKey, string> = {
  plan: 'Plan name',
  provider: 'Provider',
  price: 'Monthly price',
  setup: 'Setup fee',
  latency: 'Latency now',
  'min-latency': 'Best latency over the year',
  'worst-latency': 'Worst latency over the year',
  class: 'Service class',
  throughput: 'Throughput',
  tier: 'Redundancy',
  hops: 'Hops',
  handoffs: 'Hand-offs',
  share: 'Lead provider share',
  conjunction: 'Conjunction',
};

/** Which way the list runs, in words. */
export function directionLabel(key: SortKey, dir: SortDir): string {
  if (key === 'plan' || key === 'provider') return dir === 'asc' ? 'A to Z' : 'Z to A';
  if (key === 'tier') return dir === 'asc' ? 'Least resilient first' : 'Most resilient first';
  return dir === 'asc' ? 'Lowest first' : 'Highest first';
}

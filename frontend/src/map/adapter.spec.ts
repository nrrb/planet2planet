import { describe, expect, it } from 'vitest';
import type { Company, Network, Offer, World } from '../api/types';
import { buildMapModel, EMPTY_FILTERS, networkRenderLinks, routeRenderLinks } from './adapter';

const link = (id: string, layer: string, a: string, b: string, operator: string) => ({
  id,
  layer,
  a,
  b,
  operator,
  established: 2200,
  processingMs: 0.5,
  hardened: false,
  capacityClass: 'trunk',
  degraded: false,
});
const node = (id: string, region: string | null) => ({
  id,
  kind: 'constellation',
  world: null,
  region,
  fixedPosition: null,
});
const NETWORK = {
  siteDate: '2380-06-09',
  stardate: '57436.2',
  nodes: [
    node('c-jupiter', 'jovian'),
    node('h-jovian', 'jovian'),
    node('h-saturnian', 'saturnian'),
    node('c-saturn', 'saturnian'),
  ],
  links: [
    link('mesh-j-jupiter-hj', 'mesh', 'c-jupiter', 'h-jovian', 'j'),
    link('bb-j-hj-hs', 'backbone', 'h-jovian', 'h-saturnian', 'j'),
    link('mesh-j-hs-saturn', 'mesh', 'c-saturn', 'h-saturnian', 'j'),
    link('bb-a-hj-hs', 'backbone', 'h-jovian', 'h-saturnian', 'a'),
    link('conj-j-hj-r1', 'conjunction', 'h-jovian', 'r-1', 'j'),
  ],
  orbits: {},
} as unknown as Network;
const COMPANIES = new Map(
  [
    { id: 'j', name: 'Jovian Subspace', kind: 'backbone' },
    { id: 'a', name: 'Ares Interplanetary', kind: 'backbone' },
  ].map((c) => [c.id, c as Company]),
);
const WORLDS = [
  { id: 'jupiter', name: 'Jupiter', type: 'planet', parent: null, region: 'jovian', eligible: true, radiusKm: 69911 },
] as World[];
const OFFER = {
  leadCompanyId: 'j',
  partnerIds: [],
  conjunction: 'rerouted',
  segments: [
    {
      companyId: 'j',
      layer: 'mesh',
      nodeIds: ['c-jupiter', 'h-jovian'],
      linkIds: ['mesh-j-jupiter-hj'],
      lengthKm: 0,
      latencyMs: 1,
    },
    {
      companyId: 'j',
      layer: 'backbone',
      nodeIds: ['h-jovian', 'h-saturnian'],
      linkIds: ['bb-j-hj-hs'],
      lengthKm: 1_000_000_000,
      latencyMs: 70,
    },
    {
      companyId: 'j',
      layer: 'mesh',
      nodeIds: ['h-saturnian', 'c-saturn'],
      linkIds: ['mesh-j-hs-saturn'],
      lengthKm: 0,
      latencyMs: 1,
    },
  ],
} as unknown as Offer;

const model = buildMapModel(WORLDS, NETWORK);

describe('routeRenderLinks', () => {
  it('orders each link the way traffic flows, even when the stored link points the other way', () => {
    const links = routeRenderLinks(model, OFFER, COMPANIES).filter((l) => l.emphasis === 'route');
    expect(links.map((l) => [l.from, l.to])).toEqual([
      ['c-jupiter', 'h-jovian'],
      ['h-jovian', 'h-saturnian'],
      ['h-saturnian', 'c-saturn'], // stored as c-saturn to h-saturnian
    ]);
  });

  it('reports carrier, layer, length and latency share for hover', () => {
    const backbone = routeRenderLinks(model, OFFER, COMPANIES).find((l) => l.id === 'bb-j-hj-hs');
    expect(backbone?.info).toMatchObject({ carrier: 'Jovian Subspace', layer: 'Backbone', lengthKm: 1_000_000_000 });
    expect(backbone?.info.latencyShare).toBeCloseTo(70 / 72, 5);
  });

  it('keeps other long-haul links of the offer’s carriers as faint context, and nobody else’s', () => {
    const links = routeRenderLinks(model, OFFER, COMPANIES);
    expect(links.find((l) => l.id === 'bb-a-hj-hs')).toBeUndefined();
    const context = links.filter((l) => l.emphasis === 'context');
    expect(context.map((l) => l.id)).toEqual(['conj-j-hj-r1']); // the offer reroutes
    const plain = routeRenderLinks(model, { ...OFFER, conjunction: 'degraded' }, COMPANIES);
    expect(plain.filter((l) => l.emphasis === 'context')).toEqual([]);
  });
});

describe('networkRenderLinks', () => {
  it('shows everything with no filters', () => {
    expect(networkRenderLinks(model, COMPANIES, EMPTY_FILTERS)).toHaveLength(5);
  });

  it('filters by layer, kind and region', () => {
    expect(networkRenderLinks(model, COMPANIES, { ...EMPTY_FILTERS, layers: ['backbone'] })).toHaveLength(2);
    expect(networkRenderLinks(model, COMPANIES, { ...EMPTY_FILTERS, kinds: ['gateway'] })).toHaveLength(0);
    const saturnian = networkRenderLinks(model, COMPANIES, { ...EMPTY_FILTERS, region: 'saturnian' });
    expect(saturnian.map((l) => l.id).sort()).toEqual(['bb-a-hj-hs', 'bb-j-hj-hs', 'mesh-j-hs-saturn']);
  });

  it('lights a chosen provider and dims the rest', () => {
    const links = networkRenderLinks(model, COMPANIES, { ...EMPTY_FILTERS, providers: ['a'] });
    expect(links.filter((l) => l.emphasis === 'route').map((l) => l.id)).toEqual(['bb-a-hj-hs']);
    expect(links.filter((l) => l.emphasis === 'dim')).toHaveLength(4);
  });
});

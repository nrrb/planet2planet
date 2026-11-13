/**
 * The in-browser engine: everything the site used to ask the server for. It builds the carrier
 * network, prices plans and answers quotes from the committed data files, on the visitor's
 * machine. This module is loaded on demand, and the big data files load separately from it.
 */

import type { SolTelecomDataset } from '@data/sol-telecom-2380';
import type { MonteCarloSummary } from '@data/sol-montecarlo-2380';
import type { Network as ApiNetwork, QuoteResponse } from '../api/types';
import { ApiError } from '../api/errors';
import { Canon, type CanonFactsFile } from './canon';
import { Catalog, SITE_DATE, SITE_STARDATE, SITE_YEAR } from './catalog';
import { Network, parseOrbitInputs } from './network';
import { OfferBuilder, buildSnapshot } from './offers';
import type { PricingData } from './pricing-data';
import { quote, type QuoteContext, type QuoteQuery } from './quotes';
import { isDegraded } from './routing';

export interface Engine {
  catalog: Catalog;
  network: Network;
  quotes: QuoteContext;
}

let corePromise: Promise<Engine> | null = null;
let canonPromise: Promise<Canon> | null = null;

async function dataset(): Promise<SolTelecomDataset> {
  return (await import('@data/sol-telecom-2380.json')).default as unknown as SolTelecomDataset;
}

async function canonFacts(): Promise<CanonFactsFile> {
  return (await import('@data/canon-facts.json')).default as unknown as CanonFactsFile;
}

/** The catalog, network and quote engine. Built once, on first use. */
export function loadEngine(): Promise<Engine> {
  corePromise ??= (async () => {
    const [data, facts, pricing, elements, phases] = await Promise.all([
      dataset(),
      canonFacts(),
      import('@data/pricing.json').then((m) => m.default as unknown as PricingData),
      import('@data/orbital-elements.csv?raw').then((m) => m.default),
      import('@data/moon-phases.csv?raw').then((m) => m.default),
    ]);
    const catalog = new Catalog(data, facts);
    const network = new Network(data, parseOrbitInputs(elements, phases));
    const snapshot = buildSnapshot(data, pricing);
    const quotes: QuoteContext = {
      snapshot,
      network,
      builder: new OfferBuilder(snapshot, network),
      siteDate: SITE_DATE,
      stardate: SITE_STARDATE,
      year: SITE_YEAR,
      subspaceSince: catalog.subspaceSince(),
    };
    return { catalog, network, quotes };
  })();
  return corePromise;
}

/** The canon facts and the Monte Carlo summary. Loaded only for the Canon page. */
export function loadCanon(): Promise<Canon> {
  canonPromise ??= Promise.all([
    dataset(),
    canonFacts(),
    import('@data/sol-montecarlo-2380.json').then((m) => m.default as unknown as MonteCarloSummary),
  ]).then(([data, facts, summary]) => new Canon(data, facts, summary));
  return canonPromise;
}

export function networkView(engine: Engine): ApiNetwork {
  const { network } = engine;
  const positions = network.nodePositions(SITE_DATE);
  const orbits: Record<string, unknown> = {};
  for (const [world, e] of Object.entries(network.orbits.elements)) {
    orbits[world] = {
      kind: 'heliocentric',
      semiMajorAxisAu: e.a,
      semiMajorAxisRate: e.aRate,
      eccentricity: e.e,
      eccentricityRate: e.eRate,
      longitudeOfPerihelionDeg: e.longPeri,
      longitudeOfPerihelionRate: e.longPeriRate,
      meanLongitudeDeg: e.meanLong,
      meanLongitudeRate: e.meanLongRate,
      b: e.b,
      c: e.c,
      s: e.s,
      f: e.f,
    };
  }
  for (const world of network.moonWorlds()) {
    orbits[world.id] = {
      kind: 'moon',
      parent: world.parent,
      orbitRadiusKm: world.orbitRadiusKm,
      periodDays: world.periodDays,
      phaseDeg: network.orbits.phases[world.id],
      b: null,
      c: null,
      s: null,
      f: null,
    };
  }
  return {
    siteDate: SITE_DATE,
    stardate: SITE_STARDATE,
    nodes: network.nodes.map((n) => ({
      id: n.slug,
      kind: n.kind,
      world: n.world,
      region: n.region,
      fixedPosition: n.fixed ? [...n.fixed] : null,
    })),
    links: network.links.map((l) => ({
      id: l.slug,
      layer: l.layer,
      a: l.a,
      b: l.b,
      operator: l.operator,
      established: l.established,
      processingMs: l.processingMs,
      hardened: l.hardened,
      capacityClass: l.capacityClass,
      degraded: isDegraded(l, positions),
    })),
    orbits,
  } as unknown as ApiNetwork;
}

export async function quoteFor(query: QuoteQuery): Promise<QuoteResponse> {
  const engine = await loadEngine();
  return quote(engine.quotes, query);
}

export { ApiError };

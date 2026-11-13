/** Quote service: route summary, filtering, sorting, badges and offer serialisation. */

import type { Offer as ApiOffer, QuoteResponse } from '../api/types';
import { EngineError } from './errors';
import type { Network } from './network';
import { REGION_CHAIN } from './network';
import {
  OfferBuilder,
  TIER_RANK,
  independentCarriers,
  offerCompanies,
  type Offer,
  type Snapshot,
  type WorldInfo,
} from './offers';
import { compareTuples, pyRoundTo } from './util';

export const SORTS = ['price', 'latency', 'worst-latency', 'tier'] as const;
export type Sort = (typeof SORTS)[number];

const SERVICE_CLASSES = ['shared', 'dedicated', 'synchronized'];
const TIERS = ['standard', 'diverse-path', 'hardened', 'contingency', 'terraforming-zone'];
const ENVIRONMENTS = ['radiation', 'cryogenic', 'solar', 'gas-giant-orbit'];
const SECTORS = ['science', 'commercial', 'industrial'];
const KINDS = ['backbone', 'regional', 'gateway', 'specialist'];
const MAX_LATENCY_MS = 100_000;

export interface Filters {
  serviceClasses: string[];
  sectors: string[];
  tiers: string[];
  kinds: string[];
  companies: string[];
  environments: string[];
  maxLatencyMs: number | null;
  reroute: boolean;
}

/** The query as the client sends it. */
export interface QuoteQuery {
  from: string;
  to: string;
  sort?: string;
  class?: string[];
  sector?: string[];
  tier?: string[];
  kind?: string[];
  company?: string[];
  env?: string[];
  maxLatencyMs?: number;
  reroute?: boolean;
}

export interface QuoteContext {
  snapshot: Snapshot;
  network: Network;
  builder: OfferBuilder;
  siteDate: string;
  stardate: string;
  year: number;
  /** Worlds that have a subspace constellation by the site year, with the year it started. */
  subspaceSince: Map<string, number | null>;
}

/** Checks a query the way the API did, and turns it into filters. Throws a 400 with field messages. */
export function parseQuery(ctx: QuoteContext, query: QuoteQuery): { sort: Sort; filters: Filters } {
  const errors: Record<string, string> = {};
  const choice = (name: string, values: string[] | undefined, allowed: string[]): string[] => {
    const list = (values ?? []).flatMap((v) => v.split(',')).filter(Boolean);
    const unknown = list.find((v) => !allowed.includes(v));
    if (unknown !== undefined) errors[name] = `Unknown value '${unknown}'.`;
    return list;
  };
  const sort = query.sort ?? 'price';
  if (!(SORTS as readonly string[]).includes(sort)) errors.sort = `"${sort}" is not a valid choice.`;
  if (query.maxLatencyMs !== undefined) {
    if (Number.isNaN(query.maxLatencyMs)) errors.maxLatencyMs = 'A valid number is required.';
    else if (query.maxLatencyMs < 0.001) errors.maxLatencyMs = 'Ensure this value is greater than or equal to 0.001.';
    else if (query.maxLatencyMs > MAX_LATENCY_MS)
      errors.maxLatencyMs = `Ensure this value is less than or equal to ${MAX_LATENCY_MS}.`;
  }
  if (!query.from) errors.from = 'This field is required.';
  if (!query.to) errors.to = 'This field is required.';
  const filters: Filters = {
    serviceClasses: choice('class', query.class, SERVICE_CLASSES),
    sectors: choice('sector', query.sector, SECTORS),
    tiers: choice('tier', query.tier, TIERS),
    kinds: choice('kind', query.kind, KINDS),
    companies: choice('company', query.company, [...ctx.snapshot.companies.keys()]),
    environments: choice('env', query.env, ENVIRONMENTS),
    maxLatencyMs: query.maxLatencyMs ?? null,
    reroute: query.reroute ?? false,
  };
  if (Object.keys(errors).length === 0) {
    if (query.from === query.to) {
      errors.to = 'Choose two different worlds.';
    } else {
      for (const [field, slug] of [
        ['from', query.from],
        ['to', query.to],
      ] as const) {
        const world = ctx.snapshot.worlds.get(slug);
        const since = ctx.subspaceSince.get(slug);
        if (!world) errors[field] = `Unknown world '${slug}'.`;
        else if (since === null || since === undefined || since > ctx.year)
          errors[field] = `${world.name} has no subspace constellation yet.`;
      }
    }
  }
  if (Object.keys(errors).length > 0) throw new EngineError('The request failed (400).', 400, errors);
  return { sort: sort as Sort, filters };
}

function routeSummary(ctx: QuoteContext, origin: string, destination: string): QuoteResponse['route'] {
  const { snapshot: snap, network: net, siteDate: day } = ctx;
  const [low, high] = net.directLatencyRange(origin, destination, day);
  const regionO = (snap.worlds.get(origin) as WorldInfo).region;
  const regionD = (snap.worlds.get(destination) as WorldInfo).region;
  const chain = REGION_CHAIN as readonly string[];
  const [i, j] = [chain.indexOf(regionO), chain.indexOf(regionD)].sort((a, b) => a - b);
  let regions = chain.slice(i, j + 1);
  if (chain.indexOf(regionO) > chain.indexOf(regionD)) regions = regions.reverse();
  const window = net.conjunctionWindow(origin, destination, day);
  let conjunction = { activeNow: false, nextStart: null as string | null, nextEnd: null as string | null };
  if (window) {
    const [start, end] = window;
    conjunction = { activeNow: start <= day && day <= end, nextStart: start, nextEnd: end };
  }
  const providers = [...snap.coverage.values()].filter((c) => c.has(origin) && c.has(destination)).length;
  return {
    from: origin,
    to: destination,
    date: day,
    stardate: ctx.stardate,
    distanceKm: net.distanceKm(origin, destination, day),
    latencyMs: {
      direct: pyRoundTo(net.directLatencyMs(origin, destination, day), 2),
      min: pyRoundTo(low, 2),
      max: pyRoundTo(high, 2),
    },
    regions,
    providers,
    independentCarriers: independentCarriers(snap, origin, destination),
    conjunction,
  };
}

function applyFilters(snap: Snapshot, offers: Offer[], f: Filters): Offer[] {
  return offers.filter((o) => {
    if (f.serviceClasses.length && !f.serviceClasses.includes(o.serviceClass)) return false;
    if (f.sectors.length && !f.sectors.some((s) => o.sectors.includes(s))) return false;
    if (f.tiers.length && !f.tiers.includes(o.tier)) return false;
    if (f.kinds.length && !f.kinds.includes((snap.companies.get(o.lead) as { kind: string }).kind)) return false;
    if (f.companies.length) {
      const have = offerCompanies(o);
      if (!f.companies.some((c) => have.has(c))) return false;
    }
    if (f.environments.length && !f.environments.every((e) => o.environments.includes(e))) return false;
    if (f.maxLatencyMs !== null && o.latencyNow > f.maxLatencyMs) return false;
    return !(f.reroute && !o.reroute);
  });
}

const sortKeys: Record<Sort, (o: Offer) => (number | string)[]> = {
  price: (o) => [o.price.monthly, o.id],
  latency: (o) => [o.latencyNow, o.price.monthly, o.id],
  'worst-latency': (o) => [o.latencyMax || o.latencyNow, o.price.monthly, o.id],
  tier: (o) => [-TIER_RANK[o.tier], o.price.monthly, o.id],
};

const sortOffers = (offers: Offer[], sort: Sort): Offer[] =>
  [...offers].sort((a, b) => compareTuples(sortKeys[sort](a), sortKeys[sort](b)));

function minBy(offers: Offer[], key: (o: Offer) => (number | string)[]): Offer {
  return offers.reduce((best, o) => (compareTuples(key(o), key(best)) < 0 ? o : best));
}

function assignBadges(offers: Offer[]): void {
  for (const o of offers) o.badges = [];
  if (offers.length === 0) return;
  minBy(offers, (o) => [o.price.monthly, o.id]).badges.push('lowest-price');
  minBy(offers, (o) => [o.latencyNow, o.price.monthly, o.id]).badges.push('lowest-latency');
  minBy(offers, (o) => [-TIER_RANK[o.tier], o.price.monthly, o.id]).badges.push('most-resilient');
}

function offerToApi(o: Offer): ApiOffer {
  return {
    id: o.id,
    title: o.title,
    kind: o.kind,
    leadCompanyId: o.lead,
    ownerId: o.owner,
    partnerIds: o.partners,
    planIds: o.plans,
    serviceClass: o.serviceClass,
    throughput: o.throughput,
    resilienceTier: o.tier,
    conjunction: o.reroute ? 'rerouted' : 'degraded',
    environments: o.environments,
    sectors: o.sectors,
    hops: o.route.edges.length,
    handoffs: o.route.handoffs,
    onNetworkShare: o.onNetworkShare,
    latencyMs: {
      now: pyRoundTo(o.latencyNow, 2),
      min: pyRoundTo(o.latencyMin as number, 2),
      max: pyRoundTo(o.latencyMax as number, 2),
    },
    price: {
      monthly: o.price.monthly,
      setup: o.price.setup,
      currency: o.price.currency,
      breakdown: o.price.breakdown.map((l) => ({ label: l.label, credits: l.credits })),
      terms: o.price.terms,
    },
    segments: o.segments.map((s) => ({
      companyId: s.company,
      layer: s.layer,
      nodeIds: s.nodeIds,
      linkIds: s.linkIds,
      lengthKm: s.lengthKm,
      latencyMs: s.latencyMs,
    })),
    addons: o.addons.map((a) => ({ id: a.id, label: a.label, companyId: a.company, monthly: a.monthly })),
    badges: o.badges,
  } as unknown as ApiOffer;
}

/** Every priced plan between two worlds, filtered and sorted, with the route summary. */
export function quote(ctx: QuoteContext, query: QuoteQuery): QuoteResponse {
  const { sort, filters } = parseQuery(ctx, query);
  const all = ctx.builder.buildOffers(query.from, query.to, ctx.siteDate);
  const offers = sortOffers(applyFilters(ctx.snapshot, all, filters), sort);
  assignBadges(offers);
  return {
    route: routeSummary(ctx, query.from, query.to),
    offers: offers.map(offerToApi),
  };
}

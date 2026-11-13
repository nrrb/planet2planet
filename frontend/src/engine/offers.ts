/**
 * Assemble priced offers for a pair of worlds.
 *
 * Three kinds: end-to-end plans from companies covering both ends, packages (access plan +
 * backbone transit plan + access plan, each carrier on its own leg), and add-ons shown on an
 * offer. Offers are computed per request and memoised by the network underneath. Every plan,
 * price and carrier relationship here is invented.
 */

import type { SolTelecomDataset } from '@data/sol-telecom-2380';
import { priceOffer, segmentCost, type Params, type Price, type Segment } from './formula';
import type { Network } from './network';
import type { PricingData } from './pricing-data';
import { AU_KM, propagationMs } from './ephemeris';
import { dist, type Positions, type Route } from './routing';
import { byString, compareTuples, pyRound, pyRoundTo, sha1Hex } from './util';

const LONG_HAUL = new Set(['backbone', 'cross', 'conjunction']);
const ACCESS_CLASS: Record<string, string> = { shared: 'shared', dedicated: 'dedicated', synchronized: 'dedicated' };

const RADIATION_WORLDS = new Set(['io', 'europa', 'ganymede', 'callisto']);
const GAS_GIANT_WORLDS = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
const COLD_REGIONS = new Set(['uranian', 'neptunian', 'plutonian', 'far-kuiper']);
const SOLAR_REGIONS = new Set(['inner']);

/** Hardening a world needs, by world and region (invented). */
export function requiredEnvironments(world: string, region: string): Set<string> {
  const needed = new Set<string>();
  if (RADIATION_WORLDS.has(world)) needed.add('radiation');
  if (GAS_GIANT_WORLDS.has(world)) needed.add('gas-giant-orbit');
  if (COLD_REGIONS.has(region)) needed.add('cryogenic');
  if (SOLAR_REGIONS.has(region)) needed.add('solar');
  return needed;
}

export const TIER_RANK: Record<string, number> = {
  standard: 0,
  hardened: 1,
  'diverse-path': 2,
  'terraforming-zone': 3,
  contingency: 4,
};

export interface CompanyInfo {
  slug: string;
  name: string;
  kind: string;
  status: string;
  owner: string | null;
  positioning: number;
  founded: number;
}

export interface WorldInfo {
  slug: string;
  name: string;
  region: string;
  population: number | null;
}

export interface Plan {
  slug: string;
  companyId: string;
  name: string;
  serviceClass: string;
  throughput: number;
  monthlyBase: number;
  setupFee: number;
  role: string;
  resilienceTier: string;
  conjunctionReroute: boolean;
  environments: string[];
  sectors: string[];
  standalone: boolean;
  terms: Record<string, number>;
}

export interface Snapshot {
  params: Params;
  companies: Map<string, CompanyInfo>;
  plans: Map<string, Plan[]>;
  coverage: Map<string, Set<string>>;
  worlds: Map<string, WorldInfo>;
  family: Map<string, number>;
  divisions: Map<string, string[]>;
}

/** Corporate families: companies linked by spin-off (parent), ownership or acquisition. */
function families(companies: SolTelecomDataset['companies']): Map<string, number> {
  const root = new Map(companies.map((c) => [c.id, c.id]));
  const find = (x: string): string => {
    let node = x;
    while (root.get(node) !== node) {
      root.set(node, root.get(root.get(node) as string) as string);
      node = root.get(node) as string;
    }
    return node;
  };
  for (const c of companies) {
    for (const other of [c.parentId, c.ownerId, c.acquiredById]) {
      if (other) root.set(find(c.id), find(other));
    }
  }
  const ids = new Map<string, number>();
  const out = new Map<string, number>();
  for (const c of companies) {
    const r = find(c.id);
    if (!ids.has(r)) ids.set(r, ids.size);
    out.set(c.id, ids.get(r) as number);
  }
  return out;
}

export function buildSnapshot(dataset: SolTelecomDataset, pricing: PricingData): Snapshot {
  const sorted = [...dataset.companies].sort((a, b) => byString(a.id, b.id));
  const active = sorted.filter((c) => c.status !== 'merged');
  const companies = new Map<string, CompanyInfo>();
  const coverage = new Map<string, Set<string>>();
  const plans = new Map<string, Plan[]>();

  for (const c of active) {
    companies.set(c.id, {
      slug: c.id,
      name: c.name,
      kind: c.kind,
      status: c.status,
      owner: c.ownerId,
      positioning: pricing.positioning[c.id] || 1.0,
      founded: c.founded,
    });
    coverage.set(c.id, new Set(c.servesWorldIds));

    const templates =
      c.kind === 'specialist'
        ? (pricing.specialistPlans[c.id] ?? []).map((t) => ({
            ...t,
            conjunctionReroute: false,
            standalone: t.role !== 'addon',
          }))
        : (pricing.templates[c.kind] ?? []);
    const list: Plan[] = templates.map((t) => {
      const hardened = t.resilienceTier === 'hardened' || Boolean(c.environment);
      return {
        slug: `${c.id}--${t.code}`,
        companyId: c.id,
        name: t.name,
        serviceClass: t.serviceClass,
        throughput: t.throughput,
        monthlyBase: t.monthlyBase,
        setupFee: t.setupFee,
        role: t.role,
        resilienceTier: t.resilienceTier,
        conjunctionReroute: t.conjunctionReroute,
        environments: hardened && c.environment ? [c.environment.replaceAll(' ', '-')] : [],
        sectors: [...c.sectors],
        standalone: t.standalone,
        terms: { ...pricing.termDiscounts },
      };
    });
    list.sort((a, b) => byString(a.slug, b.slug));
    if (list.length > 0) plans.set(c.id, list);
  }

  const divisions = new Map<string, string[]>();
  for (const c of companies.values()) {
    if (c.owner) {
      const list = divisions.get(c.owner);
      if (list) list.push(c.slug);
      else divisions.set(c.owner, [c.slug]);
    }
  }
  return {
    params: pricing.parameters,
    companies,
    plans,
    coverage,
    worlds: new Map(
      dataset.worlds.map((w) => [w.id, { slug: w.id, name: w.name, region: w.regionId, population: w.population }]),
    ),
    family: families(sorted),
    divisions,
  };
}

export interface OfferSegment {
  company: string;
  layer: string;
  nodeIds: string[];
  linkIds: string[];
  lengthKm: number;
  latencyMs: number;
}

export interface Addon {
  id: string;
  label: string;
  company: string | null;
  monthly: number;
}

export interface Offer {
  id: string;
  title: string;
  lead: string;
  owner: string | null;
  partners: string[];
  plans: string[];
  serviceClass: string;
  throughput: number;
  tier: string;
  reroute: boolean;
  environments: string[];
  sectors: string[];
  route: Route;
  price: Price;
  latencyNow: number;
  latencyMin: number | null;
  latencyMax: number | null;
  onNetworkShare: number;
  segments: OfferSegment[];
  addons: Addon[];
  badges: string[];
  kind: 'end-to-end' | 'package';
}

export const offerCompanies = (o: Offer): Set<string> => new Set([o.lead, ...o.partners]);

export function offerId(origin: string, destination: string, plans: string[], partners: string[]): string {
  const raw = [origin, destination, [...plans].sort(byString).join(','), [...partners].sort(byString).join(',')].join(
    '|',
  );
  return `of_${sha1Hex(raw).slice(0, 12)}`;
}

/** Distinct owners among companies that can carry the pair end to end. */
export function independentCarriers(snap: Snapshot, origin: string, destination: string): number {
  const owners = new Set<string>();
  for (const c of snap.companies.values()) {
    const covered = snap.coverage.get(c.slug) as Set<string>;
    if (
      c.kind !== 'gateway' &&
      covered.has(origin) &&
      covered.has(destination) &&
      (snap.plans.get(c.slug) ?? []).some((p) => p.standalone)
    ) {
      owners.add(c.owner || c.slug);
    }
  }
  return owners.size;
}

const lengthAu = (route: Route, positions: Positions): number[] =>
  route.edges.filter((e) => LONG_HAUL.has(e.layer)).map((e) => dist(positions[e.a], positions[e.b]));

function segmentsOf(route: Route, positions: Positions): OfferSegment[] {
  const groups: OfferSegment[] = [];
  const lengthKm = new Map<OfferSegment, number>();
  const latency = new Map<OfferSegment, number>();
  for (const edge of route.edges) {
    const length = dist(positions[edge.a], positions[edge.b]);
    const ms = propagationMs(length) + edge.processingMs;
    let group = groups[groups.length - 1];
    if (!(group && group.company === edge.operator && group.layer === edge.layer)) {
      const start = group ? group.nodeIds[group.nodeIds.length - 1] : route.nodes[0];
      group = { company: edge.operator, layer: edge.layer, nodeIds: [start], linkIds: [], lengthKm: 0, latencyMs: 0 };
      groups.push(group);
      lengthKm.set(group, 0);
      latency.set(group, 0);
    }
    group.nodeIds.push(edge.b === group.nodeIds[group.nodeIds.length - 1] ? edge.a : edge.b);
    group.linkIds.push(edge.slug);
    lengthKm.set(group, (lengthKm.get(group) as number) + length * AU_KM);
    latency.set(group, (latency.get(group) as number) + ms);
  }
  for (const group of groups) {
    group.lengthKm = pyRound(lengthKm.get(group) as number);
    group.latencyMs = pyRoundTo(latency.get(group) as number, 2);
  }
  return groups;
}

function onNetworkShare(route: Route, lead: string, positions: Positions): number {
  const lengths = route.edges.map((e) => [e.operator, dist(positions[e.a], positions[e.b])] as const);
  const total = lengths.reduce((sum, [, l]) => sum + l, 0);
  if (total === 0) return lengths.filter(([op]) => op === lead).length / Math.max(lengths.length, 1);
  return pyRoundTo(lengths.filter(([op]) => op === lead).reduce((sum, [, l]) => sum + l, 0) / total, 3);
}

function sameFamily(snap: Snapshot, carriers: Set<string>): boolean {
  return carriers.size > 1 && new Set([...carriers].map((c) => snap.family.get(c))).size === 1;
}

interface BuildArgs {
  title: string;
  lead: string;
  partners: string[];
  plans: Plan[];
  route: Route;
  reroute: boolean;
  leadPlan: Plan;
  range: () => [number, number];
  carriersForFamily: Set<string>;
  kind: 'end-to-end' | 'package';
}

const toSegment = (p: Plan, snap: Snapshot, label: string): Segment => ({
  label,
  monthlyBase: p.monthlyBase,
  throughput: p.throughput,
  serviceClass: p.serviceClass,
  positioning: (snap.companies.get(p.companyId) as CompanyInfo).positioning,
  setupFee: p.setupFee,
});

export class OfferBuilder {
  constructor(
    readonly snap: Snapshot,
    readonly net: Network,
  ) {}

  private build(origin: string, destination: string, day: string, withRange: boolean, a: BuildArgs): Offer {
    const { snap, net } = this;
    const positions = net.nodePositions(day);
    const operators = new Set(a.route.edges.map((e) => e.operator));
    const family = sameFamily(snap, new Set([...a.carriersForFamily, ...operators]));
    const o = snap.worlds.get(origin) as WorldInfo;
    const d = snap.worlds.get(destination) as WorldInfo;
    const needed = new Set([...requiredEnvironments(origin, o.region), ...requiredEnvironments(destination, d.region)]);
    const price = priceOffer(snap.params, {
      segments: a.plans.map((p) =>
        toSegment(p, snap, `${p.name} (${(snap.companies.get(p.companyId) as CompanyInfo).name})`),
      ),
      hopLengthsAu: lengthAu(a.route, positions),
      handoffs: a.route.handoffs,
      family,
      leadPositioning: (snap.companies.get(a.lead) as CompanyInfo).positioning,
      independentCarriers: independentCarriers(snap, origin, destination),
      populations: [o.population, d.population],
      requiredEnvironments: needed,
      tier: a.leadPlan.resilienceTier,
      reroute: a.reroute,
      contractTerms: a.leadPlan.terms,
    });
    let low: number | null = null;
    let high: number | null = null;
    if (withRange) [low, high] = a.range();
    const envHave = new Set(a.leadPlan.environments);
    const sectorSets = a.plans.map((p) => new Set(p.sectors));
    const common = [...sectorSets[0]].filter((s) => sectorSets.every((set) => set.has(s)));
    return {
      id: offerId(
        origin,
        destination,
        a.plans.map((p) => p.slug),
        a.partners,
      ),
      title: a.title,
      lead: a.lead,
      owner: (snap.companies.get(a.lead) as CompanyInfo).owner,
      partners: a.partners,
      plans: a.plans.map((p) => p.slug),
      serviceClass: a.leadPlan.serviceClass,
      throughput: Math.min(...a.plans.map((p) => p.throughput)),
      tier: a.leadPlan.resilienceTier,
      reroute: a.reroute,
      environments: [...envHave].sort(byString),
      sectors: [...(common.length > 0 ? common : a.leadPlan.sectors)].sort(byString),
      route: a.route,
      price,
      latencyNow: a.route.latencyMs,
      latencyMin: low,
      latencyMax: high,
      onNetworkShare: onNetworkShare(a.route, a.lead, positions),
      segments: segmentsOf(a.route, positions),
      addons: this.addons(origin, destination, a.leadPlan, price, needed, envHave),
      badges: [],
      kind: a.kind,
    };
  }

  private addons(
    origin: string,
    destination: string,
    leadPlan: Plan,
    price: Price,
    needed: Set<string>,
    envHave: Set<string>,
  ): Addon[] {
    const { snap } = this;
    const addons: Addon[] = [];
    for (const [companySlug, plans] of snap.plans) {
      for (const plan of plans) {
        if (plan.role !== 'addon') continue;
        const covered = snap.coverage.get(companySlug) ?? new Set<string>();
        if (covered.has(origin) && covered.has(destination) && leadPlan.resilienceTier !== 'contingency') {
          const company = snap.companies.get(companySlug) as CompanyInfo;
          const cost = segmentCost(snap.params, {
            label: plan.name,
            monthlyBase: plan.monthlyBase,
            throughput: plan.throughput,
            serviceClass: plan.serviceClass,
            positioning: company.positioning,
          });
          addons.push({
            id: 'emergency-priority',
            label: 'Priority lane on the system-wide emergency network',
            company: companySlug,
            monthly: pyRound(cost),
          });
        }
      }
    }
    const missing = [...needed].filter((e) => !envHave.has(e)).sort(byString);
    if (missing.length > 0) {
      addons.push({
        id: 'hardening',
        label: `Hardening for ${missing.join(', ')}`,
        company: null,
        monthly: pyRound(price.monthly * snap.params['addon.hardening_pct']),
      });
    }
    return addons;
  }

  buildOffers(origin: string, destination: string, day: string, withRange = true): Offer[] {
    const { snap, net } = this;
    const both = [...snap.coverage.entries()]
      .filter(([, covered]) => covered.has(origin) && covered.has(destination))
      .map(([slug]) => slug);
    const offers = new Map<string, Offer>();
    const add = (offer: Offer) => {
      if (!offers.has(offer.id)) offers.set(offer.id, offer);
    };
    const company = (slug: string) => snap.companies.get(slug) as CompanyInfo;

    const backbones = both.filter((s) => company(s).kind === 'backbone');
    const sameRegion =
      (snap.worlds.get(origin) as WorldInfo).region === (snap.worlds.get(destination) as WorldInfo).region;

    // 1. End-to-end offers.
    for (const slug of both) {
      if (company(slug).kind === 'gateway') continue;
      for (const plan of snap.plans.get(slug) ?? []) {
        if (!plan.standalone || plan.role === 'addon') continue;
        let partners: string[] = [];
        if (plan.resilienceTier === 'diverse-path' || plan.resilienceTier === 'contingency') {
          if (sameRegion) continue;
          const family = snap.family.get(slug);
          const others = backbones.filter((b) => snap.family.get(b) !== family);
          if (others.length === 0) continue;
          partners = [
            others.reduce((best, b) =>
              compareTuples([company(b).positioning, b], [company(best).positioning, best]) < 0 ? b : best,
            ),
          ];
        }
        const carriers = new Set([slug, ...(snap.divisions.get(slug) ?? []), ...partners]);
        const route = net.routeFor(origin, destination, carriers, day, plan.conjunctionReroute);
        if (route === null) continue;
        if (partners.length > 0) {
          const [, second] = net.diverseRoutes(origin, destination, carriers, day, plan.conjunctionReroute);
          if (second === null) continue;
        }
        add(
          this.build(origin, destination, day, withRange, {
            title: plan.name,
            lead: slug,
            partners,
            plans: [plan],
            leadPlan: plan,
            route,
            reroute: plan.conjunctionReroute,
            range: () => net.latencyRange(origin, destination, carriers, day, plan.conjunctionReroute),
            carriersForFamily: new Set([slug]),
            kind: 'end-to-end',
          }),
        );
      }
    }

    // 2. Packages: access + backbone transit + access, in different regions only. An end with
    // no access partner is served by the transit carrier's own mesh.
    if (!sameRegion) {
      for (const transitSlug of backbones) {
        const candidates = this.packageCandidates(origin, destination, day, transitSlug);
        candidates.sort(
          (x, y) => Number(!x.family) - Number(!y.family) || x.price - y.price || compareTuples(x.key, y.key),
        );
        for (const candidate of candidates.slice(0, Math.trunc(snap.params['packages.per_transit']))) {
          const { accessO: oa, transit: ta, accessD: da } = candidate;
          const accessO = oa ? oa.companyId : transitSlug;
          const accessD = da ? da.companyId : transitSlug;
          const legs = [oa, ta, da].filter((p): p is Plan => p !== null);
          add(
            this.build(origin, destination, day, withRange, {
              title: `${ta.name} package`,
              lead: transitSlug,
              partners: [...new Set([accessO, accessD])].filter((s) => s !== transitSlug).sort(byString),
              plans: legs,
              leadPlan: ta,
              route: candidate.route,
              reroute: ta.conjunctionReroute,
              range: () =>
                net.packageLatencyRange(origin, destination, accessO, transitSlug, accessD, day, ta.conjunctionReroute),
              carriersForFamily: new Set([accessO, transitSlug, accessD]),
              kind: 'package',
            }),
          );
        }
      }
    }
    return [...offers.values()];
  }

  private packageCandidates(origin: string, destination: string, day: string, transitSlug: string) {
    const { snap, net } = this;
    const accessPlans = (world: string, wanted: string): (Plan | null)[] => {
      const found: (Plan | null)[] = [null]; // null: the transit carrier's own mesh
      for (const [slug, covered] of snap.coverage) {
        const kind = (snap.companies.get(slug) as CompanyInfo).kind;
        if (covered.has(world) && (kind === 'gateway' || kind === 'regional')) {
          found.push(
            ...(snap.plans.get(slug) ?? []).filter(
              (p) => (p.role === 'access' || p.role === 'regional') && p.serviceClass === wanted,
            ),
          );
        }
      }
      return found;
    };

    const positions = net.nodePositions(day);
    const out: {
      accessO: Plan | null;
      transit: Plan;
      accessD: Plan | null;
      route: Route;
      family: boolean;
      price: number;
      key: [string, string, string];
    }[] = [];
    for (const transit of snap.plans.get(transitSlug) ?? []) {
      if (transit.role !== 'transit' || transit.resilienceTier !== 'standard') continue;
      const wanted = ACCESS_CLASS[transit.serviceClass];
      for (const oa of accessPlans(origin, wanted)) {
        for (const da of accessPlans(destination, wanted)) {
          if (oa === null && da === null) continue; // identical to the end-to-end offer
          const accessO = oa ? oa.companyId : transitSlug;
          const accessD = da ? da.companyId : transitSlug;
          const route = net.packageRoute(
            origin,
            destination,
            accessO,
            transitSlug,
            accessD,
            day,
            transit.conjunctionReroute,
          );
          if (route === null) continue;
          const family = sameFamily(snap, new Set([accessO, transitSlug, accessD]));
          const legs = [oa, transit, da].filter((p): p is Plan => p !== null);
          const quick = priceOffer(snap.params, {
            segments: legs.map((p) => toSegment(p, snap, p.name)),
            hopLengthsAu: lengthAu(route, positions),
            handoffs: route.handoffs,
            family,
            leadPositioning: (snap.companies.get(transitSlug) as CompanyInfo).positioning,
            independentCarriers: 3,
            populations: [null],
            requiredEnvironments: [],
            tier: 'standard',
            reroute: false,
            contractTerms: {},
          });
          out.push({
            accessO: oa,
            transit,
            accessD: da,
            route,
            family,
            price: quick.monthly,
            key: [oa ? oa.slug : '', transit.slug, da ? da.slug : ''],
          });
        }
      }
    }
    return out;
  }
}

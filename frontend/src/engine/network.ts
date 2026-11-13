/**
 * The carrier network: nodes and links generated from the catalog, with positions and routes
 * derived from a date. Deterministic. Mirrors the build the Django backend did at seed time.
 */

import type { SolTelecomDataset, Company as DataCompany, World as DataWorld } from '@data/sol-telecom-2380';
import { AU_KM, heliocentricPosition, moonOffsetAu, propagationMs, type Elements } from './ephemeris';
import {
  diversePath,
  dist,
  isDegraded,
  shortestPath,
  type Edge,
  type Point,
  type Positions,
  type Route,
} from './routing';
import { addDays, byString, daysSinceJ2000, pyRound } from './util';

/** Heliocentric chain of regions, innermost first. */
export const REGION_CHAIN = [
  'inner',
  'earth-luna',
  'mars',
  'belt',
  'jovian',
  'saturnian',
  'uranian',
  'neptunian',
  'plutonian',
  'far-kuiper',
] as const;
const REGION_ANCHOR: Record<string, string> = {
  inner: 'venus',
  'earth-luna': 'earth',
  mars: 'mars',
  belt: 'ceres',
  jovian: 'jupiter',
  saturnian: 'saturn',
  uranian: 'uranus',
  neptunian: 'neptune',
  plutonian: 'pluto',
  'far-kuiper': 'eris',
};
const CROSS_LINKS: [string, string][] = [
  ['earth-luna', 'jovian'],
  ['mars', 'saturnian'],
  ['jovian', 'neptunian'],
];
/** Fixed conjunction relays, AU. Far enough off the ecliptic to clear the Sun by well over 0.1 AU. */
const RELAYS: Record<string, Point> = {
  'r-1': [0.5, 0.0, 0.5],
  'r-2': [-0.5, 0.0, 0.5],
  'r-3': [0.0, 0.5, -0.5],
  'r-4': [0.0, -0.5, -0.5],
};
const MESH_MS = 0.5;
const BACKBONE_MS = 1.5;
const SAMPLES_PER_YEAR = 52;
const CONJUNCTION_HORIZON_DAYS = 4 * 366;

export type NodeKind = 'constellation' | 'hub' | 'relay';
export type LinkLayer = 'access' | 'mesh' | 'backbone' | 'cross' | 'conjunction';

export interface NetNode {
  slug: string;
  kind: NodeKind;
  world: string | null;
  region: string | null;
  fixed: Point | null;
}

export interface NetLink extends Edge {
  established: number;
  hardened: boolean;
  capacityClass: string;
}

/** Orbital inputs: Keplerian elements for bodies around the Sun, a phase for each moon. */
export interface OrbitInputs {
  elements: Record<string, Elements>;
  phases: Record<string, number>;
}

export function parseOrbitInputs(elementsCsv: string, phasesCsv: string): OrbitInputs {
  const rows = (text: string) => {
    const [header, ...lines] = text.trim().split(/\r?\n/);
    const keys = header.split(',');
    return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [keys[i], v])));
  };
  const optional = (v: string) => (v === '' ? null : Number(v));
  const elements: Record<string, Elements> = {};
  for (const r of rows(elementsCsv)) {
    elements[r.slug] = {
      a: Number(r.a_au),
      aRate: Number(r.a_rate),
      e: Number(r.e),
      eRate: Number(r.e_rate),
      longPeri: Number(r.long_peri_deg),
      longPeriRate: Number(r.long_peri_rate),
      meanLong: Number(r.mean_long_deg),
      meanLongRate: Number(r.mean_long_rate),
      b: optional(r.b),
      c: optional(r.c),
      s: optional(r.s),
      f: optional(r.f),
    };
  }
  const phases: Record<string, number> = {};
  for (const r of rows(phasesCsv)) phases[r.slug] = Number(r.phase_deg);
  return { elements, phases };
}

export class Network {
  readonly nodes: NetNode[];
  readonly links: NetLink[];
  readonly edges: Edge[];
  readonly hubs: ReadonlySet<string>;
  private readonly nodeRegion = new Map<string, string | null>();
  private readonly edgesByOperator = new Map<string, Edge[]>();
  private readonly worlds: Map<string, DataWorld>;
  private readonly positionCache = new Map<string, Positions>();
  private readonly routeCache = new Map<string, Route | null>();
  private readonly diverseCache = new Map<string, [Route | null, Route | null]>();
  private readonly rangeCache = new Map<string, [number, number]>();
  private readonly windowCache = new Map<string, [string, string] | null>();

  constructor(
    dataset: SolTelecomDataset,
    readonly orbits: OrbitInputs,
  ) {
    this.worlds = new Map(dataset.worlds.map((w) => [w.id, w]));
    const worldList = [...dataset.worlds].sort((a, b) => byString(a.id, b.id));

    const nodes: NetNode[] = worldList.map((w) => ({
      slug: `c-${w.id}`,
      kind: 'constellation',
      world: w.id,
      region: w.regionId,
      fixed: null,
    }));
    for (const region of REGION_CHAIN) {
      nodes.push({ slug: `h-${region}`, kind: 'hub', world: REGION_ANCHOR[region], region, fixed: null });
    }
    for (const [slug, fixed] of Object.entries(RELAYS)) {
      nodes.push({ slug, kind: 'relay', world: null, region: null, fixed });
    }
    nodes.sort((a, b) => byString(a.slug, b.slug));
    this.nodes = nodes;
    for (const n of nodes) this.nodeRegion.set(n.slug, n.region);
    this.hubs = new Set(nodes.filter((n) => n.kind === 'hub').map((n) => n.slug));

    this.links = this.buildLinks(dataset, worldList);
    this.edges = this.links;
    for (const edge of this.edges) {
      const list = this.edgesByOperator.get(edge.operator);
      if (list) list.push(edge);
      else this.edgesByOperator.set(edge.operator, [edge]);
    }
  }

  private buildLinks(dataset: SolTelecomDataset, worldList: DataWorld[]): NetLink[] {
    const worlds = this.worlds;
    const moonsByParent = new Map<string, DataWorld[]>();
    for (const w of worldList) {
      if (w.parentId) {
        const list = moonsByParent.get(w.parentId);
        if (list) list.push(w);
        else moonsByParent.set(w.parentId, [w]);
      }
    }
    for (const moons of moonsByParent.values()) {
      moons.sort((a, b) => (a.physical.orbitRadiusKm ?? 0) - (b.physical.orbitRadiusKm ?? 0));
    }

    const links: NetLink[] = [];
    const add = (
      layer: LinkLayer,
      a: string,
      b: string,
      company: DataCompany,
      since: number,
      ms: number,
      capacity: string,
    ) => {
      links.push({
        slug: `${layer}-${company.id}-${a}-${b}`,
        layer,
        a,
        b,
        operator: company.id,
        established: Math.max(company.founded, since),
        processingMs: ms,
        hardened: Boolean(company.environment),
        capacityClass: capacity,
      });
    };
    const hubSince = (region: string) => worlds.get(REGION_ANCHOR[region])?.history.subspaceSince ?? 0;

    const companies = dataset.companies.filter((c) => c.status !== 'merged');
    for (const company of companies) {
      const served = new Set(company.servesWorldIds);
      if (served.size === 0) continue;
      const isGateway = company.kind === 'gateway';

      for (const slug of [...served].sort(byString)) {
        const w = worlds.get(slug) as DataWorld;
        add(
          isGateway ? 'access' : 'mesh',
          `c-${slug}`,
          `h-${w.regionId}`,
          company,
          w.history.subspaceSince ?? 0,
          MESH_MS,
          isGateway ? 'access' : 'regional',
        );
      }
      for (const moons of moonsByParent.values()) {
        for (let i = 0; i + 1 < moons.length; i += 1) {
          const near = moons[i];
          const far = moons[i + 1];
          if (served.has(near.id) && served.has(far.id)) {
            add(
              'mesh',
              `c-${near.id}`,
              `c-${far.id}`,
              company,
              Math.max(near.history.subspaceSince ?? 0, far.history.subspaceSince ?? 0),
              MESH_MS,
              'regional',
            );
          }
        }
      }
      if (isGateway) continue;

      const covered = REGION_CHAIN.filter((r) => [...served].some((s) => worlds.get(s)?.regionId === r));
      for (let i = 0; i + 1 < covered.length; i += 1) {
        const [r1, r2] = [covered[i], covered[i + 1]];
        add('backbone', `h-${r1}`, `h-${r2}`, company, Math.max(hubSince(r1), hubSince(r2)), BACKBONE_MS, 'trunk');
      }
      if (company.kind !== 'backbone') continue;
      for (const [r1, r2] of CROSS_LINKS) {
        if (covered.includes(r1 as never) && covered.includes(r2 as never)) {
          add('cross', `h-${r1}`, `h-${r2}`, company, Math.max(hubSince(r1), hubSince(r2)), BACKBONE_MS, 'trunk');
        }
      }
      for (const region of covered) {
        for (const relay of Object.keys(RELAYS)) {
          add('conjunction', `h-${region}`, relay, company, hubSince(region), BACKBONE_MS, 'trunk');
        }
      }
    }
    return links.sort((a, b) => byString(a.slug, b.slug));
  }

  /** Moons with their circular-orbit inputs, for the maps. */
  moonWorlds(): { id: string; parent: string; orbitRadiusKm: number; periodDays: number }[] {
    return [...this.worlds.values()]
      .filter((w) => w.parentId)
      .map((w) => ({
        id: w.id,
        parent: w.parentId as string,
        orbitRadiusKm: w.physical.orbitRadiusKm as number,
        periodDays: w.physical.orbitalPeriodDays,
      }));
  }

  // --- Positions ---

  worldPosition(world: string, day: string): Point {
    const days = daysSinceJ2000(day);
    const w = this.worlds.get(world) as DataWorld;
    if (w.parentId) {
      const [px, py] = heliocentricPosition(this.orbits.elements[w.parentId], days);
      const [dx, dy] = moonOffsetAu(
        w.physical.orbitRadiusKm as number,
        w.physical.orbitalPeriodDays,
        this.orbits.phases[world],
        days,
      );
      return [px + dx, py + dy, 0];
    }
    const [x, y] = heliocentricPosition(this.orbits.elements[world], days);
    return [x, y, 0];
  }

  nodePositions(day: string): Positions {
    const cached = this.positionCache.get(day);
    if (cached) return cached;
    const positions: Record<string, Point> = {};
    const byWorld = new Map<string, Point>();
    for (const node of this.nodes) {
      if (node.fixed) {
        positions[node.slug] = node.fixed;
        continue;
      }
      const world = node.world as string;
      let p = byWorld.get(world);
      if (!p) {
        p = this.worldPosition(world, day);
        byWorld.set(world, p);
      }
      positions[node.slug] = p;
    }
    this.positionCache.set(day, positions);
    return positions;
  }

  directLatencyMs(origin: string, destination: string, day: string): number {
    const p = this.nodePositions(day);
    return propagationMs(dist(p[`c-${origin}`], p[`c-${destination}`]));
  }

  // --- Routes ---

  private edgesFor(carriers: ReadonlySet<string>): Edge[] {
    // Slug order, so the search sees the same edges in the same order on every run.
    const out: Edge[] = [];
    for (const carrier of carriers) out.push(...(this.edgesByOperator.get(carrier) ?? []));
    return out.sort((a, b) => byString(a.slug, b.slug));
  }

  routeFor(
    origin: string,
    destination: string,
    carriers: ReadonlySet<string>,
    day: string,
    reroute: boolean,
  ): Route | null {
    const key = `${origin}|${destination}|${[...carriers].sort(byString).join(',')}|${day}|${reroute}`;
    if (this.routeCache.has(key)) return this.routeCache.get(key) ?? null;
    const route = shortestPath(
      this.edgesFor(carriers),
      this.nodePositions(day),
      `c-${origin}`,
      `c-${destination}`,
      carriers,
      { reroute },
    );
    this.routeCache.set(key, route);
    return route;
  }

  diverseRoutes(
    origin: string,
    destination: string,
    carriers: ReadonlySet<string>,
    day: string,
    reroute: boolean,
  ): [Route | null, Route | null] {
    const key = `${origin}|${destination}|${[...carriers].sort(byString).join(',')}|${day}|${reroute}`;
    const cached = this.diverseCache.get(key);
    if (cached) return cached;
    const shared = new Set([`h-${this.nodeRegion.get(`c-${origin}`)}`, `h-${this.nodeRegion.get(`c-${destination}`)}`]);
    const result = diversePath(
      this.edgesFor(carriers),
      this.nodePositions(day),
      `c-${origin}`,
      `c-${destination}`,
      carriers,
      this.hubs,
      shared,
      reroute,
    );
    this.diverseCache.set(key, result);
    return result;
  }

  /** Best and worst latency over 52 dates across the year starting at `day`. */
  latencyRange(
    origin: string,
    destination: string,
    carriers: ReadonlySet<string>,
    day: string,
    reroute: boolean,
  ): [number, number] {
    const key = `${origin}|${destination}|${[...carriers].sort(byString).join(',')}|${day}|${reroute}`;
    const cached = this.rangeCache.get(key);
    if (cached) return cached;
    const values: number[] = [];
    for (let i = 0; i < SAMPLES_PER_YEAR; i += 1) {
      const sample = addDays(day, pyRound((i * 365) / SAMPLES_PER_YEAR));
      const route = this.routeFor(origin, destination, carriers, sample, reroute);
      if (route) values.push(route.latencyMs);
    }
    const result: [number, number] = [Math.min(...values), Math.max(...values)];
    this.rangeCache.set(key, result);
    return result;
  }

  /** Whether the straight subspace line between two worlds passes within 0.1 AU of the Sun. */
  pairDegraded(origin: string, destination: string, day: string): boolean {
    const edge: Edge = {
      slug: 'pair',
      layer: 'pair',
      a: `c-${origin}`,
      b: `c-${destination}`,
      operator: '-',
      processingMs: 0,
    };
    return isDegraded(edge, this.nodePositions(day));
  }

  private sameSystem(origin: string, destination: string): boolean {
    const parent = (id: string) => this.worlds.get(id)?.parentId ?? id;
    return parent(origin) === parent(destination);
  }

  /** The conjunction window that is active on `day` or the next one, by daily steps. */
  conjunctionWindow(origin: string, destination: string, day: string): [string, string] | null {
    const key = `${origin}|${destination}|${day}`;
    if (this.windowCache.has(key)) return this.windowCache.get(key) ?? null;
    const result = this.findWindow(origin, destination, day);
    this.windowCache.set(key, result);
    return result;
  }

  private findWindow(origin: string, destination: string, day: string): [string, string] | null {
    if (this.sameSystem(origin, destination)) return null;
    let start: string | null = null;
    for (let offset = 0; offset < CONJUNCTION_HORIZON_DAYS; offset += 1) {
      const current = addDays(day, offset);
      if (this.pairDegraded(origin, destination, current)) {
        start = current;
        break;
      }
    }
    if (start === null) return null;
    if (start === day) {
      while (this.pairDegraded(origin, destination, addDays(start, -1))) start = addDays(start, -1);
    }
    let end = start;
    while (this.pairDegraded(origin, destination, addDays(end, 1))) end = addDays(end, 1);
    return [start, end];
  }

  // --- Package routes: each carrier confined to its own leg ---

  private packageEdges(
    origin: string,
    destination: string,
    accessOrigin: string,
    transit: string,
    accessDest: string,
  ): Edge[] {
    const start = `c-${origin}`;
    const end = `c-${destination}`;
    const longHaul = new Set(['backbone', 'cross', 'conjunction']);
    const local = new Set(['access', 'mesh']);
    return this.edges.filter(
      (e) =>
        (e.operator === transit && longHaul.has(e.layer)) ||
        (e.operator === accessOrigin && local.has(e.layer) && (e.a === start || e.b === start)) ||
        (e.operator === accessDest && local.has(e.layer) && (e.a === end || e.b === end)),
    );
  }

  packageRoute(
    origin: string,
    destination: string,
    accessOrigin: string,
    transit: string,
    accessDest: string,
    day: string,
    reroute: boolean,
  ): Route | null {
    const key = `P|${origin}|${destination}|${accessOrigin}|${transit}|${accessDest}|${day}|${reroute}`;
    if (this.routeCache.has(key)) return this.routeCache.get(key) ?? null;
    const route = shortestPath(
      this.packageEdges(origin, destination, accessOrigin, transit, accessDest),
      this.nodePositions(day),
      `c-${origin}`,
      `c-${destination}`,
      new Set([accessOrigin, transit, accessDest]),
      { reroute },
    );
    this.routeCache.set(key, route);
    return route;
  }

  packageLatencyRange(
    origin: string,
    destination: string,
    accessOrigin: string,
    transit: string,
    accessDest: string,
    day: string,
    reroute: boolean,
  ): [number, number] {
    const key = `P|${origin}|${destination}|${accessOrigin}|${transit}|${accessDest}|${day}|${reroute}`;
    const cached = this.rangeCache.get(key);
    if (cached) return cached;
    const values: number[] = [];
    for (let i = 0; i < SAMPLES_PER_YEAR; i += 1) {
      const sample = addDays(day, pyRound((i * 365) / SAMPLES_PER_YEAR));
      const route = this.packageRoute(origin, destination, accessOrigin, transit, accessDest, sample, reroute);
      if (route) values.push(route.latencyMs);
    }
    const result: [number, number] = [Math.min(...values), Math.max(...values)];
    this.rangeCache.set(key, result);
    return result;
  }

  /** Best and worst straight-line latency over 52 dates across the year starting at `day`. */
  directLatencyRange(origin: string, destination: string, day: string): [number, number] {
    const values: number[] = [];
    for (let i = 0; i < SAMPLES_PER_YEAR; i += 1) {
      values.push(this.directLatencyMs(origin, destination, addDays(day, pyRound((i * 365) / SAMPLES_PER_YEAR))));
    }
    return [Math.min(...values), Math.max(...values)];
  }

  distanceKm(origin: string, destination: string, day: string): number {
    const p = this.nodePositions(day);
    return pyRound(dist(p[`c-${origin}`], p[`c-${destination}`]) * AU_KM);
  }
}

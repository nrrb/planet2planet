/**
 * Shortest and diverse paths on the carrier multigraph.
 *
 * Latency is the sum of straight-line propagation, per-hop processing and a handoff delay each
 * time consecutive links belong to different carriers, so the search runs over
 * (node, last carrier) states.
 */

import { propagationMs } from './ephemeris';

export const HANDOFF_MS = 3.0;
export const SUN_THRESHOLD_AU = 0.1;

export type Point = readonly [number, number, number];
export type Positions = Readonly<Record<string, Point>>;

export interface Edge {
  slug: string;
  layer: string;
  a: string;
  b: string;
  operator: string;
  processingMs: number;
}

export interface Route {
  edges: Edge[];
  nodes: string[];
  latencyMs: number;
  handoffs: number;
  degraded: string[];
}

export const dist = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Smallest distance in AU between the Sun (the origin) and the segment pq. */
export function segmentSunClearance(p: Point, q: Point): number {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const lengthSq = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (lengthSq === 0) return Math.hypot(p[0], p[1], p[2]);
  const t = Math.max(0, Math.min(1, -(p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / lengthSq));
  return Math.hypot(p[0] + t * d[0], p[1] + t * d[1], p[2] + t * d[2]);
}

export const edgeLatencyMs = (edge: Edge, positions: Positions): number =>
  propagationMs(dist(positions[edge.a], positions[edge.b])) + edge.processingMs;

export const isDegraded = (edge: Edge, positions: Positions): boolean =>
  segmentSunClearance(positions[edge.a], positions[edge.b]) < SUN_THRESHOLD_AU;

const otherEnd = (edge: Edge, node: string) => (node === edge.a ? edge.b : edge.a);
const stateKey = (node: string, last: string | null) => `${node}\u0000${last ?? ''}`;

interface QueueItem {
  cost: number;
  order: number;
  node: string;
  last: string | null;
}

/** A binary heap ordered by cost, then by insertion order, like Python's heapq on (cost, counter). */
class Heap {
  private items: QueueItem[] = [];

  get size() {
    return this.items.length;
  }

  private less(i: number, j: number) {
    const a = this.items[i];
    const b = this.items[j];
    return a.cost < b.cost || (a.cost === b.cost && a.order < b.order);
  }

  push(item: QueueItem) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }

  pop(): QueueItem {
    const top = this.items[0];
    const last = this.items.pop() as QueueItem;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.less(l, smallest)) smallest = l;
        if (r < this.items.length && this.less(r, smallest)) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

export interface PathOptions {
  reroute?: boolean;
  avoidNodes?: ReadonlySet<string>;
  avoidOperators?: ReadonlySet<string>;
}

/**
 * Lowest-latency route using only links of `carriers`.
 *
 * Conjunction-layer links are used only when `reroute` is set, and then links that pass within
 * 0.1 AU of the Sun are dropped. Without `reroute` the route may include degraded links, which
 * are reported on the result.
 */
export function shortestPath(
  edges: Iterable<Edge>,
  positions: Positions,
  source: string,
  target: string,
  carriers: ReadonlySet<string>,
  { reroute = false, avoidNodes = new Set(), avoidOperators = new Set() }: PathOptions = {},
): Route | null {
  const adjacency = new Map<string, { edge: Edge; weight: number }[]>();
  const attach = (node: string, entry: { edge: Edge; weight: number }) => {
    const list = adjacency.get(node);
    if (list) list.push(entry);
    else adjacency.set(node, [entry]);
  };
  for (const edge of edges) {
    if (!carriers.has(edge.operator)) continue;
    if (edge.layer === 'conjunction' && !reroute) continue;
    if ((edge.layer === 'backbone' || edge.layer === 'cross') && avoidOperators.has(edge.operator)) continue;
    if (avoidNodes.has(edge.a) || avoidNodes.has(edge.b)) continue;
    if (reroute && isDegraded(edge, positions)) continue;
    const entry = { edge, weight: edgeLatencyMs(edge, positions) };
    attach(edge.a, entry);
    attach(edge.b, entry);
  }

  const best = new Map<string, number>([[stateKey(source, null), 0]]);
  const previous = new Map<string, { from: string; fromNode: string; fromLast: string | null; edge: Edge }>();
  const queue = new Heap();
  queue.push({ cost: 0, order: 0, node: source, last: null });
  let counter = 1;
  while (queue.size > 0) {
    const { cost, node, last } = queue.pop();
    if (cost > (best.get(stateKey(node, last)) ?? Infinity)) continue;
    if (node === target) return buildRoute(stateKey(node, last), node, previous, positions, cost);
    for (const { edge, weight } of adjacency.get(node) ?? []) {
      const step = weight + (last !== null && last !== edge.operator ? HANDOFF_MS : 0);
      const next = otherEnd(edge, node);
      const key = stateKey(next, edge.operator);
      if (cost + step < (best.get(key) ?? Infinity)) {
        best.set(key, cost + step);
        previous.set(key, { from: stateKey(node, last), fromNode: node, fromLast: last, edge });
        queue.push({ cost: cost + step, order: counter, node: next, last: edge.operator });
        counter += 1;
      }
    }
  }
  return null;
}

function buildRoute(
  endKey: string,
  endNode: string,
  previous: Map<string, { from: string; fromNode: string; fromLast: string | null; edge: Edge }>,
  positions: Positions,
  cost: number,
): Route {
  const edges: Edge[] = [];
  const nodes = [endNode];
  let key = endKey;
  for (let step = previous.get(key); step; step = previous.get(key)) {
    edges.push(step.edge);
    nodes.push(step.fromNode);
    key = step.from;
  }
  edges.reverse();
  nodes.reverse();
  let handoffs = 0;
  for (let i = 1; i < edges.length; i += 1) if (edges[i - 1].operator !== edges[i].operator) handoffs += 1;
  const degraded = edges.filter((e) => isDegraded(e, positions)).map((e) => e.slug);
  return { edges, nodes, latencyMs: cost, handoffs, degraded };
}

/**
 * A best route plus a second one that shares no intermediate hub with it. Hubs in `shared` (the
 * endpoint regions' hubs, which all traffic must use) are allowed on both. The second route also
 * avoids every backbone and cross link operator of the first.
 */
export function diversePath(
  edges: Iterable<Edge>,
  positions: Positions,
  source: string,
  target: string,
  carriers: ReadonlySet<string>,
  hubs: ReadonlySet<string>,
  shared: ReadonlySet<string>,
  reroute: boolean,
): [Route | null, Route | null] {
  const list = [...edges];
  const first = shortestPath(list, positions, source, target, carriers, { reroute });
  if (first === null) return [null, null];
  const interior = first.nodes.slice(1, -1);
  const avoidNodes = new Set(interior.filter((n) => hubs.has(n) && !shared.has(n)));
  const avoidOperators = new Set(
    first.edges.filter((e) => e.layer === 'backbone' || e.layer === 'cross').map((e) => e.operator),
  );
  const second = shortestPath(list, positions, source, target, carriers, { reroute, avoidNodes, avoidOperators });
  return [first, second];
}

"""Shortest and diverse paths on the carrier multigraph. Pure functions, no Django.

Latency is the sum of straight-line propagation, per-hop processing and a handoff delay each
time consecutive links belong to different carriers, so the search runs over
(node, last carrier) states.
"""

import heapq
import math
from collections import defaultdict
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass, field

from .ephemeris import propagation_ms

HANDOFF_MS = 3.0
SUN_THRESHOLD_AU = 0.1

Point = tuple[float, float, float]


@dataclass(frozen=True)
class Edge:
    slug: str
    layer: str
    a: str
    b: str
    operator: str
    processing_ms: float

    def other(self, node: str) -> str:
        return self.b if node == self.a else self.a


@dataclass
class Route:
    edges: list[Edge]
    nodes: list[str]
    latency_ms: float
    handoffs: int
    degraded: list[str] = field(default_factory=list)

    @property
    def hops(self) -> int:
        return len(self.edges)


def segment_sun_clearance(p: Point, q: Point) -> float:
    """Smallest distance in AU between the Sun (the origin) and the segment pq."""
    d = tuple(qi - pi for pi, qi in zip(p, q, strict=True))
    length_sq = sum(di * di for di in d)
    if length_sq == 0:
        return math.hypot(*p)
    t = max(0.0, min(1.0, -sum(pi * di for pi, di in zip(p, d, strict=True)) / length_sq))
    return math.hypot(*(pi + t * di for pi, di in zip(p, d, strict=True)))


def edge_latency_ms(edge: Edge, positions: Mapping[str, Point]) -> float:
    return propagation_ms(math.dist(positions[edge.a], positions[edge.b])) + edge.processing_ms


def is_degraded(edge: Edge, positions: Mapping[str, Point]) -> bool:
    return segment_sun_clearance(positions[edge.a], positions[edge.b]) < SUN_THRESHOLD_AU


def shortest_path(
    edges: Iterable[Edge],
    positions: Mapping[str, Point],
    source: str,
    target: str,
    carriers: Collection[str],
    *,
    reroute: bool = False,
    avoid_nodes: Collection[str] = (),
    avoid_operators: Collection[str] = (),
) -> Route | None:
    """Lowest-latency route using only links of `carriers`.

    Conjunction-layer links are used only when `reroute` is set, and then links that pass
    within 0.1 AU of the Sun are dropped. Without `reroute` the route may include degraded
    links, which are reported on the result.
    """
    adjacency: dict[str, list[tuple[Edge, float]]] = defaultdict(list)
    for edge in edges:
        if edge.operator not in carriers:
            continue
        if edge.layer == "conjunction" and not reroute:
            continue
        if edge.layer in ("backbone", "cross") and edge.operator in avoid_operators:
            continue
        if edge.a in avoid_nodes or edge.b in avoid_nodes:
            continue
        if reroute and is_degraded(edge, positions):
            continue
        weight = edge_latency_ms(edge, positions)
        adjacency[edge.a].append((edge, weight))
        adjacency[edge.b].append((edge, weight))

    best: dict[tuple[str, str | None], float] = {(source, None): 0.0}
    previous: dict[tuple[str, str | None], tuple[tuple[str, str | None], Edge]] = {}
    queue: list[tuple[float, int, str, str | None]] = [(0.0, 0, source, None)]
    counter = 1
    while queue:
        cost, _, node, last = heapq.heappop(queue)
        if cost > best.get((node, last), math.inf):
            continue
        if node == target:
            return _build_route((node, last), previous, positions, cost)
        for edge, weight in adjacency.get(node, ()):
            step = weight + (HANDOFF_MS if last is not None and last != edge.operator else 0.0)
            state = (edge.other(node), edge.operator)
            if cost + step < best.get(state, math.inf):
                best[state] = cost + step
                previous[state] = ((node, last), edge)
                heapq.heappush(queue, (cost + step, counter, state[0], state[1]))
                counter += 1
    return None


def _build_route(end, previous, positions: Mapping[str, Point], cost: float) -> Route:
    edges: list[Edge] = []
    nodes = [end[0]]
    state = end
    while state in previous:
        state, edge = previous[state]
        edges.append(edge)
        nodes.append(state[0])
    edges.reverse()
    nodes.reverse()
    handoffs = sum(1 for x, y in zip(edges, edges[1:], strict=False) if x.operator != y.operator)
    degraded = [e.slug for e in edges if is_degraded(e, positions)]
    return Route(edges=edges, nodes=nodes, latency_ms=cost, handoffs=handoffs, degraded=degraded)


def diverse_path(
    edges: Iterable[Edge],
    positions: Mapping[str, Point],
    source: str,
    target: str,
    carriers: Collection[str],
    *,
    hubs: Collection[str],
    shared: Collection[str] = (),
    reroute: bool = False,
) -> tuple[Route | None, Route | None]:
    """A best route plus a second one that shares no intermediate hub with it.

    Hubs in `shared` (the endpoint regions' hubs, which all traffic must use) are allowed on
    both. The second route also avoids every backbone and cross link operator of the first.
    """
    edges = list(edges)
    first = shortest_path(edges, positions, source, target, carriers, reroute=reroute)
    if first is None:
        return None, None
    interior = set(first.nodes[1:-1])
    avoid_nodes = (interior & set(hubs)) - set(shared)
    avoid_operators = {e.operator for e in first.edges if e.layer in ("backbone", "cross")}
    second = shortest_path(
        edges,
        positions,
        source,
        target,
        carriers,
        reroute=reroute,
        avoid_nodes=avoid_nodes,
        avoid_operators=avoid_operators,
    )
    return first, second

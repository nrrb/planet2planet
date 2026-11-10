"""Network services: node positions, routes, latency range and conjunction windows.

Everything is derived from the stored network and a date, and memoised per input.
"""

import math
from collections.abc import Collection
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache

from .ephemeris import (
    Elements,
    days_since_j2000,
    heliocentric_position,
    moon_offset_au,
    propagation_ms,
)
from .models import Link, MoonPhase, Node, OrbitalElements
from .routing import Edge, Point, Route, diverse_path, is_degraded, shortest_path

SAMPLES_PER_YEAR = 52
CONJUNCTION_HORIZON_DAYS = 4 * 366


def clear_caches() -> None:
    _static_graph.cache_clear()
    _edges_by_operator.cache_clear()
    node_positions.cache_clear()
    route_for.cache_clear()
    diverse_routes.cache_clear()
    latency_range.cache_clear()
    conjunction_window.cache_clear()
    package_route.cache_clear()
    package_latency_range.cache_clear()


def _noon(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 12, tzinfo=UTC)


@lru_cache(maxsize=1)
def _static_graph():
    """Edges, node metadata and orbital inputs, loaded once per process."""
    elements = {
        e.world_id: Elements(
            e.semi_major_axis_au,
            e.semi_major_axis_rate,
            e.eccentricity,
            e.eccentricity_rate,
            e.longitude_of_perihelion_deg,
            e.longitude_of_perihelion_rate,
            e.mean_longitude_deg,
            e.mean_longitude_rate,
            e.b,
            e.c,
            e.s,
            e.f,
        )
        for e in OrbitalElements.objects.all()
    }
    phases = {p.world_id: p.phase_deg for p in MoonPhase.objects.all()}
    nodes = list(Node.objects.select_related("world"))
    moons = {
        n.world_id: (n.world.parent_id, n.world.orbit_radius_km, n.world.orbital_period_days)
        for n in nodes
        if n.world and n.world.parent_id
    }
    edges = [
        Edge(l.slug, l.layer, l.a_id, l.b_id, l.operator_id, l.processing_ms)
        for l in Link.objects.all()  # noqa: E741
    ]
    return elements, phases, nodes, moons, tuple(edges)


def edges() -> tuple[Edge, ...]:
    return _static_graph()[4]


@lru_cache(maxsize=1)
def _edges_by_operator() -> dict[str, tuple[Edge, ...]]:
    grouped: dict[str, list[Edge]] = {}
    for edge in edges():
        grouped.setdefault(edge.operator, []).append(edge)
    return {operator: tuple(items) for operator, items in grouped.items()}


def edges_for(carriers: Collection[str]) -> list[Edge]:
    by_operator = _edges_by_operator()
    return [edge for carrier in carriers for edge in by_operator.get(carrier, ())]


def hub_slugs() -> frozenset[str]:
    return frozenset(n.slug for n in _static_graph()[2] if n.kind == Node.Kind.HUB)


def world_position(world: str, day: date) -> Point:
    elements, phases, _, moons, _ = _static_graph()
    days = days_since_j2000(_noon(day))
    if world in moons:
        parent, radius_km, period = moons[world]
        px, py = heliocentric_position(elements[parent], days)
        dx, dy = moon_offset_au(radius_km, period, phases[world], days)
        return (px + dx, py + dy, 0.0)
    x, y = heliocentric_position(elements[world], days)
    return (x, y, 0.0)


@lru_cache(maxsize=512)
def node_positions(day: date) -> dict[str, Point]:
    _, _, nodes, _, _ = _static_graph()
    positions: dict[str, Point] = {}
    by_world: dict[str, Point] = {}
    for node in nodes:
        if node.kind == Node.Kind.RELAY:
            positions[node.slug] = (node.fixed_x, node.fixed_y, node.fixed_z)
        else:
            if node.world_id not in by_world:
                by_world[node.world_id] = world_position(node.world_id, day)
            positions[node.slug] = by_world[node.world_id]
    return positions


def direct_latency_ms(origin: str, destination: str, day: date) -> float:
    positions = node_positions(day)
    return propagation_ms(math.dist(positions[f"c-{origin}"], positions[f"c-{destination}"]))


@lru_cache(maxsize=4096)
def route_for(
    origin: str, destination: str, carriers: frozenset[str], day: date, reroute: bool = False
) -> Route | None:
    return shortest_path(
        edges_for(carriers),
        node_positions(day),
        f"c-{origin}",
        f"c-{destination}",
        carriers,
        reroute=reroute,
    )


@lru_cache(maxsize=2048)
def diverse_routes(
    origin: str, destination: str, carriers: frozenset[str], day: date, reroute: bool = False
) -> tuple[Route | None, Route | None]:
    region = {n.slug: n.region_id for n in _static_graph()[2]}
    shared = {f"h-{region[f'c-{origin}']}", f"h-{region[f'c-{destination}']}"}
    return diverse_path(
        edges_for(carriers),
        node_positions(day),
        f"c-{origin}",
        f"c-{destination}",
        carriers,
        hubs=hub_slugs(),
        shared=shared,
        reroute=reroute,
    )


@lru_cache(maxsize=1024)
def latency_range(
    origin: str,
    destination: str,
    carriers: frozenset[str],
    day: date,
    reroute: bool = False,
) -> tuple[float, float]:
    """Best and worst latency over 52 dates across the year starting at `day`."""
    values = []
    for i in range(SAMPLES_PER_YEAR):
        sample = day + timedelta(days=round(i * 365 / SAMPLES_PER_YEAR))
        route = route_for(origin, destination, carriers, sample, reroute)
        if route is not None:
            values.append(route.latency_ms)
    return min(values), max(values)


def pair_degraded(origin: str, destination: str, day: date) -> bool:
    """Whether the straight subspace line between two worlds passes within 0.1 AU of the Sun."""
    positions = node_positions(day)
    edge = Edge("pair", "pair", f"c-{origin}", f"c-{destination}", "-", 0.0)
    return is_degraded(edge, positions)


def _same_system(origin: str, destination: str) -> bool:
    _, _, _, moons, _ = _static_graph()
    parent_o = moons.get(origin, (origin,))[0]
    parent_d = moons.get(destination, (destination,))[0]
    return parent_o == parent_d


@lru_cache(maxsize=1024)
def conjunction_window(origin: str, destination: str, day: date) -> tuple[date, date] | None:
    """The conjunction window that is active on `day` or the next one, by daily steps."""
    if _same_system(origin, destination):
        return None
    start = None
    for offset in range(CONJUNCTION_HORIZON_DAYS):
        current = day + timedelta(days=offset)
        if pair_degraded(origin, destination, current):
            start = current
            break
    if start is None:
        return None
    if start == day:
        # Active now: walk back to the start of the window.
        while pair_degraded(origin, destination, start - timedelta(days=1)):
            start -= timedelta(days=1)
    end = start
    while pair_degraded(origin, destination, end + timedelta(days=1)):
        end += timedelta(days=1)
    return start, end


def _package_edges(
    origin: str, destination: str, access_origin: str, transit: str, access_dest: str
):
    """Each carrier of a package is confined to its own leg (PLAN.md 6.2)."""
    start, end = f"c-{origin}", f"c-{destination}"
    long_haul = {"backbone", "cross", "conjunction"}
    local = {"access", "mesh"}
    chosen = []
    for e in edges():
        if (
            e.operator == transit
            and e.layer in long_haul
            or e.operator == access_origin
            and e.layer in local
            and start in (e.a, e.b)
            or e.operator == access_dest
            and e.layer in local
            and end in (e.a, e.b)
        ):
            chosen.append(e)
    return chosen


@lru_cache(maxsize=4096)
def package_route(
    origin: str,
    destination: str,
    access_origin: str,
    transit: str,
    access_dest: str,
    day: date,
    reroute: bool = False,
) -> Route | None:
    return shortest_path(
        _package_edges(origin, destination, access_origin, transit, access_dest),
        node_positions(day),
        f"c-{origin}",
        f"c-{destination}",
        {access_origin, transit, access_dest},
        reroute=reroute,
    )


@lru_cache(maxsize=1024)
def package_latency_range(
    origin: str,
    destination: str,
    access_origin: str,
    transit: str,
    access_dest: str,
    day: date,
    reroute: bool = False,
) -> tuple[float, float]:
    values = []
    for i in range(SAMPLES_PER_YEAR):
        sample = day + timedelta(days=round(i * 365 / SAMPLES_PER_YEAR))
        route = package_route(
            origin, destination, access_origin, transit, access_dest, sample, reroute
        )
        if route is not None:
            values.append(route.latency_ms)
    return min(values), max(values)

"""Assemble priced offers for a pair of worlds (PLAN.md 6.2).

Three kinds: end-to-end plans from companies covering both ends, packages (access plan +
backbone transit plan + access plan, each carrier on its own leg), and add-ons shown on an
offer. Offers are not stored; they are computed per request and memoised by the services
underneath. Every plan, price and carrier relationship here is invented.
"""

import hashlib
import math
from dataclasses import dataclass
from datetime import date
from functools import lru_cache, partial
from itertools import product

from apps.catalog.models import Company, World
from apps.network import services
from apps.network.routing import Route

from .constants import required_environments
from .formula import Price, Segment, price_offer, segment_cost
from .models import Plan, PricingParameter

LONG_HAUL = {"backbone", "cross", "conjunction"}
ACCESS_CLASS = {"shared": "shared", "dedicated": "dedicated", "synchronized": "dedicated"}


@dataclass(frozen=True)
class CompanyInfo:
    slug: str
    name: str
    kind: str
    status: str
    owner: str | None
    positioning: float
    founded: int


@dataclass(frozen=True)
class WorldInfo:
    slug: str
    name: str
    region: str
    population: int | None


@dataclass(frozen=True)
class Snapshot:
    params: dict[str, float]
    companies: dict[str, CompanyInfo]
    plans: dict[str, tuple[Plan, ...]]
    coverage: dict[str, frozenset[str]]
    worlds: dict[str, WorldInfo]
    family: dict[str, int]
    divisions: dict[str, tuple[str, ...]]


def clear_caches() -> None:
    snapshot.cache_clear()


@lru_cache(maxsize=1)
def snapshot() -> Snapshot:
    companies_qs = Company.objects.exclude(status=Company.Status.MERGED).prefetch_related(
        "service_areas"
    )
    all_companies = list(Company.objects.all())
    companies = {
        c.slug: CompanyInfo(
            c.slug, c.name, c.kind, c.status, c.owner_id, c.price_positioning or 1.0, c.founded
        )
        for c in companies_qs
    }
    plans: dict[str, list[Plan]] = {}
    for plan in Plan.objects.order_by("slug"):
        plans.setdefault(plan.company_id, []).append(plan)
    coverage = {c.slug: frozenset(a.world_id for a in c.service_areas.all()) for c in companies_qs}
    worlds = {
        w.slug: WorldInfo(w.slug, w.name, w.region_id, w.population) for w in World.objects.all()
    }
    divisions: dict[str, list[str]] = {}
    for c in companies.values():
        if c.owner:
            divisions.setdefault(c.owner, []).append(c.slug)
    return Snapshot(
        params={p.key: p.value for p in PricingParameter.objects.all()},
        companies=companies,
        plans={k: tuple(v) for k, v in plans.items()},
        coverage=coverage,
        worlds=worlds,
        family=_families(all_companies),
        divisions={k: tuple(v) for k, v in divisions.items()},
    )


def _families(companies: list[Company]) -> dict[str, int]:
    """Corporate families: companies linked by spin-off (parent) or ownership."""
    root = {c.slug: c.slug for c in companies}

    def find(x: str) -> str:
        while root[x] != x:
            root[x] = root[root[x]]
            x = root[x]
        return x

    for c in companies:
        for other in (c.parent_id, c.owner_id, c.acquired_by_id):
            if other:
                root[find(c.slug)] = find(other)
    ids: dict[str, int] = {}
    return {c.slug: ids.setdefault(find(c.slug), len(ids)) for c in companies}


@dataclass
class Offer:
    id: str
    title: str
    lead: str
    owner: str | None
    partners: list[str]
    plans: list[str]
    service_class: str
    throughput: int
    tier: str
    reroute: bool
    environments: list[str]
    sectors: list[str]
    route: Route
    price: Price
    latency_now: float
    latency_min: float | None
    latency_max: float | None
    on_network_share: float
    segments: list[dict]
    addons: list[dict]
    badges: list[str]
    kind: str  # "end-to-end" or "package"

    @property
    def companies(self) -> set[str]:
        return {self.lead, *self.partners}


def offer_id(origin: str, destination: str, plans: list[str], partners: list[str]) -> str:
    raw = "|".join([origin, destination, ",".join(sorted(plans)), ",".join(sorted(partners))])
    return "of_" + hashlib.sha1(raw.encode()).hexdigest()[:12]  # noqa: S324 - not security


def independent_carriers(snap: Snapshot, origin: str, destination: str) -> int:
    """Distinct owners among companies that can carry the pair end to end."""
    owners = {
        c.owner or c.slug
        for c in snap.companies.values()
        if c.kind != "gateway"
        and origin in snap.coverage[c.slug]
        and destination in snap.coverage[c.slug]
        and any(p.standalone for p in snap.plans.get(c.slug, ()))
    }
    return len(owners)


def _length_au(route: Route, positions) -> list[float]:
    return [math.dist(positions[e.a], positions[e.b]) for e in route.edges if e.layer in LONG_HAUL]


def _segments(route: Route, positions) -> list[dict]:
    from apps.network.ephemeris import AU_KM, propagation_ms

    groups: list[dict] = []
    for edge in route.edges:
        length = math.dist(positions[edge.a], positions[edge.b])
        latency = propagation_ms(length) + edge.processing_ms
        if groups and groups[-1]["company"] == edge.operator and groups[-1]["layer"] == edge.layer:
            group = groups[-1]
        else:
            start = groups[-1]["node_ids"][-1] if groups else route.nodes[0]
            group = {
                "company": edge.operator,
                "layer": edge.layer,
                "node_ids": [start],
                "link_ids": [],
                "length_km": 0.0,
                "latency_ms": 0.0,
            }
            groups.append(group)
        group["node_ids"].append(edge.b if edge.a == group["node_ids"][-1] else edge.a)
        group["link_ids"].append(edge.slug)
        group["length_km"] += length * AU_KM
        group["latency_ms"] += latency
    for group in groups:
        group["length_km"] = round(group["length_km"])
        group["latency_ms"] = round(group["latency_ms"], 2)
    return groups


def _on_network_share(route: Route, lead: str, positions) -> float:
    lengths = [(e.operator, math.dist(positions[e.a], positions[e.b])) for e in route.edges]
    total = sum(length for _, length in lengths)
    if total == 0:
        return sum(1 for op, _ in lengths if op == lead) / max(len(lengths), 1)
    return round(sum(length for op, length in lengths if op == lead) / total, 3)


def _same_family(snap: Snapshot, carriers: set[str]) -> bool:
    return len(carriers) > 1 and len({snap.family[c] for c in carriers}) == 1


def _build_offer(
    snap,
    origin,
    destination,
    day,
    *,
    title,
    lead,
    partners,
    plans,
    route,
    reroute,
    with_range,
    lead_plan,
    range_args=None,
    carriers_for_family,
    kind,
) -> Offer:
    positions = services.node_positions(day)
    operators = {e.operator for e in route.edges}
    family = _same_family(snap, carriers_for_family | operators)
    populations = [snap.worlds[origin].population, snap.worlds[destination].population]
    needed = required_environments(origin, snap.worlds[origin].region) | required_environments(
        destination, snap.worlds[destination].region
    )
    price = price_offer(
        snap.params,
        segments=[
            Segment(
                f"{p.name} ({snap.companies[p.company_id].name})",
                p.monthly_base,
                p.throughput,
                p.service_class,
                snap.companies[p.company_id].positioning,
                p.setup_fee,
            )
            for p in plans
        ],
        hop_lengths_au=_length_au(route, positions),
        handoffs=route.handoffs,
        family=family,
        lead_positioning=snap.companies[lead].positioning,
        independent_carriers=independent_carriers(snap, origin, destination),
        populations=populations,
        required_environments=needed,
        tier=lead_plan.resilience_tier,
        reroute=reroute,
        contract_terms=lead_plan.terms or None,
    )
    low = high = None
    if with_range:
        low, high = range_args()
    env_have = set(lead_plan.environments)
    addons = _addons(snap, origin, destination, lead_plan, price, needed, env_have)
    return Offer(
        id=offer_id(origin, destination, [p.slug for p in plans], partners),
        title=title,
        lead=lead,
        owner=snap.companies[lead].owner,
        partners=partners,
        plans=[p.slug for p in plans],
        service_class=lead_plan.service_class,
        throughput=min(p.throughput for p in plans),
        tier=lead_plan.resilience_tier,
        reroute=reroute,
        environments=sorted(env_have),
        sectors=sorted(
            set.intersection(*(set(p.sectors) for p in plans)) or set(lead_plan.sectors)
        ),
        route=route,
        price=price,
        latency_now=route.latency_ms,
        latency_min=low,
        latency_max=high,
        on_network_share=_on_network_share(route, lead, positions),
        segments=_segments(route, positions),
        addons=addons,
        badges=[],
        kind=kind,
    )


def _addons(snap, origin, destination, lead_plan, price, needed, env_have) -> list[dict]:
    addons = []
    for company_slug, plans in snap.plans.items():
        for plan in plans:
            if plan.role != "addon":
                continue
            covered = snap.coverage.get(company_slug, frozenset())
            if (
                origin in covered
                and destination in covered
                and lead_plan.resilience_tier != "contingency"
            ):
                company = snap.companies[company_slug]
                cost = segment_cost(
                    snap.params,
                    Segment(
                        plan.name,
                        plan.monthly_base,
                        plan.throughput,
                        plan.service_class,
                        company.positioning,
                    ),
                )
                addons.append(
                    {
                        "id": "emergency-priority",
                        "label": "Priority lane on the system-wide emergency network",
                        "company": company_slug,
                        "monthly": round(cost),
                    }
                )
    missing = needed - env_have
    if missing:
        addons.append(
            {
                "id": "hardening",
                "label": f"Hardening for {', '.join(sorted(missing))}",
                "company": None,
                "monthly": round(price.monthly * snap.params["addon.hardening_pct"]),
            }
        )
    return addons


def build_offers(
    origin: str, destination: str, day: date, *, with_range: bool = True
) -> list[Offer]:
    snap = snapshot()
    both = [
        slug
        for slug, covered in snap.coverage.items()
        if origin in covered and destination in covered
    ]
    offers: dict[str, Offer] = {}

    def add(offer: Offer | None) -> None:
        if offer is not None:
            offers.setdefault(offer.id, offer)

    backbones = [s for s in both if snap.companies[s].kind == "backbone"]
    same_region = snap.worlds[origin].region == snap.worlds[destination].region

    # 1. End-to-end offers.
    for slug in both:
        company = snap.companies[slug]
        if company.kind == "gateway":
            continue
        for plan in snap.plans.get(slug, ()):
            if not plan.standalone or plan.role == "addon":
                continue
            partners: list[str] = []
            if plan.resilience_tier in ("diverse-path", "contingency"):
                if same_region:
                    continue
                family = snap.family[slug]
                others = [b for b in backbones if snap.family[b] != family]
                if not others:
                    continue
                partners = [min(others, key=lambda b: (snap.companies[b].positioning, b))]
            carriers = frozenset({slug, *snap.divisions.get(slug, ()), *partners})
            route = services.route_for(origin, destination, carriers, day, plan.conjunction_reroute)
            if route is None:
                continue
            if partners:
                _, second = services.diverse_routes(
                    origin, destination, carriers, day, plan.conjunction_reroute
                )
                if second is None:
                    continue
            add(
                _build_offer(
                    snap,
                    origin,
                    destination,
                    day,
                    title=plan.name,
                    lead=slug,
                    partners=partners,
                    plans=[plan],
                    lead_plan=plan,
                    route=route,
                    reroute=plan.conjunction_reroute,
                    with_range=with_range,
                    range_args=lambda c=carriers, r=plan.conjunction_reroute: (
                        services.latency_range(origin, destination, c, day, r)
                    ),
                    carriers_for_family={slug},
                    kind="end-to-end",
                )
            )

    # 2. Packages: access + backbone transit + access, in different regions only. An end
    # with no access partner is served by the transit carrier's own mesh.
    if not same_region:
        for transit_slug in backbones:
            candidates = _package_candidates(snap, origin, destination, day, transit_slug)
            candidates.sort(key=lambda c: (not c["family"], c["price"], c["key"]))
            for candidate in candidates[: int(snap.params["packages.per_transit"])]:
                oa, ta, da = candidate["access_o"], candidate["transit"], candidate["access_d"]
                access_o = oa.company_id if oa else transit_slug
                access_d = da.company_id if da else transit_slug
                legs = [p for p in (oa, ta, da) if p is not None]
                add(
                    _build_offer(
                        snap,
                        origin,
                        destination,
                        day,
                        title=f"{ta.name} package",
                        lead=transit_slug,
                        partners=sorted({access_o, access_d} - {transit_slug}),
                        plans=legs,
                        lead_plan=ta,
                        route=candidate["route"],
                        reroute=ta.conjunction_reroute,
                        with_range=with_range,
                        range_args=partial(
                            services.package_latency_range,
                            origin,
                            destination,
                            access_o,
                            transit_slug,
                            access_d,
                            day,
                            ta.conjunction_reroute,
                        ),
                        carriers_for_family={access_o, transit_slug, access_d},
                        kind="package",
                    )
                )
    return list(offers.values())


def _package_candidates(snap, origin, destination, day, transit_slug) -> list[dict]:
    def access_plans(world: str, wanted: str) -> list[Plan | None]:
        found: list[Plan | None] = [None]  # None: the transit carrier's own mesh
        for slug, covered in snap.coverage.items():
            kind = snap.companies[slug].kind
            if world in covered and kind in ("gateway", "regional"):
                found += [
                    p
                    for p in snap.plans.get(slug, ())
                    if p.role in ("access", "regional") and p.service_class == wanted
                ]
        return found

    positions = services.node_positions(day)
    out = []
    for transit in snap.plans.get(transit_slug, ()):
        if transit.role != "transit" or transit.resilience_tier != "standard":
            continue
        wanted = ACCESS_CLASS[transit.service_class]
        for oa, da in product(access_plans(origin, wanted), access_plans(destination, wanted)):
            if oa is None and da is None:
                continue  # identical to the end-to-end offer
            access_o = oa.company_id if oa else transit_slug
            access_d = da.company_id if da else transit_slug
            route = services.package_route(
                origin,
                destination,
                access_o,
                transit_slug,
                access_d,
                day,
                transit.conjunction_reroute,
            )
            if route is None:
                continue
            carriers = {access_o, transit_slug, access_d}
            family = _same_family(snap, carriers)
            legs = [p for p in (oa, transit, da) if p is not None]
            quick = price_offer(
                snap.params,
                segments=[
                    Segment(
                        p.name,
                        p.monthly_base,
                        p.throughput,
                        p.service_class,
                        snap.companies[p.company_id].positioning,
                        p.setup_fee,
                    )
                    for p in legs
                ],
                hop_lengths_au=_length_au(route, positions),
                handoffs=route.handoffs,
                family=family,
                lead_positioning=snap.companies[transit_slug].positioning,
                independent_carriers=3,
                populations=[None],
                required_environments=set(),
                tier="standard",
                reroute=False,
            )
            out.append(
                {
                    "access_o": oa,
                    "transit": transit,
                    "access_d": da,
                    "route": route,
                    "family": family,
                    "price": quick.monthly,
                    "key": (oa.slug if oa else "", transit.slug, da.slug if da else ""),
                }
            )
    return out

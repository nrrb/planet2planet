"""Quote service: route summary, filtering, sorting, badges and offer serialization."""

import math
from dataclasses import dataclass, field
from datetime import date

from django.conf import settings

from apps.network import services
from apps.network.builder import REGION_CHAIN
from apps.network.ephemeris import AU_KM

from .constants import TIER_RANK
from .offers import Offer, Snapshot, build_offers, independent_carriers, snapshot

SORTS = ["price", "latency", "worst-latency", "tier"]


@dataclass
class Filters:
    service_classes: list[str] = field(default_factory=list)
    sectors: list[str] = field(default_factory=list)
    tiers: list[str] = field(default_factory=list)
    kinds: list[str] = field(default_factory=list)
    companies: list[str] = field(default_factory=list)
    environments: list[str] = field(default_factory=list)
    max_latency_ms: float | None = None
    reroute: bool = False


def site_day() -> date:
    return date.fromisoformat(settings.SITE_DATE)


def route_summary(snap: Snapshot, origin: str, destination: str, day: date) -> dict:
    positions = services.node_positions(day)
    distance_au = math.dist(positions[f"c-{origin}"], positions[f"c-{destination}"])
    low, high = services.direct_latency_range(origin, destination, day)
    region_o, region_d = snap.worlds[origin].region, snap.worlds[destination].region
    i, j = sorted((REGION_CHAIN.index(region_o), REGION_CHAIN.index(region_d)))
    regions = REGION_CHAIN[i : j + 1]
    if REGION_CHAIN.index(region_o) > REGION_CHAIN.index(region_d):
        regions = regions[::-1]
    window = services.conjunction_window(origin, destination, day)
    conjunction = {"active_now": False, "next_start": None, "next_end": None}
    if window:
        start, end = window
        conjunction = {
            "active_now": start <= day <= end,
            "next_start": start.isoformat(),
            "next_end": end.isoformat(),
        }
    providers = sum(
        1 for covered in snap.coverage.values() if origin in covered and destination in covered
    )
    return {
        "from": origin,
        "to": destination,
        "date": day.isoformat(),
        "stardate": settings.SITE_STARDATE,
        "distance_km": round(distance_au * AU_KM),
        "latency_ms": {
            "direct": round(services.direct_latency_ms(origin, destination, day), 2),
            "min": round(low, 2),
            "max": round(high, 2),
        },
        "regions": regions,
        "providers": providers,
        "independent_carriers": independent_carriers(snap, origin, destination),
        "conjunction": conjunction,
    }


def apply_filters(snap: Snapshot, offers: list[Offer], f: Filters) -> list[Offer]:
    def keep(o: Offer) -> bool:
        if f.service_classes and o.service_class not in f.service_classes:
            return False
        if f.sectors and not set(f.sectors) & set(o.sectors):
            return False
        if f.tiers and o.tier not in f.tiers:
            return False
        if f.kinds and snap.companies[o.lead].kind not in f.kinds:
            return False
        if f.companies and not set(f.companies) & o.companies:
            return False
        if f.environments and not set(f.environments) <= set(o.environments):
            return False
        if f.max_latency_ms is not None and o.latency_now > f.max_latency_ms:
            return False
        return not (f.reroute and not o.reroute)

    return [o for o in offers if keep(o)]


def sort_offers(offers: list[Offer], sort: str) -> list[Offer]:
    keys = {
        "price": lambda o: (o.price.monthly, o.id),
        "latency": lambda o: (o.latency_now, o.price.monthly, o.id),
        "worst-latency": lambda o: (o.latency_max or o.latency_now, o.price.monthly, o.id),
        "tier": lambda o: (-TIER_RANK[o.tier], o.price.monthly, o.id),
    }
    return sorted(offers, key=keys[sort])


def assign_badges(offers: list[Offer]) -> None:
    for offer in offers:
        offer.badges = []
    if not offers:
        return
    min(offers, key=lambda o: (o.price.monthly, o.id)).badges.append("lowest-price")
    min(offers, key=lambda o: (o.latency_now, o.price.monthly, o.id)).badges.append(
        "lowest-latency"
    )
    min(offers, key=lambda o: (-TIER_RANK[o.tier], o.price.monthly, o.id)).badges.append(
        "most-resilient"
    )


def offer_to_dict(offer: Offer) -> dict:
    return {
        "id": offer.id,
        "title": offer.title,
        "kind": offer.kind,
        "lead_company_id": offer.lead,
        "owner_id": offer.owner,
        "partner_ids": offer.partners,
        "plan_ids": offer.plans,
        "service_class": offer.service_class,
        "throughput": offer.throughput,
        "resilience_tier": offer.tier,
        "conjunction": "rerouted" if offer.reroute else "degraded",
        "environments": offer.environments,
        "sectors": offer.sectors,
        "hops": offer.route.hops,
        "handoffs": offer.route.handoffs,
        "on_network_share": offer.on_network_share,
        "latency_ms": {
            "now": round(offer.latency_now, 2),
            "min": round(offer.latency_min, 2),
            "max": round(offer.latency_max, 2),
        },
        "price": {
            "monthly": offer.price.monthly,
            "setup": offer.price.setup,
            "currency": offer.price.currency,
            "breakdown": [
                {"label": ln.label, "credits": ln.credits} for ln in offer.price.breakdown
            ],
            "terms": offer.price.terms,
        },
        "segments": [
            {
                "company_id": s["company"],
                "layer": s["layer"],
                "node_ids": s["node_ids"],
                "link_ids": s["link_ids"],
                "length_km": s["length_km"],
                "latency_ms": s["latency_ms"],
            }
            for s in offer.segments
        ],
        "addons": [
            {
                "id": a["id"],
                "label": a["label"],
                "company_id": a["company"],
                "monthly": a["monthly"],
            }
            for a in offer.addons
        ],
        "badges": offer.badges,
    }


def quote(origin: str, destination: str, f: Filters, sort: str) -> dict:
    snap = snapshot()
    day = site_day()
    offers = apply_filters(snap, build_offers(origin, destination, day), f)
    offers = sort_offers(offers, sort)
    assign_badges(offers)
    return {
        "route": route_summary(snap, origin, destination, day),
        "offers": [offer_to_dict(o) for o in offers],
    }

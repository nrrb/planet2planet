"""Data integrity checks, run by `check_data` locally and in CI."""

from collections import defaultdict
from itertools import combinations

from apps.catalog.models import Company
from apps.network import services

from . import quotes
from .offers import build_offers, snapshot


def run_checks(*, with_ranges: bool = False) -> tuple[list[str], int]:
    """Return (problems, number of pairs priced)."""
    problems: list[str] = []
    snap = snapshot()
    day = quotes.site_day()

    # Every company with service has at least one plan.
    for company in Company.objects.exclude(status=Company.Status.MERGED):
        if snap.coverage.get(company.slug) and not snap.plans.get(company.slug):
            problems.append(f"{company.slug} has service but no plans")

    # Every world is reachable from every other over the stored network.
    adjacency: dict[str, set[str]] = defaultdict(set)
    for edge in services.edges():
        if edge.layer != "conjunction":
            adjacency[edge.a].add(edge.b)
            adjacency[edge.b].add(edge.a)
    worlds = sorted(snap.worlds)
    seen, stack = set(), ["c-earth"]
    while stack:
        node = stack.pop()
        if node not in seen:
            seen.add(node)
            stack.extend(adjacency[node] - seen)
    for slug in worlds:
        if f"c-{slug}" not in seen:
            problems.append(f"{slug} is not reachable over the network")

    # Every pair prices without error, and no route uses a carrier outside its offer.
    pairs = 0
    for origin, destination in combinations(worlds, 2):
        pairs += 1
        try:
            offers = build_offers(origin, destination, day, with_range=with_ranges)
        except Exception as error:  # report, don't stop at the first failure  # noqa: BLE001
            problems.append(f"{origin} to {destination} failed to price: {error!r}")
            continue
        if not offers:
            problems.append(f"{origin} to {destination} has no offers")
        for offer in offers:
            allowed = set(offer.companies)
            for company in list(allowed):
                allowed |= set(snap.divisions.get(company, ()))
            outside = {e.operator for e in offer.route.edges} - allowed
            if outside:
                problems.append(f"{origin} to {destination}: {offer.title} uses {sorted(outside)}")
            if sum(ln.credits for ln in offer.price.breakdown) != offer.price.monthly:
                problems.append(f"{origin} to {destination}: {offer.title} breakdown mismatch")
    return problems, pairs

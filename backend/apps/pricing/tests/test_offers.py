from collections import Counter
from datetime import date

import pytest
from django.core.management import call_command

from apps.catalog.models import Company
from apps.network import services
from apps.pricing import offers as offers_module
from apps.pricing.offers import build_offers, snapshot

SITE = date(2380, 6, 9)


@pytest.fixture
def seeded(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    call_command("build_network")
    call_command("generate_plans")
    services.clear_caches()
    offers_module.clear_caches()


@pytest.fixture
def jupiter_saturn(seeded):
    return build_offers("jupiter", "saturn", SITE)


def test_jupiter_saturn_has_offers_from_backbones_and_specialists(jupiter_saturn):
    leads = {o.lead for o in jupiter_saturn if o.kind == "end-to-end"}
    assert {"terran-transit", "tycho-transit", "ares-interplanetary", "jovian-subspace"} <= leads
    specialists = {l for l in leads if snapshot().companies[l].kind == "specialist"}  # noqa: E741
    assert {"amalthea-fuel-logistics", "galilean-station-link"} <= specialists


def test_packages_include_saturns_regional_carrier(jupiter_saturn):
    packages = [o for o in jupiter_saturn if o.kind == "package"]
    assert packages
    assert any("cassini-link" in o.partners for o in packages)


def test_gateways_are_never_the_lead_or_sold_alone(jupiter_saturn):
    snap = snapshot()
    for offer in jupiter_saturn:
        assert snap.companies[offer.lead].kind != "gateway"
        if offer.kind == "end-to-end":
            assert len(offer.plans) == 1
            assert "access" not in offer.plans[0]


def test_merged_companies_are_never_offered(seeded):
    merged = set(Company.objects.filter(status="merged").values_list("slug", flat=True))
    for origin, destination in [("jupiter", "saturn"), ("earth", "mars"), ("moon", "titan")]:
        for offer in build_offers(origin, destination, SITE, with_range=False):
            assert not offer.companies & merged


def test_divisions_show_their_owner(seeded):
    offers = build_offers("earth", "eris", SITE, with_range=False)
    emergency = [o for o in offers if o.lead == "equatorial-emergency-net"]
    for offer in emergency:
        assert offer.owner == "terran-transit"


def test_at_most_three_packages_per_transit_carrier(jupiter_saturn):
    counts = Counter(o.lead for o in jupiter_saturn if o.kind == "package")
    assert counts and max(counts.values()) <= 3


def test_price_breakdown_adds_up_on_every_offer(jupiter_saturn):
    for offer in jupiter_saturn:
        assert sum(line.credits for line in offer.price.breakdown) == offer.price.monthly
        assert offer.price.monthly > 0 and offer.price.setup >= 0


def test_a_route_never_uses_a_carrier_outside_the_offer(jupiter_saturn):
    snap = snapshot()
    for offer in jupiter_saturn:
        allowed = set(offer.companies)
        for company in list(allowed):
            allowed |= set(snap.divisions.get(company, ()))
        assert {e.operator for e in offer.route.edges} <= allowed, offer.title


def test_package_legs_use_their_own_carriers(jupiter_saturn):
    for offer in (o for o in jupiter_saturn if o.kind == "package"):
        by_layer = {(s["layer"], s["company"]) for s in offer.segments}
        assert any(layer in ("access", "mesh") and c != offer.lead for layer, c in by_layer)
        assert all(
            c == offer.lead
            for layer, c in by_layer
            if layer in ("backbone", "cross", "conjunction")
        )


def test_diverse_and_contingency_offers_name_a_partner_backbone(jupiter_saturn):
    tiered = [o for o in jupiter_saturn if o.tier in ("diverse-path", "contingency")]
    assert tiered
    for offer in tiered:
        assert offer.partners and offer.reroute


def test_offer_ids_are_unique_and_stable(seeded):
    first = build_offers("jupiter", "saturn", SITE, with_range=False)
    second = build_offers("jupiter", "saturn", SITE, with_range=False)
    assert len({o.id for o in first}) == len(first)
    assert [o.id for o in first] == [o.id for o in second]
    assert [o.price.monthly for o in first] == [o.price.monthly for o in second]


def test_latency_range_brackets_now(jupiter_saturn):
    for offer in jupiter_saturn:
        assert offer.latency_min <= offer.latency_now + 1e-6 <= offer.latency_max + 1e-6


def test_same_region_pairs_have_no_packages_or_diverse_plans(seeded):
    offers = build_offers("jupiter", "io", SITE, with_range=False)
    assert offers
    assert not [o for o in offers if o.kind == "package"]
    assert not [o for o in offers if o.tier in ("diverse-path", "contingency")]


def test_emergency_addon_is_offered_except_on_contingency(jupiter_saturn):
    for offer in jupiter_saturn:
        has = any(a["id"] == "emergency-priority" for a in offer.addons)
        assert has == (offer.tier != "contingency")


def test_competition_lowers_prices_at_busy_pairs_versus_the_edge(seeded):
    busy = [
        o for o in build_offers("earth", "mars", SITE, with_range=False) if o.tier == "standard"
    ]
    edge = [
        o for o in build_offers("eris", "dysnomia", SITE, with_range=False) if o.tier == "standard"
    ]
    assert busy and edge
    assert min(o.price.monthly for o in edge) > 0


def test_every_pair_of_worlds_prices_without_error(seeded):
    slugs = sorted(snapshot().worlds)
    for i, origin in enumerate(slugs):
        for destination in slugs[i + 1 :]:
            offers = build_offers(origin, destination, SITE, with_range=False)
            assert offers, (origin, destination)

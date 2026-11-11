import math
from datetime import UTC, date, datetime, timedelta

import pytest
from django.core.management import call_command

from apps.network import services
from apps.network.ephemeris import propagation_ms

SITE = date(2380, 6, 9)


@pytest.fixture
def built(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    call_command("build_network")
    services.clear_caches()


def test_positions_cover_every_node_and_moons_sit_near_their_parent(built):
    positions = services.node_positions(SITE)
    assert len(positions) == 47
    parent, moon = positions["c-jupiter"], positions["c-io"]
    assert 0 < math.dist(parent, moon) < 0.01  # Io is about 0.003 AU from Jupiter
    assert positions["h-jovian"] == positions["c-jupiter"]


def test_relays_are_off_the_ecliptic(built):
    positions = services.node_positions(SITE)
    assert all(abs(positions[r][2]) >= 0.5 for r in ("r-1", "r-2", "r-3", "r-4"))


def test_jupiter_saturn_distance_is_in_the_expected_range(built):
    # PLAN.md 2: the Jovian Run varies from about 4 to 15 AU over the year.
    distances = []
    for day in range(0, 365, 10):
        p = services.node_positions(SITE + timedelta(days=day))
        distances.append(math.dist(p["c-jupiter"], p["c-saturn"]))
    assert min(distances) > 3.5 and max(distances) < 15.5


def test_direct_latency_matches_distance(built):
    p = services.node_positions(SITE)
    d = math.dist(p["c-earth"], p["c-mars"])
    assert services.direct_latency_ms("earth", "mars", SITE) == pytest.approx(propagation_ms(d))


def test_latency_range_brackets_today(built):
    low, high = services.latency_range("jupiter", "saturn", frozenset({"jovian-subspace"}), SITE)
    route = services.route_for("jupiter", "saturn", frozenset({"jovian-subspace"}), SITE)
    assert route is not None
    assert low <= route.latency_ms <= high


def test_conjunction_window_found_for_earth_jupiter(built):
    window = services.conjunction_window("earth", "jupiter", SITE)
    assert window is not None
    start, end = window
    assert SITE - timedelta(days=60) <= start <= SITE + timedelta(days=420)
    assert start <= end
    # The segment really passes within 0.1 AU of the Sun on those dates.
    for day in (start, end):
        assert services.pair_degraded("earth", "jupiter", day)
    assert not services.pair_degraded("earth", "jupiter", start - timedelta(days=2))
    assert not services.pair_degraded("earth", "jupiter", end + timedelta(days=2))


def test_same_system_pairs_have_no_conjunction(built):
    assert services.conjunction_window("jupiter", "io", SITE) is None


def test_route_is_memoised(built):
    a = services.route_for("earth", "mars", frozenset({"ares-interplanetary"}), SITE)
    b = services.route_for("earth", "mars", frozenset({"ares-interplanetary"}), SITE)
    assert a is b
    assert [e.operator for e in a.edges] == ["ares-interplanetary"] * a.hops
    assert datetime(2380, 1, 1, tzinfo=UTC)

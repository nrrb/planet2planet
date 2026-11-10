import math
from datetime import UTC, datetime, timedelta

import pytest

from apps.network.ephemeris import (
    KM_PER_AU,
    Elements,
    days_since_j2000,
    heliocentric_position,
    moon_offset_au,
    propagation_ms,
    solve_kepler,
)

J2000 = datetime(2000, 1, 1, 12, tzinfo=UTC)
SITE = datetime(2380, 6, 9, 12, tzinfo=UTC)

EARTH = Elements(
    1.00000018, -3e-8, 0.01673163, -3.661e-5, 102.93005885, 0.3179526, 100.46691572, 35999.37306329
)
MARS = Elements(
    1.52371243, 9.7e-7, 0.09336511, 9.149e-5, -23.91744784, 0.45223625, -4.56813164, 19140.29934243
)
JUPITER = Elements(
    5.20248019,
    -2.864e-5,
    0.0485359,
    1.8026e-4,
    14.27495244,
    0.18199196,
    34.33479152,
    3034.90371757,
    b=-0.00012452,
    c=0.0606406,
    s=-0.35635438,
    f=38.35125,
)


def polar(p):
    return math.hypot(*p), math.degrees(math.atan2(p[1], p[0])) % 360


def test_days_since_j2000():
    assert days_since_j2000(J2000) == 0
    assert days_since_j2000(J2000 + timedelta(days=36525)) == pytest.approx(36525)


def test_kepler_solver_satisfies_the_equation():
    for e in (0.0, 0.2, 0.44, 0.9):
        for m in (-3.0, -1.0, 0.0, 0.5, 2.9):
            big_e = solve_kepler(m, e)
            assert big_e - e * math.sin(big_e) == pytest.approx(m, abs=1e-10)


def test_earth_at_j2000():
    # Sun's apparent longitude on 2000-01-01 was about 280.4 deg, so Earth is at about 100.4 deg
    # and 0.9833 AU from the Sun.
    r, lon = polar(heliocentric_position(EARTH, 0))
    assert r == pytest.approx(0.9833, abs=0.001)
    assert lon == pytest.approx(100.4, abs=0.3)


def test_jupiter_at_j2000_uses_outer_planet_terms():
    r, lon = polar(heliocentric_position(JUPITER, 0))
    assert r == pytest.approx(4.97, abs=0.02)
    assert lon == pytest.approx(36.3, abs=0.6)


def test_earth_mars_distance_stays_within_known_bounds_over_a_year():
    start = days_since_j2000(SITE)
    distances = []
    for day in range(0, 365, 5):
        e = heliocentric_position(EARTH, start + day)
        m = heliocentric_position(MARS, start + day)
        distances.append(math.dist(e, m))
    # Minimum possible is a - a(1-e) differences ~0.37 AU, maximum ~2.68 AU.
    assert min(distances) > 0.35
    assert max(distances) < 2.7


def test_planet_distance_matches_orbit_shape():
    for day in (0, 100, 200, 300):
        r = math.hypot(*heliocentric_position(MARS, days_since_j2000(SITE) + day))
        assert 1.38 < r < 1.67


def test_moon_offset_has_constant_radius_and_period():
    radius_km, period = 421_700.0, 1.769
    a = moon_offset_au(radius_km, period, 30.0, 0)
    assert math.hypot(*a) * KM_PER_AU == pytest.approx(radius_km)
    b = moon_offset_au(radius_km, period, 30.0, period)
    assert b == pytest.approx(a, abs=1e-9)


def test_propagation_delay_matches_canon_examples():
    # PLAN.md 3.7: Earth to Mars 5 to 24 ms; Earth to Eris about 650 ms.
    assert 3 < propagation_ms(0.37) < 4
    assert propagation_ms(2.68) == pytest.approx(25.7, abs=0.5)
    assert propagation_ms(67.8) == pytest.approx(650, rel=0.05)

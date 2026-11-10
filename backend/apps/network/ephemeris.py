"""Heliocentric positions from JPL approximate Keplerian elements, solved in 2D.

Latency and conjunction only need distances at the site date, so inclination is ignored: each body moves in
the ecliptic plane with its true longitude measured from the longitude of perihelion. The
error for strongly inclined dwarf planets is a few percent of their distance, which does not
matter for latency. Pure functions; no Django imports.
"""

import math
from dataclasses import dataclass
from datetime import UTC, datetime

AU_KM = 149_597_870.7
KM_PER_AU = AU_KM
LIGHT_KM_S = 299_792.458
J2000 = datetime(2000, 1, 1, 12, tzinfo=UTC)


@dataclass(frozen=True)
class Elements:
    """Elements at J2000 and their rates per Julian century (JPL Tables 2a and 2b)."""

    a: float
    a_rate: float
    e: float
    e_rate: float
    long_peri: float
    long_peri_rate: float
    mean_long: float
    mean_long_rate: float
    b: float | None = None
    c: float | None = None
    s: float | None = None
    f: float | None = None


def days_since_j2000(moment: datetime) -> float:
    return (moment - J2000).total_seconds() / 86400


def solve_kepler(mean_anomaly: float, e: float) -> float:
    """Solve E - e sin E = M (radians) by Newton's method."""
    m = (mean_anomaly + math.pi) % (2 * math.pi) - math.pi
    big_e = m + e * math.sin(m) if e < 0.8 else math.pi
    for _ in range(50):
        delta = (big_e - e * math.sin(big_e) - m) / (1 - e * math.cos(big_e))
        big_e -= delta
        if abs(delta) < 1e-13:
            break
    return big_e


def heliocentric_position(elements: Elements, days: float) -> tuple[float, float]:
    """Position in AU in the ecliptic plane, days after J2000."""
    t = days / 36525
    a = elements.a + elements.a_rate * t
    e = elements.e + elements.e_rate * t
    long_peri = elements.long_peri + elements.long_peri_rate * t
    mean_long = elements.mean_long + elements.mean_long_rate * t
    mean_anomaly = math.radians(mean_long - long_peri)
    if elements.b is not None:
        f = math.radians(elements.f * t)  # type: ignore[operator]
        mean_anomaly += math.radians(elements.b * t * t)
        mean_anomaly += math.radians(elements.c * math.cos(f) + elements.s * math.sin(f))  # type: ignore[operator]
    big_e = solve_kepler(mean_anomaly, e)
    x = a * (math.cos(big_e) - e)
    y = a * math.sqrt(1 - e * e) * math.sin(big_e)
    peri = math.radians(long_peri)
    return (
        x * math.cos(peri) - y * math.sin(peri),
        x * math.sin(peri) + y * math.cos(peri),
    )


def moon_offset_au(
    orbit_radius_km: float, period_days: float, phase_deg: float, days: float
) -> tuple[float, float]:
    """Circular orbit around the parent: a moon's offset in AU, days after J2000."""
    angle = math.radians(phase_deg) + 2 * math.pi * days / period_days
    radius = orbit_radius_km / AU_KM
    return radius * math.cos(angle), radius * math.sin(angle)


def propagation_ms(distance_au: float, speed_c: float = 52_000.0) -> float:
    """One-way subspace delay over a straight line."""
    return distance_au * AU_KM / (speed_c * LIGHT_KM_S) * 1000

"""The price formula (PLAN.md 6.3). Pure functions over a parameter mapping; no Django.

    segment cost  = base x throughput factor x class factor x provider positioning
    transit cost  = sum over backbone hops of per-hop rate x hop length factor
    handoff fees  = handoff fee x carrier changes (waived inside a corporate family)
    subtotal      = segments + transit + handoffs
    monthly price = subtotal x market x environment x resilience x family x term

Every step is a breakdown line. Lines are whole credits taken from rounded running totals, so
they always add up to the rounded price. All numbers are invented, not canon.
"""

import math
from collections.abc import Collection, Mapping
from dataclasses import dataclass, field

from .constants import TERM_DISCOUNTS

Params = Mapping[str, float]


@dataclass(frozen=True)
class Segment:
    label: str
    monthly_base: float
    throughput: int
    service_class: str
    positioning: float
    setup_fee: float = 0.0


@dataclass(frozen=True)
class Line:
    label: str
    credits: int


@dataclass(frozen=True)
class Price:
    monthly: int
    setup: int
    breakdown: tuple[Line, ...]
    terms: dict[str, int] = field(default_factory=dict)
    currency: str = "credits"


def throughput_factor(params: Params, throughput: int) -> float:
    return (throughput / params["throughput.reference"]) ** params["throughput.exponent"]


def competition_factor(params: Params, independent_carriers: int) -> float:
    """From the single-carrier premium down to the floor at five or more carriers."""
    high, low, floor_at = (
        params["competition.max"],
        params["competition.min"],
        params["competition.floor_at"],
    )
    carriers = min(max(independent_carriers, 1), floor_at)
    return high - (high - low) * (carriers - 1) / (floor_at - 1)


def market_size_factor(params: Params, populations: Collection[int | None]) -> float:
    """Driven by the smaller known population of the two ends (Earth's is not modelled)."""
    known = [p for p in populations if p is not None]
    if not known:
        return params["market.large_factor"]
    smallest = min(known)
    if smallest < params["market.tiny_population"]:
        return params["market.tiny_factor"]
    if smallest < params["market.small_population"]:
        return params["market.small_factor"]
    if smallest < params["market.mid_population"]:
        return params["market.mid_factor"]
    return params["market.large_factor"]


def segment_cost(params: Params, segment: Segment) -> float:
    return (
        segment.monthly_base
        * throughput_factor(params, segment.throughput)
        * params[f"class.{segment.service_class}"]
        * segment.positioning
    )


def hop_cost(params: Params, length_au: float) -> float:
    factor = 1 + params["transit.length_coefficient"] * math.log1p(length_au)
    return params["transit.per_hop_rate"] * factor


def price_offer(
    params: Params,
    *,
    segments: list[Segment],
    hop_lengths_au: list[float],
    handoffs: int,
    family: bool,
    lead_positioning: float,
    independent_carriers: int,
    populations: Collection[int | None],
    required_environments: Collection[str],
    tier: str,
    reroute: bool,
    contract_terms: Mapping[str, float] = TERM_DISCOUNTS,
) -> Price:
    steps: list[tuple[str, float]] = [(s.label, segment_cost(params, s)) for s in segments]
    if hop_lengths_au:
        transit = sum(hop_cost(params, length) for length in hop_lengths_au) * lead_positioning
        hops = len(hop_lengths_au)
        steps.append((f"Transit, {hops} backbone hop{'s' if hops != 1 else ''}", transit))
    if handoffs and not family:
        steps.append((f"Carrier handoffs ({handoffs})", params["handoff.fee"] * handoffs))

    multipliers: list[tuple[str, float]] = [
        (
            "Market adjustment",
            competition_factor(params, independent_carriers)
            * market_size_factor(params, populations),
        ),
    ]
    environments = sorted(set(required_environments))
    if environments:
        surcharge = sum(params[f"environment.{e}"] for e in environments)
        multipliers.append((f"Environment surcharge ({', '.join(environments)})", 1 + surcharge))
    resilience = params[f"resilience.{tier}"] + (params["resilience.reroute_fee"] if reroute else 0)
    if resilience != 1:
        label = f"Resilience: {tier.replace('-', ' ')}" + (" with rerouting" if reroute else "")
        multipliers.append((label, resilience))
    if family:
        multipliers.append(("Corporate family discount", 1 - params["family.discount"]))

    lines: list[Line] = []
    cumulative, previous = 0.0, 0
    for label, amount in steps:
        cumulative += amount
        lines.append(Line(label, round(cumulative) - previous))
        previous = round(cumulative)
    for label, factor in multipliers:
        cumulative *= factor
        if round(cumulative) - previous or label == "Market adjustment":
            lines.append(Line(label, round(cumulative) - previous))
            previous = round(cumulative)

    terms = {term: round(cumulative * multiplier) for term, multiplier in contract_terms.items()}
    setup = round(sum(s.setup_fee * s.positioning for s in segments))
    return Price(monthly=round(cumulative), setup=setup, breakdown=tuple(lines), terms=terms)

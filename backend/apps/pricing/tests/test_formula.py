import pytest

from apps.pricing.constants import DEFAULT_PARAMETERS
from apps.pricing.formula import (
    Segment,
    competition_factor,
    market_size_factor,
    price_offer,
    throughput_factor,
)

PARAMS = {key: value for key, (value, _) in DEFAULT_PARAMETERS.items()}


def quote(**overrides):
    args = {
        "segments": [Segment("Transit Shared", 400, 10, "shared", 1.0)],
        "hop_lengths_au": [4.0],
        "handoffs": 0,
        "family": False,
        "lead_positioning": 1.0,
        "independent_carriers": 3,
        "populations": [50_000, 2_000_000],
        "required_environments": set(),
        "tier": "standard",
        "reroute": False,
    }
    return price_offer(PARAMS, **{**args, **overrides})


def test_breakdown_lines_add_up_to_the_total():
    for case in (
        {},
        {"handoffs": 2},
        {"family": True, "handoffs": 2},
        {
            "required_environments": {"radiation", "cryogenic"},
            "tier": "contingency",
            "reroute": True,
        },
        {
            "segments": [
                Segment("A", 120, 4, "shared", 0.93),
                Segment("T", 420, 40, "synchronized", 1.1),
            ]
        },
    ):
        price = quote(**case)
        assert sum(line.credits for line in price.breakdown) == price.monthly


def test_prices_are_whole_credits_and_deterministic():
    a, b = quote(), quote()
    assert a == b
    assert isinstance(a.monthly, int) and all(isinstance(line.credits, int) for line in a.breakdown)


def test_price_falls_as_competition_rises():
    prices = [quote(independent_carriers=n).monthly for n in (1, 2, 3, 4, 5, 8)]
    assert prices == sorted(prices, reverse=True)
    assert prices[-1] == prices[-2]  # floor at five carriers


def test_competition_factor_endpoints():
    assert competition_factor(PARAMS, 1) == pytest.approx(1.35)
    assert competition_factor(PARAMS, 5) == pytest.approx(0.85)
    assert competition_factor(PARAMS, 9) == pytest.approx(0.85)
    assert competition_factor(PARAMS, 0) == pytest.approx(1.35)


def test_smaller_markets_cost_more():
    assert market_size_factor(PARAMS, [5_000, 50_000_000]) > market_size_factor(
        PARAMS, [5_000_000, 50_000_000]
    )
    assert market_size_factor(PARAMS, [None, 50_000]) == market_size_factor(PARAMS, [50_000])
    assert market_size_factor(PARAMS, [None, None]) == PARAMS["market.large_factor"]


def test_handoff_fees_are_waived_inside_a_family_and_a_discount_applies():
    paid = quote(handoffs=2)
    family = quote(handoffs=2, family=True)
    assert any("handoff" in line.label.lower() for line in paid.breakdown)
    assert not any("handoff" in line.label.lower() for line in family.breakdown)
    assert any("family" in line.label.lower() for line in family.breakdown)
    assert family.monthly < paid.monthly


def test_environment_surcharges_apply_only_where_required_and_once():
    none = quote()
    radiation = quote(required_environments={"radiation"})
    both = quote(required_environments={"radiation", "cryogenic"})
    assert not any("environment" in line.label.lower() for line in none.breakdown)
    assert none.monthly < radiation.monthly < both.monthly


def test_resilience_tiers_and_reroute_fee():
    base = quote().monthly
    contingency = quote(tier="contingency").monthly
    rerouted = quote(tier="diverse-path", reroute=True).monthly
    plain_diverse = quote(tier="diverse-path").monthly
    assert base < plain_diverse < rerouted < contingency


def test_term_discounts():
    price = quote()
    terms = price.terms
    assert terms["monthly"] == price.monthly
    assert terms["3-year"] < terms["1-year"] < terms["monthly"]


def test_throughput_factor():
    assert throughput_factor(PARAMS, 10) == 1.0
    assert throughput_factor(PARAMS, 40) == pytest.approx(2.0)


def test_service_class_raises_the_price():
    shared = quote().monthly
    dedicated = quote(segments=[Segment("T", 400, 10, "dedicated", 1.0)]).monthly
    synchronized = quote(segments=[Segment("T", 400, 10, "synchronized", 1.0)]).monthly
    assert shared < dedicated < synchronized


def test_setup_fee_sums_segments_with_positioning():
    price = quote(
        segments=[
            Segment("A", 100, 10, "shared", 1.0, setup_fee=100),
            Segment("B", 100, 10, "shared", 1.1, setup_fee=200),
        ]
    )
    assert price.setup == 320

import math

import pytest

from apps.network.ephemeris import propagation_ms
from apps.network.routing import (
    HANDOFF_MS,
    SUN_THRESHOLD_AU,
    Edge,
    diverse_path,
    segment_sun_clearance,
    shortest_path,
)

# A line of nodes on the x axis, 1 AU apart, away from the Sun, with a detour node.
POS = {
    "a": (1.0, 0.0, 0.0),
    "b": (2.0, 0.0, 0.0),
    "c": (3.0, 0.0, 0.0),
    "d": (4.0, 0.0, 0.0),
    "x": (2.5, 1.0, 0.0),
}


def edge(slug, a, b, operator, layer="backbone", ms=1.0):
    return Edge(slug=slug, layer=layer, a=a, b=b, operator=operator, processing_ms=ms)


def test_shortest_path_prefers_lower_latency_and_is_undirected():
    edges = [
        edge("ab", "a", "b", "p"),
        edge("bc", "b", "c", "p"),
        edge("cd", "c", "d", "p"),
        edge("ax", "a", "x", "p"),
        edge("xd", "x", "d", "p"),
    ]
    route = shortest_path(edges, POS, "d", "a", {"p"})
    assert route is not None
    # Reverse direction works; straight line a-b-c-d (3 AU, 3 hops) beats the detour.
    assert [e.slug for e in route.edges] == ["cd", "bc", "ab"]
    assert route.hops == 3
    assert route.handoffs == 0
    expected = propagation_ms(3.0) + 3 * 1.0
    assert route.latency_ms == pytest.approx(expected)


def test_latency_includes_handoffs_when_the_carrier_changes():
    edges = [edge("ab", "a", "b", "p"), edge("bc", "b", "c", "q")]
    route = shortest_path(edges, POS, "a", "c", {"p", "q"})
    assert route.handoffs == 1
    assert route.latency_ms == pytest.approx(propagation_ms(2.0) + 2.0 + HANDOFF_MS)


def test_route_never_uses_a_carrier_outside_the_allowed_set():
    edges = [edge("ab", "a", "b", "p"), edge("bc", "b", "c", "q"), edge("bc2", "b", "c", "r")]
    route = shortest_path(edges, POS, "a", "c", {"p", "r"})
    assert {e.operator for e in route.edges} == {"p", "r"}
    assert shortest_path(edges, POS, "a", "c", {"p"}) is None


def test_an_extra_handoff_is_worth_it_only_if_cheaper():
    # q's direct link has a big processing delay, so p then r with a handoff wins or loses
    # on the numbers, not on the handoff count.
    edges = [
        edge("ac_q", "a", "c", "q", ms=50.0),
        edge("ab_p", "a", "b", "p"),
        edge("bc_r", "b", "c", "r"),
    ]
    route = shortest_path(edges, POS, "a", "c", {"p", "q", "r"})
    assert [e.slug for e in route.edges] == ["ab_p", "bc_r"]


def test_no_route_returns_none():
    assert shortest_path([edge("ab", "a", "b", "p")], POS, "a", "d", {"p"}) is None


def test_sun_clearance():
    assert segment_sun_clearance((-1, 0, 0), (1, 0, 0)) == pytest.approx(0)
    assert segment_sun_clearance((-1, 1, 0), (1, 1, 0)) == pytest.approx(1)
    assert segment_sun_clearance((2, 0, 0), (5, 0, 0)) == pytest.approx(2)
    assert segment_sun_clearance((-1, 0, 0), (0, 0, 0.5)) == pytest.approx(0.4472, abs=1e-3)


def test_conjunction_threshold_is_point_one_au():
    assert SUN_THRESHOLD_AU == 0.1
    inside = ((-5, 0.09, 0), (5, 0.09, 0))
    outside = ((-5, 0.11, 0), (5, 0.11, 0))
    assert segment_sun_clearance(*inside) < SUN_THRESHOLD_AU
    assert segment_sun_clearance(*outside) > SUN_THRESHOLD_AU


def test_reroute_avoids_degraded_links_and_plain_route_flags_them():
    pos = {
        "e": (-1.0, 0.0, 0.0),
        "j": (5.0, 0.0, 0.0),  # straight line passes through the Sun
        "r": (0.0, 0.0, 0.5),
    }
    edges = [
        edge("direct", "e", "j", "p"),
        edge("e_r", "e", "r", "p", layer="conjunction"),
        edge("r_j", "r", "j", "p", layer="conjunction"),
    ]
    plain = shortest_path(edges, pos, "e", "j", {"p"})
    assert [e.slug for e in plain.edges] == ["direct"]
    assert plain.degraded == ["direct"]

    rerouted = shortest_path(edges, pos, "e", "j", {"p"}, reroute=True)
    assert [e.slug for e in rerouted.edges] == ["e_r", "r_j"]
    assert rerouted.degraded == []
    assert rerouted.latency_ms > plain.latency_ms


def test_conjunction_links_are_only_used_when_rerouting():
    pos = {"e": (1.0, 0.0, 0.0), "j": (5.0, 0.0, 0.0), "r": (3.0, 0.0, 1.0)}
    edges = [
        edge("direct", "e", "j", "p", ms=100.0),
        edge("e_r", "e", "r", "p", layer="conjunction"),
        edge("r_j", "r", "j", "p", layer="conjunction"),
    ]
    assert [e.slug for e in shortest_path(edges, pos, "e", "j", {"p"}).edges] == ["direct"]


def test_diverse_path_shares_no_intermediate_hub_and_uses_another_backbone():
    pos = {
        "o": (1, 0, 0),
        "h1": (2, 0, 0),
        "h2": (3, 0, 0),
        "h3": (2, 1, 0),
        "h4": (3, 1, 0),
        "d": (4, 0, 0),
    }
    edges = [
        edge("o_h1", "o", "h1", "p"),
        edge("h1_h2", "h1", "h2", "p"),
        edge("h2_d", "h2", "d", "p"),
        edge("o_h3", "o", "h3", "q"),
        edge("h3_h4", "h3", "h4", "q"),
        edge("h4_d", "h4", "d", "q"),
        edge("h1_d", "h1", "d", "q"),  # a shortcut through h1 that must not be used
    ]
    first, second = diverse_path(edges, pos, "o", "d", {"p", "q"}, hubs={"h1", "h2", "h3", "h4"})
    assert {e.operator for e in first.edges} == {"p"}
    interior = lambda r: {n for e in r.edges for n in (e.a, e.b)} - {"o", "d"}  # noqa: E731
    assert not interior(first) & interior(second)
    assert {e.operator for e in second.edges} == {"q"}
    assert second.edges[-1].slug == "h4_d"


def test_diverse_path_is_none_when_no_second_path_exists():
    pos = {"o": (1, 0, 0), "h": (2, 0, 0), "d": (3, 0, 0)}
    edges = [edge("o_h", "o", "h", "p"), edge("h_d", "h", "d", "p")]
    first, second = diverse_path(edges, pos, "o", "d", {"p"}, hubs={"h"})
    assert first is not None and second is None
    assert math.isfinite(first.latency_ms)

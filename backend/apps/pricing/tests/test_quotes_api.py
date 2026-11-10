import pytest
from django.core.management import call_command

from apps.network import services
from apps.pricing import offers


@pytest.fixture
def seeded(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    call_command("build_network")
    call_command("generate_plans")
    services.clear_caches()
    offers.clear_caches()


def get(client, query):
    return client.get(f"/api/quotes/?{query}")


def test_default_quote_has_a_route_summary_and_offers(client, seeded):
    body = get(client, "from=jupiter&to=saturn").json()
    route = body["route"]
    assert route["from"] == "jupiter" and route["to"] == "saturn"
    assert route["date"] == "2380-06-09" and route["stardate"] == "57436.2"
    assert route["regions"] == ["jovian", "saturnian"]
    assert route["distanceKm"] > 0
    assert route["latencyMs"]["min"] <= route["latencyMs"]["direct"] <= route["latencyMs"]["max"]
    assert route["independentCarriers"] >= 4
    assert route["providers"] >= 7
    assert set(route["conjunction"]) == {"activeNow", "nextStart", "nextEnd"}
    assert len(body["offers"]) > 20


def test_offer_shape(client, seeded):
    offer = get(client, "from=jupiter&to=saturn").json()["offers"][0]
    for key in (
        "id",
        "title",
        "leadCompanyId",
        "ownerId",
        "serviceClass",
        "throughput",
        "resilienceTier",
        "conjunction",
        "environments",
        "sectors",
        "hops",
        "handoffs",
        "onNetworkShare",
        "latencyMs",
        "price",
        "segments",
        "badges",
        "addons",
        "kind",
    ):
        assert key in offer, key
    assert offer["id"].startswith("of_")
    assert set(offer["latencyMs"]) == {"now", "min", "max"}
    assert offer["price"]["currency"] == "credits"
    assert sum(line["credits"] for line in offer["price"]["breakdown"]) == offer["price"]["monthly"]
    segment = offer["segments"][0]
    assert {"companyId", "layer", "nodeIds", "linkIds"} <= set(segment)


def test_default_sort_is_price_ascending(client, seeded):
    prices = [o["price"]["monthly"] for o in get(client, "from=jupiter&to=saturn").json()["offers"]]
    assert prices == sorted(prices)


@pytest.mark.parametrize(
    ("sort", "key"),
    [
        ("latency", lambda o: o["latencyMs"]["now"]),
        ("worst-latency", lambda o: o["latencyMs"]["max"]),
    ],
)
def test_sort_orders(client, seeded, sort, key):
    offers_ = get(client, f"from=jupiter&to=saturn&sort={sort}").json()["offers"]
    values = [key(o) for o in offers_]
    assert values == sorted(values)


def test_sort_by_tier_puts_most_resilient_first(client, seeded):
    tiers = [
        o["resilienceTier"]
        for o in get(client, "from=jupiter&to=saturn&sort=tier").json()["offers"]
    ]
    assert tiers[0] == "contingency"


def test_filters(client, seeded):
    body = get(client, "from=jupiter&to=saturn&class=dedicated&tier=standard").json()
    assert body["offers"]
    assert {o["serviceClass"] for o in body["offers"]} == {"dedicated"}
    assert {o["resilienceTier"] for o in body["offers"]} == {"standard"}

    multi = get(client, "from=jupiter&to=saturn&class=shared,synchronized").json()["offers"]
    assert {o["serviceClass"] for o in multi} == {"shared", "synchronized"}

    kinds = get(client, "from=jupiter&to=saturn&kind=specialist").json()["offers"]
    assert kinds and all(o["kind"] in ("end-to-end",) for o in kinds)

    company = get(client, "from=jupiter&to=saturn&company=cassini-link").json()["offers"]
    assert company and all("cassini-link" in o["partnerIds"] for o in company)

    rerouted = get(client, "from=jupiter&to=saturn&reroute=true").json()["offers"]
    assert rerouted and all(o["conjunction"] == "rerouted" for o in rerouted)

    env = get(client, "from=jupiter&to=saturn&env=gas-giant-orbit").json()["offers"]
    assert env and all("gas-giant-orbit" in o["environments"] for o in env)


def test_max_latency_filter(client, seeded):
    body = get(client, "from=jupiter&to=saturn&maxLatencyMs=74").json()["offers"]
    assert body and all(o["latencyMs"]["now"] <= 74 for o in body)
    assert get(client, "from=jupiter&to=saturn&maxLatencyMs=1").json()["offers"] == []


def test_badges_mark_the_best_offers(client, seeded):
    offers_ = get(client, "from=jupiter&to=saturn").json()["offers"]
    cheapest = min(offers_, key=lambda o: o["price"]["monthly"])
    assert "lowest-price" in cheapest["badges"]
    fastest = min(offers_, key=lambda o: o["latencyMs"]["now"])
    assert "lowest-latency" in fastest["badges"]
    assert any("most-resilient" in o["badges"] for o in offers_)
    assert [b for o in offers_ for b in o["badges"]].count("lowest-price") == 1


def test_swapping_the_pair_gives_the_same_offers(client, seeded):
    a = get(client, "from=jupiter&to=saturn").json()["offers"]
    b = get(client, "from=saturn&to=jupiter").json()["offers"]
    assert sorted(o["title"] for o in a) == sorted(o["title"] for o in b)


@pytest.mark.parametrize(
    ("query", "field"),
    [
        ("to=saturn", "from"),
        ("from=jupiter", "to"),
        ("from=jupiter&to=jupiter", "to"),
        ("from=vulcan&to=saturn", "from"),
        ("from=jupiter&to=saturn&sort=nonsense", "sort"),
        ("from=jupiter&to=saturn&class=ultra", "class"),
        ("from=jupiter&to=saturn&sector=magic", "sector"),
        ("from=jupiter&to=saturn&tier=gold", "tier"),
        ("from=jupiter&to=saturn&kind=wizard", "kind"),
        ("from=jupiter&to=saturn&company=nobody", "company"),
        ("from=jupiter&to=saturn&env=lava", "env"),
        ("from=jupiter&to=saturn&maxLatencyMs=abc", "maxLatencyMs"),
        ("from=jupiter&to=saturn&maxLatencyMs=-5", "maxLatencyMs"),
        ("from=jupiter&to=saturn&maxLatencyMs=999999999", "maxLatencyMs"),
        ("from=jupiter&to=saturn&reroute=maybe", "reroute"),
    ],
)
def test_validation_returns_400_naming_the_field(client, seeded, query, field):
    response = get(client, query)
    assert response.status_code == 400
    assert field in response.json()


def test_unknown_parameters_are_rejected(client, seeded):
    response = get(client, "from=jupiter&to=saturn&colour=red")
    assert response.status_code == 400
    assert "colour" in response.json()


def test_worlds_without_a_constellation_by_the_site_date_are_rejected(client, seeded):
    from apps.catalog.models import World

    World.objects.filter(pk="eris").update(subspace_since=2400)
    assert get(client, "from=eris&to=saturn").status_code == 400
    World.objects.filter(pk="eris").update(subspace_since=2219)


def test_responses_are_cacheable(client, seeded):
    response = get(client, "from=jupiter&to=saturn")
    assert "max-age" in response["Cache-Control"]

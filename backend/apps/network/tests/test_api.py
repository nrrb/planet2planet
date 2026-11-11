import pytest
from django.core.management import call_command

from apps.network import services


@pytest.fixture
def built(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    call_command("build_network")
    services.clear_caches()


def test_network_returns_nodes_links_and_orbits(client, built):
    body = client.get("/api/network/").json()
    assert body["siteDate"] == "2380-06-09"
    assert len(body["nodes"]) == 47
    assert len(body["links"]) == 589
    assert len(body["orbits"]) == 33
    relay = next(n for n in body["nodes"] if n["id"] == "r-1")
    assert len(relay["fixedPosition"]) == 3
    assert next(n for n in body["nodes"] if n["id"] == "c-mars")["fixedPosition"] is None


def test_orbits_carry_what_the_client_needs_to_solve_kepler(client, built):
    orbits = client.get("/api/network/").json()["orbits"]
    jupiter = orbits["jupiter"]
    assert jupiter["kind"] == "heliocentric"
    assert jupiter["semiMajorAxisAu"] == pytest.approx(5.2, abs=0.01)
    assert jupiter["b"] is not None
    io = orbits["io"]
    assert io["kind"] == "moon"
    assert io["parent"] == "jupiter" and io["orbitRadiusKm"] > 0 and 0 <= io["phaseDeg"] < 360


def test_links_flag_degradation_at_the_site_date(client, built):
    links = client.get("/api/network/?layer=conjunction").json()["links"]
    assert links and {link["layer"] for link in links} == {"conjunction"}
    assert all(isinstance(link["degraded"], bool) for link in links)


def test_filter_by_company_and_region(client, built):
    links = client.get("/api/network/?company=cassini-link").json()["links"]
    assert links and {link["operator"] for link in links} == {"cassini-link"}
    body = client.get("/api/network/?region=jovian").json()
    region_of = {n["id"]: n["region"] for n in body["nodes"]}
    assert body["links"]
    assert all("jovian" in (region_of[l["a"]], region_of[l["b"]]) for l in body["links"])  # noqa: E741
    assert any(l["layer"] == "mesh" for l in body["links"])  # noqa: E741


def test_bad_filters_are_rejected(client, built):
    assert client.get("/api/network/?layer=nonsense").status_code == 400
    assert client.get("/api/network/?company=nobody").status_code == 400
    assert client.get("/api/network/?region=nowhere").status_code == 400
    assert client.get("/api/network/?colour=red").status_code == 400


def test_query_count_is_bounded(client, built, django_assert_max_num_queries):
    client.get("/api/network/")  # warm the process cache
    with django_assert_max_num_queries(6):
        assert client.get("/api/network/").status_code == 200

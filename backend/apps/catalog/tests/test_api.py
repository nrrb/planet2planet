import pytest
from django.core.management import call_command


@pytest.fixture
def loaded(db):
    call_command("load_dataset")


def test_meta_has_site_date_and_speed(client, loaded):
    body = client.get("/api/meta/").json()
    assert body["siteDate"] == "2380-06-09"
    assert body["stardate"] == "57436.2"
    assert body["subspaceSpeedC"] == pytest.approx(52000, rel=0.01)
    assert body["sources"]


def test_worlds_list_flags_eligibility(client, loaded):
    worlds = {w["id"]: w for w in client.get("/api/worlds/").json()}
    assert len(worlds) == 33
    assert worlds["io"]["parent"] == "jupiter"
    assert worlds["earth"]["eligible"] is True
    assert worlds["earth"]["radiusKm"] == pytest.approx(6371, rel=0.01)
    assert all(isinstance(w["eligible"], bool) for w in worlds.values())


def test_world_detail_includes_canon_notes_and_history(client, loaded):
    body = client.get("/api/worlds/mars/").json()
    assert body["canonNotes"]
    assert body["populationHistory"]
    assert body["radiusKm"] > 0


def test_world_detail_has_the_subspace_delay_to_earth(client, loaded):
    mars = client.get("/api/worlds/mars/").json()
    assert mars["subspaceLatencyToEarthMs"]["min"] == pytest.approx(5.03, abs=0.01)
    assert mars["subspaceLatencyToEarthMs"]["max"] == pytest.approx(24.22, abs=0.01)
    assert mars["solarConjunctionWithEarthEveryDays"] == 780
    moon = client.get("/api/worlds/moon/").json()
    assert moon["subspaceLatencyToEarthMs"]["min"] == pytest.approx(0.0247, abs=1e-4)
    assert moon["solarConjunctionWithEarthEveryDays"] is None
    eris = client.get("/api/worlds/eris/").json()
    assert (
        640
        < eris["subspaceLatencyToEarthMs"]["min"]
        < eris["subspaceLatencyToEarthMs"]["max"]
        < 662
    )


def test_unknown_world_is_404(client, loaded):
    assert client.get("/api/worlds/vulcan/").status_code == 404


def test_regions_list_worlds_in_order(client, loaded):
    regions = client.get("/api/regions/").json()
    assert [r["order"] for r in regions] == sorted(r["order"] for r in regions)
    assert sum(len(r["worldIds"]) for r in regions) == 33


def test_companies_filter_by_kind_and_world(client, loaded):
    backbones = client.get("/api/companies/?kind=backbone").json()
    assert backbones and {c["kind"] for c in backbones} == {"backbone"}
    at_saturn = client.get("/api/companies/?world=saturn").json()
    assert at_saturn and all("saturn" in c["worldIds"] for c in at_saturn)


def test_companies_reject_bad_filters(client, loaded):
    assert client.get("/api/companies/?kind=nonsense").status_code == 400
    assert client.get("/api/companies/?colour=red").status_code == 400


def test_history_is_in_year_order_and_filterable(client, loaded):
    events = client.get("/api/history/").json()
    assert len(events) == 140
    assert [e["year"] for e in events] == sorted(e["year"] for e in events)
    colonized = client.get("/api/history/?type=colonized").json()
    assert colonized and {e["type"] for e in colonized} == {"colonized"}
    assert client.get("/api/history/?type=nonsense").status_code == 400


@pytest.mark.parametrize(
    "path",
    [
        "/api/meta/",
        "/api/worlds/",
        "/api/worlds/mars/",
        "/api/regions/",
        "/api/companies/",
        "/api/history/",
    ],
)
def test_query_counts_are_bounded(client, loaded, django_assert_max_num_queries, path):
    with django_assert_max_num_queries(5):
        assert client.get(path).status_code == 200

import pytest
from django.core.management import call_command


@pytest.fixture
def loaded(db):
    call_command("load_dataset")
    call_command("load_canon_facts")
    call_command("load_simulation")


def test_facts_come_with_episodes_sources_and_the_simulated_result(client, loaded):
    facts = client.get("/api/canon/facts/").json()
    assert len(facts) == 22
    start = next(f for f in facts if f["id"] == "subspace-radio-2151")
    assert start["category"] == "starting-condition" and start["standing"] == "on-screen"
    assert "ENT: Fortunate Son" in start["episodes"]
    assert start["source"]["url"].startswith("https://")
    assert start["deadline"] is None

    titan = next(f for f in facts if f["id"] == "titan-mine")
    assert titan["deadline"]["year"] == 2259 and titan["deadline"]["event"] == "colonized"
    assert titan["deadline"]["shareMet"] == 1.0
    assert titan["deadline"]["medianResult"] == 2190


def test_facts_can_be_filtered_by_category(client, loaded):
    for category, count in (("starting-condition", 10), ("deadline", 6), ("set-aside", 6)):
        body = client.get(f"/api/canon/facts/?category={category}").json()
        assert len(body) == count and {f["category"] for f in body} == {category}
    assert client.get("/api/canon/facts/?category=rumour").status_code == 400
    assert client.get("/api/canon/facts/?colour=red").status_code == 400


def test_every_deadline_is_met_in_every_run(client, loaded):
    deadlines = client.get("/api/canon/facts/?category=deadline").json()
    assert all(d["deadline"]["shareMet"] == 1.0 for d in deadlines)


def test_simulation_summary_names_seeds_commit_and_market(client, loaded):
    body = client.get("/api/simulation/").json()
    run = body["run"]
    assert (run["firstSeed"], run["runCount"], run["canonicalSeed"]) == (1000, 400, 1701)
    assert len(run["scriptCommit"]) == 40
    metrics = {m["metric"] for m in body["market"]}
    assert {"companies-founded", "brands-trading", "companies-bought", "brands-by-kind"} <= metrics
    trading = next(m for m in body["market"] if m["metric"] == "brands-trading")
    assert trading["p10"] <= trading["median"] <= trading["p90"]


def test_world_statistics_give_medians_and_percentiles_without_samples(client, loaded):
    rows = client.get("/api/simulation/worlds/?metric=colonized").json()
    assert len(rows) >= 30
    for row in rows:
        assert row["metric"] == "colonized" and "samples" not in row
        if row["median"] is not None:
            assert row["p10"] <= row["median"] <= row["p90"]
    titan = next(r for r in rows if r["world"] == "titan")
    assert titan["median"] == 2190 and titan["shareOfRuns"] == 1.0


def test_each_row_carries_the_canonical_run_value_for_comparison(client, loaded):
    rows = client.get("/api/simulation/worlds/?metric=colonized&world=titan").json()
    # Titan in seed 1701, the run the shop uses, from the dataset itself.
    assert rows[0]["canonical"] == 2187


def test_samples_are_returned_only_for_a_single_named_world(client, loaded):
    one = client.get("/api/simulation/worlds/?metric=colonized&world=titan&samples=true").json()
    assert len(one) == 1 and len(one[0]["samples"]) == 400
    assert one[0]["samples"] == sorted(one[0]["samples"])
    assert client.get("/api/simulation/worlds/?metric=colonized&samples=true").status_code == 400
    assert (
        "samples"
        not in client.get("/api/simulation/worlds/?metric=colonized&world=titan").json()[0]
    )


@pytest.mark.parametrize(
    "query",
    [
        "metric=nonsense",
        "world=vulcan",
        "samples=maybe",
        "bogus=1",
        "metric=colonized&world=titan&samples=1",
    ],
)
def test_bad_parameters_are_rejected(client, loaded, query):
    assert client.get(f"/api/simulation/worlds/?{query}").status_code == 400


@pytest.mark.parametrize(
    "path", ["/api/canon/facts/", "/api/simulation/", "/api/simulation/worlds/?metric=colonized"]
)
def test_query_counts_are_bounded(client, loaded, django_assert_max_num_queries, path):
    with django_assert_max_num_queries(6):
        assert client.get(path).status_code == 200

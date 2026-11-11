import json
from pathlib import Path

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.canon.models import (
    CanonFact,
    DeadlineResult,
    MarketStatistic,
    SimulationRun,
    WorldStatistic,
)
from apps.catalog.models import DatasetMeta, Source

DATA = Path(__file__).resolve().parents[3] / "data"


@pytest.fixture
def facts_file() -> dict:
    return json.loads((DATA / "canon-facts.json").read_text())


@pytest.fixture
def simulation_file() -> dict:
    return json.loads((DATA / "sol-montecarlo-2380.json").read_text())


@pytest.fixture
def loaded(db):
    call_command("load_dataset")
    call_command("load_canon_facts")
    call_command("load_simulation")


def write(tmp_path: Path, name: str, data: dict) -> str:
    path = tmp_path / name
    path.write_text(json.dumps(data))
    return str(path)


# --- canon facts -------------------------------------------------------------------


@pytest.mark.django_db
def test_load_canon_facts_creates_the_three_categories(facts_file):
    call_command("load_dataset")
    call_command("load_canon_facts")
    counts = {
        c: CanonFact.objects.filter(category=c).count()
        for c in ("starting-condition", "deadline", "set-aside")
    }
    assert counts == {"starting-condition": 10, "deadline": 6, "set-aside": 6}
    assert CanonFact.objects.count() == len(facts_file["facts"])


@pytest.mark.django_db
def test_every_fact_has_a_source_that_exists():
    call_command("load_dataset")
    call_command("load_canon_facts")
    assert not CanonFact.objects.filter(source__isnull=True).exists()
    assert Source.objects.filter(pk="ma-io").exists()  # added by the facts file


@pytest.mark.django_db
def test_a_fact_without_a_source_is_rejected_and_nothing_is_saved(facts_file, tmp_path):
    call_command("load_dataset")
    del facts_file["facts"][3]["source"]
    with pytest.raises(CommandError, match="source"):
        call_command("load_canon_facts", file=write(tmp_path, "f.json", facts_file))
    assert CanonFact.objects.count() == 0


@pytest.mark.django_db
def test_a_fact_with_an_unknown_source_is_rejected(facts_file, tmp_path):
    call_command("load_dataset")
    facts_file["facts"][0]["source"] = "no-such-source"
    with pytest.raises(CommandError, match="no-such-source"):
        call_command("load_canon_facts", file=write(tmp_path, "f.json", facts_file))


@pytest.mark.django_db
def test_unknown_category_standing_and_schema_are_rejected(facts_file, tmp_path):
    call_command("load_dataset")
    bad = json.loads(json.dumps(facts_file))
    bad["facts"][0]["category"] = "rumour"
    with pytest.raises(CommandError, match="category"):
        call_command("load_canon_facts", file=write(tmp_path, "a.json", bad))
    bad = json.loads(json.dumps(facts_file))
    bad["facts"][0]["standing"] = "hearsay"
    with pytest.raises(CommandError, match="standing"):
        call_command("load_canon_facts", file=write(tmp_path, "b.json", bad))
    bad = json.loads(json.dumps(facts_file))
    bad["schemaVersion"] = "9.9.9"
    with pytest.raises(CommandError, match="schemaVersion"):
        call_command("load_canon_facts", file=write(tmp_path, "c.json", bad))


@pytest.mark.django_db
def test_load_canon_facts_is_idempotent_and_removes_stale_facts(facts_file, tmp_path):
    call_command("load_dataset")
    call_command("load_canon_facts")
    count = CanonFact.objects.count()
    call_command("load_canon_facts")
    assert CanonFact.objects.count() == count
    facts_file["facts"] = facts_file["facts"][:-1]
    call_command("load_canon_facts", file=write(tmp_path, "f.json", facts_file))
    assert CanonFact.objects.count() == count - 1


@pytest.mark.django_db
def test_deadline_facts_carry_their_deadline():
    call_command("load_dataset")
    call_command("load_canon_facts")
    moon = CanonFact.objects.get(slug="moon-fifty-million")
    assert (moon.deadline_event, moon.deadline_year, moon.deadline_threshold) == (
        "population",
        2373,
        50_000_000,
    )
    assert moon.world_id == "moon"


# --- simulation ----------------------------------------------------------------------


def test_the_data_files_come_from_the_same_script_commit(facts_file, simulation_file):
    dataset = json.loads((DATA / "sol-telecom-2380.json").read_text())
    assert dataset["meta"]["scriptCommit"] == simulation_file["run"]["scriptCommit"]
    assert dataset["schemaVersion"] == simulation_file["schemaVersion"]


def test_load_simulation_stores_statistics_deadlines_and_market(loaded):
    run = SimulationRun.objects.get(kind="monte-carlo")
    assert (run.first_seed, run.run_count, run.start_year, run.end_year) == (1000, 400, 2151, 2380)
    assert run.script_commit == DatasetMeta.objects.get().script_commit
    assert SimulationRun.objects.get(kind="canonical").first_seed == 1701
    assert WorldStatistic.objects.filter(run=run, world_id="titan", metric="colonized").exists()
    assert DeadlineResult.objects.count() == 6
    assert MarketStatistic.objects.filter(run=run, metric="brands-trading").exists()
    assert MarketStatistic.objects.filter(run=run, metric="brands-by-kind").count() >= 4


def test_percentiles_are_ordered_for_every_world_and_metric(loaded):
    for stat in WorldStatistic.objects.exclude(median=None):
        assert stat.p10 <= stat.median <= stat.p90, (stat.world_id, stat.metric)


def test_samples_match_the_share_of_runs_that_reached_it(loaded):
    run = SimulationRun.objects.get(kind="monte-carlo")
    for stat in WorldStatistic.objects.filter(run=run):
        assert len(stat.samples) == round(stat.share_of_runs * run.run_count)
        assert stat.samples == sorted(stat.samples)


def test_every_deadline_fact_has_a_result(loaded):
    deadlines = CanonFact.objects.filter(category="deadline")
    assert deadlines.count() == 6
    assert all(DeadlineResult.objects.filter(canon_fact=f).exists() for f in deadlines)
    titan = DeadlineResult.objects.get(canon_fact__slug="titan-mine")
    assert titan.share_met == 1.0 and titan.median_result == 2190


@pytest.mark.django_db
def test_mismatched_script_commits_are_rejected(simulation_file, tmp_path):
    call_command("load_dataset")
    call_command("load_canon_facts")
    simulation_file["run"]["scriptCommit"] = "0" * 40
    with pytest.raises(CommandError, match="commit"):
        call_command("load_simulation", file=write(tmp_path, "s.json", simulation_file))
    assert SimulationRun.objects.count() == 0


@pytest.mark.django_db
def test_load_simulation_needs_the_dataset_and_the_facts_first():
    with pytest.raises(CommandError, match="load_dataset"):
        call_command("load_simulation")
    call_command("load_dataset")
    with pytest.raises(CommandError, match="load_canon_facts"):
        call_command("load_simulation")


@pytest.mark.django_db
def test_a_deadline_without_a_canon_fact_is_rejected(simulation_file, tmp_path):
    call_command("load_dataset")
    call_command("load_canon_facts")
    simulation_file["deadlines"].append(
        {
            "world": "mars",
            "event": "colonized",
            "by": 2000,
            "source": "x",
            "shareMet": 1,
            "medianResult": 1,
        }
    )
    with pytest.raises(CommandError, match="mars"):
        call_command("load_simulation", file=write(tmp_path, "s.json", simulation_file))


@pytest.mark.django_db
def test_a_deadline_fact_with_no_result_is_rejected(simulation_file, tmp_path):
    call_command("load_dataset")
    call_command("load_canon_facts")
    simulation_file["deadlines"] = simulation_file["deadlines"][:-1]
    with pytest.raises(CommandError, match="no result"):
        call_command("load_simulation", file=write(tmp_path, "s.json", simulation_file))


def test_load_simulation_is_idempotent(loaded):
    counts = [
        m.objects.count() for m in (SimulationRun, WorldStatistic, DeadlineResult, MarketStatistic)
    ]
    call_command("load_simulation")
    assert [
        m.objects.count() for m in (SimulationRun, WorldStatistic, DeadlineResult, MarketStatistic)
    ] == counts

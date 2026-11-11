import json
from pathlib import Path

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.catalog.models import (
    CanonNote,
    Company,
    DatasetMeta,
    Event,
    PopulationSnapshot,
    Region,
    ServiceArea,
    Source,
    World,
)

DATASET = Path(__file__).resolve().parents[3] / "data" / "sol-telecom-2380.json"


@pytest.fixture
def dataset() -> dict:
    return json.loads(DATASET.read_text())


@pytest.mark.django_db
def test_load_creates_the_catalog(dataset):
    call_command("load_dataset")
    assert World.objects.count() == len(dataset["worlds"]) == 33
    assert Region.objects.count() == 10
    assert Company.objects.count() == len(dataset["companies"])
    assert Event.objects.count() == len(dataset["events"]) == 140
    assert Source.objects.count() == len(dataset["meta"]["sources"])
    meta = DatasetMeta.objects.get()
    assert meta.year == 2380 and meta.seed == 1701


@pytest.mark.django_db
def test_load_links_parents_owners_and_service_areas(dataset):
    call_command("load_dataset")
    assert World.objects.get(pk="io").parent_id == "jupiter"
    assert World.objects.get(pk="earth").parent_id is None
    for raw in dataset["companies"]:
        company = Company.objects.get(pk=raw["id"])
        assert company.parent_id == raw["parentId"]
        assert company.owner_id == raw["ownerId"]
        assert set(company.service_areas.values_list("world_id", flat=True)) == set(
            raw["servesWorldIds"]
        )


@pytest.mark.django_db
def test_load_stores_population_history_and_canon_notes(dataset):
    call_command("load_dataset")
    mars = next(w for w in dataset["worlds"] if w["id"] == "mars")
    assert PopulationSnapshot.objects.filter(world_id="mars").count() == len(
        mars["populationHistory"]
    )
    assert CanonNote.objects.filter(world_id="mars").count() == len(mars["canon"])
    assert PopulationSnapshot.objects.filter(world_id="earth").count() == 0


@pytest.mark.django_db
def test_load_is_idempotent():
    call_command("load_dataset")
    counts = [m.objects.count() for m in (World, Company, ServiceArea, Event, CanonNote)]
    call_command("load_dataset")
    assert [m.objects.count() for m in (World, Company, ServiceArea, Event, CanonNote)] == counts


@pytest.mark.django_db
def test_load_refuses_unknown_schema_version(dataset, tmp_path):
    dataset["schemaVersion"] = "9.9.9"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(dataset))
    with pytest.raises(CommandError, match="schemaVersion"):
        call_command("load_dataset", file=str(bad))
    assert World.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_failed_load_rolls_back(dataset, tmp_path):
    dataset["events"][0]["worldId"] = "no-such-world"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(dataset))
    with pytest.raises(Exception):  # noqa: B017, PT011
        call_command("load_dataset", file=str(bad))
    assert World.objects.count() == 0

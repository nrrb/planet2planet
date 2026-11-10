"""Load sol-telecom-2380.json into the catalog. Idempotent: reruns converge on the file."""

from typing import Any

from django.db import transaction

from .models import (
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

SUPPORTED_SCHEMA_VERSIONS = {"1.0.0"}


class UnsupportedSchema(ValueError):
    pass


@transaction.atomic
def load_dataset(data: dict[str, Any]) -> dict[str, int]:
    version = data.get("schemaVersion")
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        raise UnsupportedSchema(f"Unknown schemaVersion {version!r}")

    meta = data["meta"]
    DatasetMeta.objects.update_or_create(
        id=1,
        defaults={
            "schema_version": version,
            "title": meta["title"],
            "description": meta["description"],
            "seed": meta["seed"],
            "year": meta["year"],
            "simulation_start": meta["simulationStart"],
            "subspace_speed_c": meta["subspaceSpeedC"],
        },
    )
    for source in meta["sources"]:
        Source.objects.update_or_create(
            slug=source["id"], defaults={"title": source["title"], "url": source["url"]}
        )
    for order, region in enumerate(data["regions"]):
        Region.objects.update_or_create(
            slug=region["id"], defaults={"name": region["name"], "order": order}
        )

    _load_worlds(data["worlds"])
    _load_companies(data["companies"])
    _load_events(data["events"])
    return {
        "worlds": World.objects.count(),
        "companies": Company.objects.count(),
        "events": Event.objects.count(),
    }


def _load_worlds(worlds: list[dict[str, Any]]) -> None:
    for raw in worlds:
        phys, hist = raw["physical"], raw["history"]
        World.objects.update_or_create(
            slug=raw["id"],
            defaults={
                "name": raw["name"],
                "type": raw["type"],
                "region_id": raw["regionId"],
                "gaseous": phys["gaseous"],
                "radius_km": phys["radiusKm"],
                "mass_kg": phys["massKg"],
                "surface_gravity": phys["surfaceGravityMs2"],
                "main_elements": phys["mainElements"],
                "distance_from_sun_au": phys["distanceFromSunAu"],
                "orbit_radius_km": phys["orbitRadiusKm"],
                "orbital_period_days": phys["orbitalPeriodDays"],
                "orbital_speed_km_s": phys["orbitalSpeedKmS"],
                "constellation_established": hist["constellationEstablished"],
                "constellation_started_as": hist["constellationStartedAs"] or "",
                "subspace_since": hist["subspaceSince"],
                "colonized": hist["colonized"],
                "homeworld": hist["homeworld"],
                "passed_one_million": hist["passedOneMillion"],
                "population": raw["population"],
                "latency_to_earth_min_ms": raw["communications"]["subspaceLatencyToEarthMs"]["min"],
                "latency_to_earth_max_ms": raw["communications"]["subspaceLatencyToEarthMs"]["max"],
                "conjunction_with_earth_every_days": raw["communications"][
                    "solarConjunctionWithEarthEveryDays"
                ],
            },
        )
    # Parents are set once every world exists, so file order does not matter.
    for raw in worlds:
        World.objects.filter(pk=raw["id"]).update(parent_id=raw["parentId"])

    PopulationSnapshot.objects.all().delete()
    CanonNote.objects.all().delete()
    snapshots, notes = [], []
    for raw in worlds:
        for year, population in (raw["populationHistory"] or {}).items():
            snapshots.append(
                PopulationSnapshot(world_id=raw["id"], year=int(year), population=population)
            )
        notes.extend(
            CanonNote(
                world_id=raw["id"], year=note["year"], text=note["text"], source_id=note["sourceId"]
            )
            for note in raw["canon"]
        )
    PopulationSnapshot.objects.bulk_create(snapshots)
    CanonNote.objects.bulk_create(notes)


def _load_companies(companies: list[dict[str, Any]]) -> None:
    for raw in companies:
        Company.objects.update_or_create(
            slug=raw["id"],
            defaults={
                "name": raw["name"],
                "kind": raw["kind"],
                "sectors": raw["sectors"],
                "environment": raw["environment"] or "",
                "focus": raw["focus"],
                "headquarters_id": raw["headquartersWorldId"],
                "region_id": raw["regionId"],
                "founded": raw["founded"],
                "origin": raw["origin"],
                "status": raw["status"],
                "acquired_year": raw["acquiredYear"],
            },
        )
    for raw in companies:
        Company.objects.filter(pk=raw["id"]).update(
            parent_id=raw["parentId"], owner_id=raw["ownerId"], acquired_by_id=raw["acquiredById"]
        )
    ServiceArea.objects.all().delete()
    ServiceArea.objects.bulk_create(
        ServiceArea(company_id=raw["id"], world_id=world_id)
        for raw in companies
        for world_id in raw["servesWorldIds"]
    )


def _load_events(events: list[dict[str, Any]]) -> None:
    Event.objects.all().delete()
    Event.objects.bulk_create(
        Event(
            year=raw["year"],
            type=raw["type"],
            world_id=raw["worldId"],
            company_id=raw.get("companyId"),
            buyer_id=raw.get("buyerId"),
            detail=raw["detail"] or "",
            sequence=index,
        )
        for index, raw in enumerate(events)
    )

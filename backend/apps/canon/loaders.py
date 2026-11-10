"""Load the curated canon facts and the Monte Carlo summary. Both are all-or-nothing."""

from datetime import datetime
from typing import Any

from django.db import transaction

from apps.catalog.models import DatasetMeta, Source, World

from .models import CanonFact, DeadlineResult, MarketStatistic, SimulationRun, WorldStatistic

SCHEMA_VERSIONS = {"1.0.0"}

METRICS = {
    "constellation": WorldStatistic.Metric.CONSTELLATION,
    "subspace": WorldStatistic.Metric.SUBSPACE,
    "colonized": WorldStatistic.Metric.COLONIZED,
    "oneMillion": WorldStatistic.Metric.ONE_MILLION,
    "population": WorldStatistic.Metric.POPULATION,
}
MARKET_METRICS = {
    "companiesFounded": MarketStatistic.Metric.COMPANIES_FOUNDED,
    "brandsTrading": MarketStatistic.Metric.BRANDS_TRADING,
    "companiesBought": MarketStatistic.Metric.COMPANIES_BOUGHT,
}


class LoadError(ValueError):
    pass


def _require_schema(data: dict[str, Any]) -> None:
    if data.get("schemaVersion") not in SCHEMA_VERSIONS:
        raise LoadError(f"Unknown schemaVersion {data.get('schemaVersion')!r}")


@transaction.atomic
def load_canon_facts(data: dict[str, Any]) -> int:
    _require_schema(data)
    for source in data.get("sources", []):
        Source.objects.update_or_create(
            slug=source["id"], defaults={"title": source["title"], "url": source["url"]}
        )
    known_sources = set(Source.objects.values_list("slug", flat=True))
    known_worlds = set(World.objects.values_list("slug", flat=True))
    seen: list[str] = []
    for fact in data["facts"]:
        slug = fact.get("slug", "?")
        source = fact.get("source")
        if not source:
            raise LoadError(f"Fact {slug!r} has no source")
        if source not in known_sources:
            raise LoadError(f"Fact {slug!r} cites unknown source {source!r}")
        if fact["category"] not in CanonFact.Category.values:
            raise LoadError(f"Fact {slug!r} has an unknown category {fact['category']!r}")
        if fact["standing"] not in CanonFact.Standing.values:
            raise LoadError(f"Fact {slug!r} has an unknown standing {fact['standing']!r}")
        world = fact.get("world")
        if world and world not in known_worlds:
            raise LoadError(f"Fact {slug!r} names unknown world {world!r}")
        deadline = fact.get("deadline") or {}
        if fact["category"] == CanonFact.Category.DEADLINE and not (
            deadline.get("event") and deadline.get("year")
        ):
            raise LoadError(f"Deadline fact {slug!r} needs an event and a year")
        CanonFact.objects.update_or_create(
            slug=slug,
            defaults={
                "category": fact["category"],
                "topic": fact["topic"],
                "world_id": world,
                "statement": fact["statement"],
                "episodes": fact.get("episodes", []),
                "how_used": fact["howUsed"],
                "standing": fact["standing"],
                "source_id": source,
                "deadline_event": deadline.get("event", ""),
                "deadline_year": deadline.get("year"),
                "deadline_threshold": deadline.get("threshold"),
                "order": fact["order"],
            },
        )
        seen.append(slug)
    CanonFact.objects.exclude(slug__in=seen).delete()
    return len(seen)


def _ordered(label: str, median, p10, p90) -> None:
    if median is not None and not (p10 <= median <= p90):
        raise LoadError(f"{label}: percentiles are out of order ({p10}, {median}, {p90})")


@transaction.atomic
def load_simulation(data: dict[str, Any]) -> dict[str, int]:
    dataset = DatasetMeta.objects.first()
    if dataset is None:
        raise LoadError("Run load_dataset first")
    if not CanonFact.objects.exists():
        raise LoadError("Run load_canon_facts first")
    _require_schema(data)
    if data["schemaVersion"] != dataset.schema_version:
        raise LoadError("The Monte Carlo file and the dataset have different schema versions")
    run = data["run"]
    if not dataset.script_commit or run["scriptCommit"] != dataset.script_commit:
        raise LoadError(
            f"Script commit mismatch: dataset {dataset.script_commit!r}, "
            f"summary {run['scriptCommit']!r}. Regenerate both with --export."
        )

    generated = datetime.fromisoformat(run["generatedAt"].replace("Z", "+00:00"))
    SimulationRun.objects.update_or_create(
        slug="canonical",
        defaults={
            "kind": SimulationRun.Kind.CANONICAL,
            "first_seed": dataset.seed,
            "run_count": 1,
            "start_year": dataset.simulation_start,
            "end_year": dataset.year,
            "script_commit": dataset.script_commit,
            "generated_at": generated,
        },
    )
    mc, _ = SimulationRun.objects.update_or_create(
        slug="monte-carlo",
        defaults={
            "kind": SimulationRun.Kind.MONTE_CARLO,
            "first_seed": run["firstSeed"],
            "run_count": run["runCount"],
            "start_year": run["startYear"],
            "end_year": run["endYear"],
            "script_commit": run["scriptCommit"],
            "generated_at": generated,
        },
    )
    mc.world_statistics.all().delete()
    mc.deadline_results.all().delete()
    mc.market_statistics.all().delete()

    known_worlds = set(World.objects.values_list("slug", flat=True))
    rows = []
    for world in data["worlds"]:
        if world["id"] not in known_worlds:
            raise LoadError(f"Summary names unknown world {world['id']!r}")
        for key, metric in METRICS.items():
            m = world["metrics"][key]
            _ordered(f"{world['id']} {key}", m["median"], m["p10"], m["p90"])
            rows.append(
                WorldStatistic(
                    run=mc,
                    world_id=world["id"],
                    metric=metric,
                    median=m["median"],
                    p10=m["p10"],
                    p90=m["p90"],
                    share_of_runs=m["shareOfRuns"],
                    samples=m["samples"],
                )
            )
    WorldStatistic.objects.bulk_create(rows)

    matched: set[str] = set()
    for d in data["deadlines"]:
        fact = CanonFact.objects.filter(
            category=CanonFact.Category.DEADLINE,
            world_id=d["world"],
            deadline_event=d["event"],
            deadline_year=d["by"],
        ).first()
        if fact is None:
            raise LoadError(
                f"Deadline for {d['world']} ({d['event']} by {d['by']}) has no canon fact"
            )
        matched.add(fact.slug)
        DeadlineResult.objects.create(
            run=mc, canon_fact=fact, share_met=d["shareMet"], median_result=d["medianResult"]
        )
    for fact in CanonFact.objects.filter(category=CanonFact.Category.DEADLINE):
        if fact.slug not in matched:
            raise LoadError(f"Deadline fact {fact.slug!r} has no result in the summary")

    market = data["market"]
    stats = []
    for key, metric in MARKET_METRICS.items():
        m = market[key]
        _ordered(key, m["median"], m["p10"], m["p90"])
        stats.append(
            MarketStatistic(run=mc, metric=metric, median=m["median"], p10=m["p10"], p90=m["p90"])
        )
    for kind, m in market["brandsByKind"].items():
        _ordered(f"brands of {kind}", m["median"], m["p10"], m["p90"])
        stats.append(
            MarketStatistic(
                run=mc,
                metric=MarketStatistic.Metric.BRANDS_BY_KIND,
                kind=kind,
                median=m["median"],
                p10=m["p10"],
                p90=m["p90"],
            )
        )
    MarketStatistic.objects.bulk_create(stats)
    return {
        "worlds": len(data["worlds"]),
        "deadlines": len(data["deadlines"]),
        "market": len(stats),
    }

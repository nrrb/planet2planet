from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.catalog.models import Source, World


class CanonFact(models.Model):
    """A fact from Star Trek canon (or one set aside) and how the simulation treats it."""

    class Category(models.TextChoices):
        STARTING_CONDITION = "starting-condition"
        DEADLINE = "deadline"
        SET_ASIDE = "set-aside"

    class Standing(models.TextChoices):
        ON_SCREEN = "on-screen"
        REFERENCE_BOOK = "reference-book"
        NOT_FOUND = "not-found"

    slug = models.CharField(max_length=80, primary_key=True)
    category = models.CharField(max_length=30, choices=Category.choices)
    topic = models.CharField(max_length=160)
    world = models.ForeignKey(
        World, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    statement = models.TextField()
    episodes = ArrayField(models.CharField(max_length=120), default=list, blank=True)
    how_used = models.TextField(help_text="How the simulation uses it, or why it was left out.")
    standing = models.CharField(max_length=20, choices=Standing.choices)
    source = models.ForeignKey(Source, on_delete=models.PROTECT, related_name="canon_facts")
    # Deadlines only: the latest date canon allows.
    deadline_event = models.CharField(max_length=20, blank=True)
    deadline_year = models.PositiveSmallIntegerField(null=True, blank=True)
    deadline_threshold = models.FloatField(null=True, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["category", "order"]

    def __str__(self) -> str:
        return self.topic


class SimulationRun(models.Model):
    class Kind(models.TextChoices):
        CANONICAL = "canonical"
        MONTE_CARLO = "monte-carlo"

    slug = models.CharField(max_length=40, primary_key=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    first_seed = models.IntegerField()
    run_count = models.PositiveIntegerField()
    start_year = models.PositiveSmallIntegerField()
    end_year = models.PositiveSmallIntegerField()
    script_commit = models.CharField(
        max_length=60, help_text="Git commit of tools/colonization-sim.js."
    )
    generated_at = models.DateTimeField()

    def __str__(self) -> str:
        return f"{self.kind} from seed {self.first_seed}"


class WorldStatistic(models.Model):
    class Metric(models.TextChoices):
        CONSTELLATION = "constellation"
        SUBSPACE = "subspace"
        COLONIZED = "colonized"
        ONE_MILLION = "one-million"
        POPULATION = "population"

    run = models.ForeignKey(
        SimulationRun, on_delete=models.CASCADE, related_name="world_statistics"
    )
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="statistics")
    metric = models.CharField(max_length=20, choices=Metric.choices)
    median = models.FloatField(null=True, blank=True)
    p10 = models.FloatField(null=True, blank=True)
    p90 = models.FloatField(null=True, blank=True)
    share_of_runs = models.FloatField(help_text="Share of runs in which it happened, 0 to 1.")
    samples = ArrayField(models.BigIntegerField(), default=list, blank=True)

    class Meta:
        ordering = ["world_id", "metric"]
        constraints = [
            models.UniqueConstraint(
                fields=["run", "world", "metric"], name="unique_world_statistic"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.world_id} {self.metric}"


class DeadlineResult(models.Model):
    run = models.ForeignKey(
        SimulationRun, on_delete=models.CASCADE, related_name="deadline_results"
    )
    canon_fact = models.ForeignKey(CanonFact, on_delete=models.CASCADE, related_name="results")
    share_met = models.FloatField()
    median_result = models.FloatField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["run", "canon_fact"], name="unique_deadline_result"),
        ]

    def __str__(self) -> str:
        return f"{self.canon_fact_id}: {self.share_met:.0%}"


class MarketStatistic(models.Model):
    class Metric(models.TextChoices):
        COMPANIES_FOUNDED = "companies-founded"
        BRANDS_TRADING = "brands-trading"
        COMPANIES_BOUGHT = "companies-bought"
        BRANDS_BY_KIND = "brands-by-kind"

    run = models.ForeignKey(
        SimulationRun, on_delete=models.CASCADE, related_name="market_statistics"
    )
    metric = models.CharField(max_length=30, choices=Metric.choices)
    kind = models.CharField(
        max_length=60, blank=True, help_text="Company kind, for brands-by-kind."
    )
    median = models.FloatField(null=True, blank=True)
    p10 = models.FloatField(null=True, blank=True)
    p90 = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["metric", "kind"]

    def __str__(self) -> str:
        return f"{self.metric} {self.kind}".strip()

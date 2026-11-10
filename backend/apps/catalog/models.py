from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Q


class Source(models.Model):
    slug = models.CharField(max_length=80, primary_key=True)
    title = models.CharField(max_length=200)
    url = models.URLField(max_length=500)

    def __str__(self) -> str:
        return self.title


class Region(models.Model):
    slug = models.CharField(max_length=40, primary_key=True)
    name = models.CharField(max_length=80)
    order = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["order"]

    def __str__(self) -> str:
        return self.name


class DatasetMeta(models.Model):
    """One row describing the loaded dataset (the run the shop's world comes from)."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    schema_version = models.CharField(max_length=20)
    title = models.CharField(max_length=200)
    description = models.TextField()
    seed = models.IntegerField()
    year = models.PositiveSmallIntegerField()
    simulation_start = models.PositiveSmallIntegerField()
    subspace_speed_c = models.FloatField()

    def __str__(self) -> str:
        return self.title


class World(models.Model):
    class Type(models.TextChoices):
        PLANET = "planet"
        DWARF_PLANET = "dwarf-planet"
        MOON = "moon"

    class ConstellationKind(models.TextChoices):
        CONVENTIONAL = "conventional"
        SUBSPACE = "subspace"

    slug = models.CharField(max_length=40, primary_key=True)
    name = models.CharField(max_length=80)
    type = models.CharField(max_length=20, choices=Type.choices)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="moons"
    )
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="worlds")
    gaseous = models.BooleanField()
    radius_km = models.FloatField()
    mass_kg = models.FloatField()
    surface_gravity = models.FloatField()
    main_elements = ArrayField(models.CharField(max_length=3))
    distance_from_sun_au = models.FloatField()
    orbit_radius_km = models.FloatField(null=True, blank=True)
    orbital_period_days = models.FloatField()
    orbital_speed_km_s = models.FloatField()
    constellation_established = models.PositiveSmallIntegerField(null=True, blank=True)
    constellation_started_as = models.CharField(
        max_length=20, choices=ConstellationKind.choices, blank=True
    )
    subspace_since = models.PositiveSmallIntegerField(null=True, blank=True)
    colonized = models.PositiveSmallIntegerField(null=True, blank=True)
    homeworld = models.BooleanField(default=False)
    passed_one_million = models.PositiveSmallIntegerField(null=True, blank=True)
    population = models.BigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["slug"]
        constraints = [
            models.CheckConstraint(condition=~Q(parent=F("slug")), name="world_not_its_own_parent"),
        ]

    def __str__(self) -> str:
        return self.name


class PopulationSnapshot(models.Model):
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="population_history")
    year = models.PositiveSmallIntegerField()
    population = models.BigIntegerField()

    class Meta:
        ordering = ["world_id", "year"]
        constraints = [
            models.UniqueConstraint(fields=["world", "year"], name="unique_snapshot_per_year"),
        ]

    def __str__(self) -> str:
        return f"{self.world_id} {self.year}"


class CanonNote(models.Model):
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="canon_notes")
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    text = models.TextField()
    source = models.ForeignKey(Source, null=True, blank=True, on_delete=models.PROTECT)

    class Meta:
        ordering = ["world_id", "id"]

    def __str__(self) -> str:
        return f"{self.world_id}: {self.text[:40]}"


class Company(models.Model):
    class Kind(models.TextChoices):
        BACKBONE = "backbone"
        REGIONAL = "regional"
        GATEWAY = "gateway"
        SPECIALIST = "specialist"

    class Status(models.TextChoices):
        ACTIVE = "active"
        DIVISION = "division"
        MERGED = "merged"

    slug = models.CharField(max_length=60, primary_key=True)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    sectors = ArrayField(models.CharField(max_length=20))
    environment = models.CharField(max_length=30, blank=True)
    focus = models.CharField(max_length=300)
    headquarters = models.ForeignKey(World, on_delete=models.PROTECT, related_name="hosted")
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="companies")
    founded = models.PositiveSmallIntegerField()
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="spin_offs"
    )
    origin = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=Status.choices)
    owner = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="owned"
    )
    acquired_by = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="acquisitions"
    )
    acquired_year = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["slug"]
        verbose_name_plural = "companies"

    def __str__(self) -> str:
        return self.name


class ServiceArea(models.Model):
    """Who sells where in the snapshot year."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="service_areas")
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="service_areas")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "world"], name="unique_service_area"),
        ]

    def __str__(self) -> str:
        return f"{self.company_id} @ {self.world_id}"


class Event(models.Model):
    year = models.SmallIntegerField()
    type = models.CharField(max_length=40)
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="events")
    company = models.ForeignKey(
        Company, null=True, blank=True, on_delete=models.CASCADE, related_name="events"
    )
    buyer = models.ForeignKey(
        Company, null=True, blank=True, on_delete=models.CASCADE, related_name="purchases"
    )
    detail = models.CharField(max_length=300, blank=True)
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["year", "sequence"]
        indexes = [models.Index(fields=["type"])]

    def __str__(self) -> str:
        return f"{self.year} {self.type} {self.world_id}"

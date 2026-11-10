from django.db import models
from django.db.models import F, Q

from apps.catalog.models import Company, Region, World


class OrbitalElements(models.Model):
    """JPL approximate Keplerian elements for a Sun-orbiting world (angles in degrees)."""

    world = models.OneToOneField(World, on_delete=models.CASCADE, related_name="elements")
    semi_major_axis_au = models.FloatField()
    semi_major_axis_rate = models.FloatField(default=0)
    eccentricity = models.FloatField()
    eccentricity_rate = models.FloatField(default=0)
    longitude_of_perihelion_deg = models.FloatField()
    longitude_of_perihelion_rate = models.FloatField(default=0)
    mean_longitude_deg = models.FloatField(help_text="At J2000.")
    mean_longitude_rate = models.FloatField(help_text="Degrees per Julian century.")
    # JPL Table 2b extra terms for Jupiter to Neptune.
    b = models.FloatField(null=True, blank=True)
    c = models.FloatField(null=True, blank=True)
    s = models.FloatField(null=True, blank=True)
    f = models.FloatField(null=True, blank=True)
    source = models.CharField(max_length=200)

    class Meta:
        verbose_name_plural = "orbital elements"

    def __str__(self) -> str:
        return f"Elements of {self.world_id}"


class MoonPhase(models.Model):
    """Invented fixed phase of a moon on its circular orbit at J2000."""

    world = models.OneToOneField(World, on_delete=models.CASCADE, related_name="phase")
    phase_deg = models.FloatField()

    def __str__(self) -> str:
        return f"Phase of {self.world_id}"


class Node(models.Model):
    class Kind(models.TextChoices):
        CONSTELLATION = "constellation"
        HUB = "hub"
        RELAY = "relay"

    slug = models.CharField(max_length=60, primary_key=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    world = models.ForeignKey(World, null=True, blank=True, on_delete=models.CASCADE)
    region = models.ForeignKey(Region, null=True, blank=True, on_delete=models.CASCADE)
    # Conjunction relays only: fixed position in AU, off the ecliptic.
    fixed_x = models.FloatField(null=True, blank=True)
    fixed_y = models.FloatField(null=True, blank=True)
    fixed_z = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["slug"]

    def __str__(self) -> str:
        return self.slug


class Link(models.Model):
    class Layer(models.TextChoices):
        ACCESS = "access"
        MESH = "mesh"
        BACKBONE = "backbone"
        CROSS = "cross"
        CONJUNCTION = "conjunction"

    slug = models.CharField(max_length=160, primary_key=True)
    layer = models.CharField(max_length=20, choices=Layer.choices)
    a = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="links_a")
    b = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="links_b")
    operator = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="links")
    established = models.PositiveSmallIntegerField()
    processing_ms = models.FloatField()
    hardened = models.BooleanField(default=False)
    capacity_class = models.CharField(max_length=20)

    class Meta:
        ordering = ["slug"]
        constraints = [
            models.CheckConstraint(condition=~Q(a=F("b")), name="link_ends_differ"),
        ]
        indexes = [models.Index(fields=["layer"])]

    def __str__(self) -> str:
        return self.slug

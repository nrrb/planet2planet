import csv
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.network.models import MoonPhase, OrbitalElements

DATA = Path(settings.BASE_DIR) / "data"


def _optional(value: str) -> float | None:
    return float(value) if value else None


class Command(BaseCommand):
    help = "Load orbital elements and moon phases from data/*.csv (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options):
        with open(DATA / "orbital-elements.csv", newline="") as f:
            for row in csv.DictReader(f):
                OrbitalElements.objects.update_or_create(
                    world_id=row["slug"],
                    defaults={
                        "semi_major_axis_au": float(row["a_au"]),
                        "semi_major_axis_rate": float(row["a_rate"]),
                        "eccentricity": float(row["e"]),
                        "eccentricity_rate": float(row["e_rate"]),
                        "longitude_of_perihelion_deg": float(row["long_peri_deg"]),
                        "longitude_of_perihelion_rate": float(row["long_peri_rate"]),
                        "mean_longitude_deg": float(row["mean_long_deg"]),
                        "mean_longitude_rate": float(row["mean_long_rate"]),
                        "b": _optional(row["b"]),
                        "c": _optional(row["c"]),
                        "s": _optional(row["s"]),
                        "f": _optional(row["f"]),
                        "source": row["source"],
                    },
                )
        with open(DATA / "moon-phases.csv", newline="") as f:
            for row in csv.DictReader(f):
                MoonPhase.objects.update_or_create(
                    world_id=row["slug"], defaults={"phase_deg": float(row["phase_deg"])}
                )
        elements, phases = OrbitalElements.objects.count(), MoonPhase.objects.count()
        self.stdout.write(self.style.SUCCESS(f"Loaded {elements} elements, {phases} phases"))

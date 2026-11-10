import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.canon.loaders import LoadError, load_simulation

DEFAULT_FILE = Path(settings.BASE_DIR) / "data" / "sol-montecarlo-2380.json"


class Command(BaseCommand):
    help = "Load the Monte Carlo summary (idempotent). It must match the dataset's script commit."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE))

    def handle(self, *args, **options):
        data = json.loads(Path(options["file"]).read_text())
        try:
            counts = load_simulation(data)
        except LoadError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(self.style.SUCCESS(f"Loaded {counts}"))

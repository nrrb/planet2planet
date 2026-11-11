import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.catalog.loader import UnsupportedSchema, load_dataset

DEFAULT_FILE = Path(settings.BASE_DIR) / "data" / "sol-telecom-2380.json"


class Command(BaseCommand):
    help = "Load sol-telecom-2380.json into the catalog (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE))

    def handle(self, *args, **options):
        data = json.loads(Path(options["file"]).read_text())
        try:
            counts = load_dataset(data)
        except UnsupportedSchema as error:
            raise CommandError(str(error)) from error
        self.stdout.write(self.style.SUCCESS(f"Loaded {counts}"))

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.canon.loaders import LoadError, load_canon_facts

DEFAULT_FILE = Path(settings.BASE_DIR) / "data" / "canon-facts.json"


class Command(BaseCommand):
    help = "Load the curated canon facts (idempotent). Every fact needs a source."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE))

    def handle(self, *args, **options):
        data = json.loads(Path(options["file"]).read_text())
        try:
            count = load_canon_facts(data)
        except LoadError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(self.style.SUCCESS(f"Loaded {count} canon facts"))

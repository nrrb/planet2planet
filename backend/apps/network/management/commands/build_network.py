from django.core.management.base import BaseCommand

from apps.network.builder import build_network


class Command(BaseCommand):
    help = "Generate network nodes and links from the catalog (idempotent)."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"Built {build_network()}"))

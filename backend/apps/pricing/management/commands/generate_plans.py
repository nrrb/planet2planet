from django.core.management.base import BaseCommand

from apps.pricing.generator import SEED, generate_plans


class Command(BaseCommand):
    help = "Create plan templates, plans, provider positioning and default parameters."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=SEED)

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"Generated {generate_plans(options['seed'])}"))

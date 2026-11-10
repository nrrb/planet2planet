from django.core.management.base import BaseCommand, CommandError

from apps.pricing.checks import run_checks


class Command(BaseCommand):
    help = "Check data integrity: reachability, plans, and pricing of every pair of worlds."

    def add_arguments(self, parser):
        parser.add_argument(
            "--ranges", action="store_true", help="Also compute yearly latency ranges (slow)."
        )

    def handle(self, *args, **options):
        problems, pairs = run_checks(with_ranges=options["ranges"])
        if problems:
            shown = "\n".join(f"  - {p}" for p in problems[:25])
            more = f"\n  ... and {len(problems) - 25} more" if len(problems) > 25 else ""
            raise CommandError(f"{len(problems)} problem(s):\n{shown}{more}")
        self.stdout.write(self.style.SUCCESS(f"OK: {pairs} pairs priced, no problems"))

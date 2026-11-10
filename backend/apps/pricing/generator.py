"""Create plan templates, plans, provider positioning and default parameters.

Deterministic for a given seed, and idempotent: reruns converge on the same rows.
"""

import random

from django.db import transaction

from apps.catalog.models import Company

from .constants import (
    DEFAULT_PARAMETERS,
    SPECIALIST_PLANS,
    TEMPLATES,
    TERM_DISCOUNTS,
)
from .models import Plan, PlanTemplate, PricingParameter

SEED = 2380


def positioning_for(company: Company, seed: int = SEED) -> float:
    """0.85 cheap to 1.25 premium. Older companies are pricier; startups are cheaper."""
    rng = random.Random(f"{seed}:{company.slug}")
    age = (company.founded - 1962) / (2380 - 1962)
    value = 1.25 - 0.36 * age + rng.uniform(-0.04, 0.04)
    if company.origin == "startup":
        value -= 0.03
    return round(min(1.25, max(0.85, value)), 3)


def _environment_slug(value: str) -> list[str]:
    return [value.replace(" ", "-")] if value else []


@transaction.atomic
def generate_plans(seed: int = SEED) -> dict[str, int]:
    for key, (value, description) in DEFAULT_PARAMETERS.items():
        PricingParameter.objects.get_or_create(
            key=key, defaults={"value": value, "description": description}
        )

    templates: dict[tuple[str, str], PlanTemplate] = {}
    for kind, rows in TEMPLATES.items():
        for code, name, cls, tput, base, setup, tier, reroute, standalone, role in rows:
            templates[(kind, code)], _ = PlanTemplate.objects.update_or_create(
                kind=kind,
                code=code,
                defaults={
                    "name": name,
                    "service_class": cls,
                    "throughput": tput,
                    "monthly_base": base,
                    "setup_fee": setup,
                    "role": role,
                    "resilience_tier": tier,
                    "conjunction_reroute": reroute,
                    "standalone": standalone,
                },
            )
    for rows in SPECIALIST_PLANS.values():
        for code, name, cls, tput, base, setup, tier, role in rows:
            templates[("specialist", code)], _ = PlanTemplate.objects.update_or_create(
                kind="specialist",
                code=code,
                defaults={
                    "name": name,
                    "service_class": cls,
                    "throughput": tput,
                    "monthly_base": base,
                    "setup_fee": setup,
                    "role": role,
                    "resilience_tier": tier,
                    "conjunction_reroute": False,
                    "standalone": role != "addon",
                },
            )

    Plan.objects.all().delete()
    plans = []
    companies = Company.objects.exclude(status=Company.Status.MERGED)
    for company in companies:
        company.price_positioning = positioning_for(company, seed)
        company.save(update_fields=["price_positioning"])
        if company.kind == Company.Kind.SPECIALIST:
            rows = SPECIALIST_PLANS.get(company.slug, [])
            templates_for = [templates[("specialist", r[0])] for r in rows]
        else:
            templates_for = [templates[(company.kind, r[0])] for r in TEMPLATES[company.kind]]
        for t in templates_for:
            hardened = t.resilience_tier == "hardened" or bool(company.environment)
            plans.append(
                Plan(
                    slug=f"{company.slug}--{t.code}",
                    company=company,
                    template=t,
                    name=t.name,
                    service_class=t.service_class,
                    throughput=t.throughput,
                    monthly_base=t.monthly_base,
                    setup_fee=t.setup_fee,
                    role=t.role,
                    resilience_tier=t.resilience_tier,
                    conjunction_reroute=t.conjunction_reroute,
                    environments=_environment_slug(company.environment) if hardened else [],
                    sectors=list(company.sectors),
                    standalone=t.standalone,
                    terms=dict(TERM_DISCOUNTS),
                )
            )
    Plan.objects.bulk_create(plans)
    return {"plans": len(plans), "companies": companies.count()}

import pytest
from django.core.management import call_command

from apps.catalog.models import Company
from apps.pricing.models import Plan, PricingParameter


@pytest.fixture
def generated(db):
    call_command("load_dataset")
    call_command("generate_plans")


def test_every_company_with_service_has_a_plan(generated):
    for company in Company.objects.exclude(status="merged"):
        assert company.plans.exists(), company.slug


def test_merged_companies_have_no_plans_or_positioning(generated):
    merged = Company.objects.filter(status="merged")
    assert merged.exists()
    assert not Plan.objects.filter(company__in=merged).exists()
    assert all(c.price_positioning is None for c in merged)


def test_positioning_is_within_range_and_older_backbones_are_pricier(generated):
    values = list(
        Company.objects.exclude(price_positioning=None).values_list("price_positioning", flat=True)
    )
    assert min(values) >= 0.85 and max(values) <= 1.25
    old = Company.objects.get(slug="terran-transit").price_positioning
    new = Company.objects.get(slug="hellas-access").price_positioning
    assert old > new


def test_templates_follow_company_kind(generated):
    names = lambda slug: {p.name for p in Plan.objects.filter(company_id=slug)}  # noqa: E731
    assert names("terran-transit") == {
        "Transit Shared",
        "Transit Dedicated",
        "Synchronized Trunk",
        "Diverse Path",
        "Contingency",
    }
    assert names("cassini-link") == {"Regional Shared", "Regional Dedicated"}
    assert names("ligeia-access") == {"Access Basic", "Access Pro"}
    assert "Mining Telemetry Ops" in names("loki-mining-telemetry")


def test_gateways_are_never_standalone_and_backbone_diverse_plans_reroute(generated):
    assert not Plan.objects.filter(company__kind="gateway", standalone=True).exists()
    for plan in Plan.objects.filter(
        company__kind="backbone", resilience_tier__in=["diverse-path", "contingency"]
    ):
        assert plan.conjunction_reroute


def test_environment_hardening_follows_the_company(generated):
    assert Plan.objects.get(slug="himalia-hardened-relay--hardened-relay").environments == [
        "radiation"
    ]
    assert Plan.objects.get(slug="amalthea-fuel-logistics--fuel-logistics").environments == [
        "gas-giant-orbit"
    ]
    assert Plan.objects.get(slug="terran-transit--transit-shared").environments == []


def test_emergency_priority_is_an_addon(generated):
    plan = Plan.objects.get(slug="equatorial-emergency-net--emergency-priority")
    assert plan.role == "addon" and not plan.standalone


def test_generation_is_idempotent_and_deterministic(generated):
    before = {c.slug: c.price_positioning for c in Company.objects.all()}
    count = Plan.objects.count()
    call_command("generate_plans")
    assert Plan.objects.count() == count
    assert {c.slug: c.price_positioning for c in Company.objects.all()} == before


def test_default_parameters_exist(generated):
    assert PricingParameter.objects.get(key="competition.max").value == 1.35
    assert PricingParameter.objects.get(key="resilience.contingency").value > 1

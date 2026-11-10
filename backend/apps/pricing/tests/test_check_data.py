from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.catalog.models import Company
from apps.network import services
from apps.pricing import offers
from apps.pricing.models import Plan


@pytest.fixture
def seeded(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    call_command("build_network")
    call_command("generate_plans")
    services.clear_caches()
    offers.clear_caches()


def test_check_data_passes_on_the_seeded_dataset(seeded):
    out = StringIO()
    call_command("check_data", stdout=out)
    assert "OK" in out.getvalue()
    assert "528 pairs" in out.getvalue()


def test_check_data_fails_when_a_company_with_service_has_no_plans(seeded):
    Plan.objects.filter(company_id="cassini-link").delete()
    offers.clear_caches()
    with pytest.raises(CommandError, match="cassini-link"):
        call_command("check_data")


def test_check_data_fails_when_a_world_is_unreachable(seeded):
    from apps.network.models import Link

    Link.objects.filter(a__slug="c-eris").delete()
    Link.objects.filter(b__slug="c-eris").delete()
    services.clear_caches()
    offers.clear_caches()
    with pytest.raises(CommandError, match="eris"):
        call_command("check_data")
    assert Company.objects.exists()

import pytest
from django.core.management import call_command
from django.db.models import F

from apps.catalog.models import Company, World
from apps.network.models import Link, MoonPhase, Node, OrbitalElements


@pytest.fixture
def built(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    call_command("build_network")


def test_orbital_elements_cover_every_sun_orbiting_world(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    sun_orbiting = set(World.objects.filter(parent__isnull=True).values_list("slug", flat=True))
    assert set(OrbitalElements.objects.values_list("world_id", flat=True)) == sun_orbiting
    moons = set(World.objects.filter(parent__isnull=False).values_list("slug", flat=True))
    assert set(MoonPhase.objects.values_list("world_id", flat=True)) == moons
    assert OrbitalElements.objects.get(world_id="jupiter").b is not None


def test_nodes(built):
    assert Node.objects.filter(kind="constellation").count() == 33
    assert Node.objects.filter(kind="hub").count() == 10
    assert Node.objects.filter(kind="relay").count() == 4
    assert all(
        n.fixed_z is not None and abs(n.fixed_z) >= 0.5 for n in Node.objects.filter(kind="relay")
    )
    assert Node.objects.get(slug="h-jovian").world_id == "jupiter"


def test_every_world_reaches_its_hub_via_a_provider(built):
    for world in World.objects.all():
        assert Link.objects.filter(
            a__slug=f"c-{world.slug}", b__slug=f"h-{world.region_id}", layer__in=["mesh", "access"]
        ).exists(), world.slug


def test_links_follow_service_areas(built):
    for company in Company.objects.exclude(status="merged"):
        served = set(company.service_areas.values_list("world_id", flat=True))
        linked = set(
            company.links.filter(layer__in=["mesh", "access"], b__kind="hub").values_list(
                "a__world_id", flat=True
            )
        )
        assert linked == served, company.slug


def test_merged_companies_own_no_links(built):
    assert not Link.objects.filter(operator__status="merged").exists()


def test_layers_belong_to_the_right_kinds(built):
    assert not Link.objects.filter(
        layer__in=["backbone", "cross"], operator__kind="gateway"
    ).exists()
    assert not Link.objects.filter(layer="conjunction").exclude(operator__kind="backbone").exists()
    assert Link.objects.filter(layer="cross").exists()
    assert Link.objects.filter(layer="backbone", operator_id="ares-interplanetary").exists()


def test_build_is_idempotent(built):
    counts = (Node.objects.count(), Link.objects.count())
    call_command("build_network")
    assert (Node.objects.count(), Link.objects.count()) == counts


def test_link_ends_differ(built):
    assert not Link.objects.filter(a=F("b")).exists()

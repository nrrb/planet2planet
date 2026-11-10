from rest_framework import serializers

from .models import CanonNote, Company, Event, Region, Source, World


class SourceSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug")

    class Meta:
        model = Source
        fields = ["id", "title", "url"]


class WorldListSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug")
    parent = serializers.CharField(source="parent_id", allow_null=True)
    region = serializers.CharField(source="region_id")
    eligible = serializers.SerializerMethodField(
        help_text="True when the world has a subspace constellation by the site date."
    )

    class Meta:
        model = World
        fields = ["id", "name", "type", "parent", "region", "eligible"]

    def get_eligible(self, world: World) -> bool:
        year = self.context["site_year"]
        return world.subspace_since is not None and world.subspace_since <= year


class CanonNoteSerializer(serializers.ModelSerializer):
    source = serializers.CharField(source="source_id", allow_null=True)

    class Meta:
        model = CanonNote
        fields = ["year", "text", "source"]


class WorldDetailSerializer(WorldListSerializer):
    population_history = serializers.SerializerMethodField()
    canon_notes = CanonNoteSerializer(many=True)

    class Meta(WorldListSerializer.Meta):
        fields = [
            *WorldListSerializer.Meta.fields,
            "gaseous",
            "radius_km",
            "mass_kg",
            "surface_gravity",
            "main_elements",
            "distance_from_sun_au",
            "orbit_radius_km",
            "orbital_period_days",
            "orbital_speed_km_s",
            "constellation_established",
            "constellation_started_as",
            "subspace_since",
            "colonized",
            "homeworld",
            "passed_one_million",
            "population",
            "population_history",
            "canon_notes",
        ]

    def get_population_history(self, world: World) -> dict[str, int]:
        return {str(s.year): s.population for s in world.population_history.all()}


class RegionSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug")
    world_ids = serializers.SerializerMethodField()

    class Meta:
        model = Region
        fields = ["id", "name", "order", "world_ids"]

    def get_world_ids(self, region: Region) -> list[str]:
        return [w.slug for w in region.worlds.all()]


class CompanySerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug")
    headquarters = serializers.CharField(source="headquarters_id")
    region = serializers.CharField(source="region_id")
    parent = serializers.CharField(source="parent_id", allow_null=True)
    owner = serializers.CharField(source="owner_id", allow_null=True)
    acquired_by = serializers.CharField(source="acquired_by_id", allow_null=True)
    environment = serializers.SerializerMethodField()
    world_ids = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "kind",
            "sectors",
            "environment",
            "focus",
            "headquarters",
            "region",
            "founded",
            "parent",
            "origin",
            "status",
            "owner",
            "acquired_by",
            "acquired_year",
            "world_ids",
        ]

    def get_environment(self, company: Company) -> str | None:
        return company.environment or None

    def get_world_ids(self, company: Company) -> list[str]:
        return sorted(a.world_id for a in company.service_areas.all())


class EventSerializer(serializers.ModelSerializer):
    world = serializers.CharField(source="world_id")
    company = serializers.CharField(source="company_id", allow_null=True)
    buyer = serializers.CharField(source="buyer_id", allow_null=True)
    detail = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ["year", "type", "world", "company", "buyer", "detail"]

    def get_detail(self, event: Event) -> str | None:
        return event.detail or None

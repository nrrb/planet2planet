from rest_framework import serializers

from apps.catalog.serializers import SourceSerializer

from .models import CanonFact, SimulationRun


class DeadlineSerializer(serializers.Serializer):
    event = serializers.CharField()
    year = serializers.IntegerField()
    threshold = serializers.FloatField(allow_null=True)
    share_met = serializers.FloatField(
        allow_null=True, help_text="Share of runs that met it, 0 to 1."
    )
    median_result = serializers.FloatField(
        allow_null=True, help_text="Median year (or population) simulated."
    )


class CanonFactSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug")
    world = serializers.CharField(source="world_id", allow_null=True)
    source = SourceSerializer()
    deadline = serializers.SerializerMethodField()

    class Meta:
        model = CanonFact
        fields = [
            "id",
            "category",
            "topic",
            "world",
            "statement",
            "episodes",
            "how_used",
            "standing",
            "source",
            "deadline",
        ]

    def get_deadline(self, fact: CanonFact) -> dict | None:
        if fact.category != CanonFact.Category.DEADLINE:
            return None
        result = next(iter(fact.results.all()), None)
        return {
            "event": fact.deadline_event,
            "year": fact.deadline_year,
            "threshold": fact.deadline_threshold,
            "share_met": result.share_met if result else None,
            "median_result": result.median_result if result else None,
        }


class RunSerializer(serializers.ModelSerializer):
    canonical_seed = serializers.IntegerField()

    class Meta:
        model = SimulationRun
        fields = [
            "first_seed",
            "run_count",
            "start_year",
            "end_year",
            "script_commit",
            "generated_at",
            "canonical_seed",
        ]


class MarketSerializer(serializers.Serializer):
    metric = serializers.CharField()
    kind = serializers.CharField(allow_blank=True)
    median = serializers.FloatField(allow_null=True)
    p10 = serializers.FloatField(allow_null=True)
    p90 = serializers.FloatField(allow_null=True)


class SimulationSerializer(serializers.Serializer):
    run = RunSerializer()
    market = MarketSerializer(many=True)


class WorldStatisticSerializer(serializers.Serializer):
    world = serializers.CharField()
    metric = serializers.CharField()
    median = serializers.FloatField(allow_null=True)
    p10 = serializers.FloatField(allow_null=True)
    p90 = serializers.FloatField(allow_null=True)
    share_of_runs = serializers.FloatField()
    canonical = serializers.FloatField(
        allow_null=True,
        help_text="The same measure in the canonical run (seed 1701) the shop uses.",
    )
    samples = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="One value per run, ascending. Only when one world is named and samples=true.",
    )

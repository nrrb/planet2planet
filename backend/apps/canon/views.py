from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import World

from .models import CanonFact, MarketStatistic, SimulationRun, WorldStatistic
from .serializers import (
    CanonFactSerializer,
    SimulationSerializer,
    WorldStatisticSerializer,
)


def reject_unknown(params, allowed: set[str]) -> None:
    unknown = set(params) - allowed
    if unknown:
        raise ValidationError({name: "Unknown parameter." for name in sorted(unknown)})


class CanonFactListView(ListAPIView):
    serializer_class = CanonFactSerializer

    @extend_schema(parameters=[OpenApiParameter("category", str, enum=CanonFact.Category.values)])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        reject_unknown(self.request.query_params, {"category"})
        queryset = CanonFact.objects.select_related("source").prefetch_related("results")
        category = self.request.query_params.get("category")
        if category:
            if category not in CanonFact.Category.values:
                raise ValidationError({"category": f"Unknown value {category!r}."})
            queryset = queryset.filter(category=category)
        return queryset


class SimulationView(APIView):
    @extend_schema(
        summary="Monte Carlo run details and market statistics", responses=SimulationSerializer
    )
    def get(self, request):
        run = SimulationRun.objects.filter(kind=SimulationRun.Kind.MONTE_CARLO).first()
        canonical = SimulationRun.objects.filter(kind=SimulationRun.Kind.CANONICAL).first()
        if run is None or canonical is None:
            return Response({"detail": "The simulation has not been loaded."}, status=404)
        run.canonical_seed = canonical.first_seed
        market = MarketStatistic.objects.filter(run=run)
        return Response(SimulationSerializer({"run": run, "market": market}).data)


CANONICAL_FIELDS = {
    "constellation": "constellation_established",
    "subspace": "subspace_since",
    "colonized": "colonized",
    "one-million": "passed_one_million",
    "population": "population",
}


class WorldStatisticsView(APIView):
    @extend_schema(
        summary="Per-world medians and percentiles across the Monte Carlo runs",
        parameters=[
            OpenApiParameter("metric", str, enum=WorldStatistic.Metric.values),
            OpenApiParameter("world", str),
            OpenApiParameter("samples", bool),
        ],
        responses=WorldStatisticSerializer(many=True),
    )
    def get(self, request):
        params = request.query_params
        reject_unknown(params, {"metric", "world", "samples"})
        metric, world, samples = params.get("metric"), params.get("world"), params.get("samples")
        if metric and metric not in WorldStatistic.Metric.values:
            raise ValidationError({"metric": f"Unknown value {metric!r}."})
        if world and not World.objects.filter(pk=world).exists():
            raise ValidationError({"world": f"Unknown world {world!r}."})
        if samples not in (None, "true", "false"):
            raise ValidationError({"samples": "Use true or false."})
        with_samples = samples == "true"
        if with_samples and not world:
            raise ValidationError({"samples": "Samples need one world: add world=."})

        queryset = WorldStatistic.objects.filter(run__kind=SimulationRun.Kind.MONTE_CARLO)
        if metric:
            queryset = queryset.filter(metric=metric)
        if world:
            queryset = queryset.filter(world_id=world)
        if not with_samples:
            queryset = queryset.defer("samples")
        worlds = {w.slug: w for w in World.objects.all()}
        rows = []
        for stat in queryset.order_by("world_id", "metric"):
            row = {
                "world": stat.world_id,
                "metric": stat.metric,
                "median": stat.median,
                "p10": stat.p10,
                "p90": stat.p90,
                "share_of_runs": stat.share_of_runs,
                "canonical": getattr(worlds[stat.world_id], CANONICAL_FIELDS[stat.metric]),
            }
            if with_samples:
                row["samples"] = stat.samples
            rows.append(row)
        return Response(WorldStatisticSerializer(rows, many=True).data)

from django.conf import settings
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Company, DatasetMeta, Event, Region, Source, World
from .serializers import (
    CompanySerializer,
    EventSerializer,
    MetaSerializer,
    RegionSerializer,
    WorldDetailSerializer,
    WorldListSerializer,
)


def site_year() -> int:
    return int(settings.SITE_DATE[:4])


class MetaView(APIView):
    @extend_schema(
        summary="Site date, stardate, subspace speed and sources", responses=MetaSerializer
    )
    def get(self, request):
        dataset = DatasetMeta.objects.get()
        return Response(
            MetaSerializer(
                {
                    "title": dataset.title,
                    "site_date": settings.SITE_DATE,
                    "stardate": settings.SITE_STARDATE,
                    "year": site_year(),
                    "subspace_speed_c": dataset.subspace_speed_c,
                    "sources": Source.objects.order_by("slug"),
                }
            ).data
        )


class WorldListView(ListAPIView):
    serializer_class = WorldListSerializer
    queryset = World.objects.order_by("slug")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "site_year": site_year()}


class WorldDetailView(RetrieveAPIView):
    serializer_class = WorldDetailSerializer
    lookup_field = "slug"
    lookup_url_kwarg = "world_id"
    queryset = World.objects.prefetch_related("population_history", "canon_notes")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "site_year": site_year()}


class RegionListView(ListAPIView):
    serializer_class = RegionSerializer
    queryset = Region.objects.prefetch_related("worlds")


def _choice(params, name: str, choices) -> str | None:
    value = params.get(name)
    if value is not None and value not in set(choices):
        raise ValidationError({name: f"Unknown value {value!r}."})
    return value


class CompanyListView(ListAPIView):
    serializer_class = CompanySerializer

    @extend_schema(
        parameters=[
            OpenApiParameter("kind", str),
            OpenApiParameter("sector", str),
            OpenApiParameter("world", str),
            OpenApiParameter("status", str),
        ]
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        params = self.request.query_params
        unknown = set(params) - {"kind", "sector", "world", "status"}
        if unknown:
            raise ValidationError({name: "Unknown parameter." for name in sorted(unknown)})
        queryset = Company.objects.prefetch_related("service_areas").order_by("slug")
        if kind := _choice(params, "kind", Company.Kind.values):
            queryset = queryset.filter(kind=kind)
        if status := _choice(params, "status", Company.Status.values):
            queryset = queryset.filter(status=status)
        if sector := params.get("sector"):
            queryset = queryset.filter(sectors__contains=[sector])
        if world := params.get("world"):
            queryset = queryset.filter(service_areas__world_id=world)
        return queryset


class HistoryView(ListAPIView):
    serializer_class = EventSerializer

    @extend_schema(parameters=[OpenApiParameter("type", str)])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        params = self.request.query_params
        unknown = set(params) - {"type"}
        if unknown:
            raise ValidationError({name: "Unknown parameter." for name in sorted(unknown)})
        queryset = Event.objects.order_by("year", "sequence")
        known = Event.objects.values_list("type", flat=True).distinct()
        if event_type := _choice(params, "type", known):
            queryset = queryset.filter(type=event_type)
        return queryset

from datetime import date

from django.conf import settings
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Company, Region

from . import services
from .models import Link, MoonPhase, Node, OrbitalElements
from .routing import is_degraded
from .serializers import NetworkSerializer

PARAMS = {"layer", "company", "region"}


class NetworkView(APIView):
    @extend_schema(
        summary="Nodes, links and orbit data for the maps",
        parameters=[OpenApiParameter(name, str) for name in sorted(PARAMS)],
        responses=NetworkSerializer,
    )
    def get(self, request):
        params = request.query_params
        unknown = set(params) - PARAMS
        if unknown:
            raise ValidationError({name: "Unknown parameter." for name in sorted(unknown)})
        links = Link.objects.all()
        if layer := params.get("layer"):
            if layer not in Link.Layer.values:
                raise ValidationError({"layer": f"Unknown value {layer!r}."})
            links = links.filter(layer=layer)
        if company := params.get("company"):
            if not Company.objects.filter(pk=company).exists():
                raise ValidationError({"company": f"Unknown value {company!r}."})
            links = links.filter(operator_id=company)
        if region := params.get("region"):
            if not Region.objects.filter(pk=region).exists():
                raise ValidationError({"region": f"Unknown value {region!r}."})
            links = links.filter(a__region_id=region) | links.filter(b__region_id=region)

        day = date.fromisoformat(settings.SITE_DATE)
        positions = services.node_positions(day)
        edges = {e.slug: e for e in services.edges()}
        data = {
            "site_date": settings.SITE_DATE,
            "stardate": settings.SITE_STARDATE,
            "nodes": [
                {
                    "id": n.slug,
                    "kind": n.kind,
                    "world": n.world_id,
                    "region": n.region_id,
                    "fixed_position": (
                        [n.fixed_x, n.fixed_y, n.fixed_z] if n.kind == Node.Kind.RELAY else None
                    ),
                }
                for n in Node.objects.order_by("slug")
            ],
            "links": [
                {
                    "id": link.slug,
                    "layer": link.layer,
                    "a": link.a_id,
                    "b": link.b_id,
                    "operator": link.operator_id,
                    "established": link.established,
                    "processing_ms": link.processing_ms,
                    "hardened": link.hardened,
                    "capacity_class": link.capacity_class,
                    "degraded": is_degraded(edges[link.slug], positions),
                }
                for link in links.order_by("slug")
            ],
            "orbits": _orbits(),
        }
        return Response(NetworkSerializer(data).data)


def _orbits() -> dict[str, dict]:
    orbits: dict[str, dict] = {}
    for e in OrbitalElements.objects.all():
        orbits[e.world_id] = {
            "kind": "heliocentric",
            "semi_major_axis_au": e.semi_major_axis_au,
            "semi_major_axis_rate": e.semi_major_axis_rate,
            "eccentricity": e.eccentricity,
            "eccentricity_rate": e.eccentricity_rate,
            "longitude_of_perihelion_deg": e.longitude_of_perihelion_deg,
            "longitude_of_perihelion_rate": e.longitude_of_perihelion_rate,
            "mean_longitude_deg": e.mean_longitude_deg,
            "mean_longitude_rate": e.mean_longitude_rate,
            "b": e.b,
            "c": e.c,
            "s": e.s,
            "f": e.f,
        }
    for p in MoonPhase.objects.select_related("world"):
        orbits[p.world_id] = {
            "kind": "moon",
            "parent": p.world.parent_id,
            "orbit_radius_km": p.world.orbit_radius_km,
            "period_days": p.world.orbital_period_days,
            "phase_deg": p.phase_deg,
        }
    return orbits

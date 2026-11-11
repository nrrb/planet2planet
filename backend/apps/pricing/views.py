from django.utils.cache import patch_cache_control
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .quotes import quote
from .serializers import ALLOWED_PARAMS, QuoteQuerySerializer, QuoteResponseSerializer

CACHE_SECONDS = 300


class QuoteView(APIView):
    @extend_schema(
        summary="Route summary and priced offers for a pair of worlds",
        parameters=[
            OpenApiParameter("from", str, required=True),
            OpenApiParameter("to", str, required=True),
            OpenApiParameter("sort", str, enum=["price", "latency", "worst-latency", "tier"]),
            OpenApiParameter("class", str, many=True),
            OpenApiParameter("sector", str, many=True),
            OpenApiParameter("tier", str, many=True),
            OpenApiParameter("kind", str, many=True),
            OpenApiParameter("company", str, many=True),
            OpenApiParameter("env", str, many=True),
            OpenApiParameter("maxLatencyMs", float),
            OpenApiParameter("reroute", bool),
        ],
        responses=QuoteResponseSerializer,
    )
    def get(self, request):
        unknown = set(request.query_params) - ALLOWED_PARAMS
        if unknown:
            raise ValidationError({name: "Unknown parameter." for name in sorted(unknown)})
        query = QuoteQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        result = quote(data["from"], data["to"], query.filters(), data["sort"])
        response = Response(QuoteResponseSerializer(result).data)
        patch_cache_control(response, public=True, max_age=CACHE_SECONDS)
        return response

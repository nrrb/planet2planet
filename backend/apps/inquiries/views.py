from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .serializers import InquiryConfirmationSerializer, InquirySerializer


class InquiryView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "inquiries"

    @extend_schema(
        summary="Store a fictional 'Request this plan' submission",
        request=InquirySerializer,
        responses={201: InquiryConfirmationSerializer},
    )
    def post(self, request):
        serializer = InquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        confirmation = {
            "demo": True,
            "message": (
                "This is a demo, so nothing is sent to any provider. "
                "Your request was saved for the demonstration only."
            ),
        }
        return Response(
            InquiryConfirmationSerializer(confirmation).data, status=status.HTTP_201_CREATED
        )

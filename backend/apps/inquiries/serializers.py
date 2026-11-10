from rest_framework import serializers

from apps.catalog.models import World
from apps.pricing.offers import build_offers
from apps.pricing.quotes import site_day

from .models import Inquiry


class InquirySerializer(serializers.Serializer):
    offer_id = serializers.CharField(max_length=40)
    company_name = serializers.CharField(max_length=120)
    contact = serializers.EmailField(max_length=254)
    expected_traffic = serializers.CharField(max_length=500, allow_blank=True, required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Named "from" and "to" to match the quotes endpoint.
        self.fields["from"] = serializers.PrimaryKeyRelatedField(queryset=World.objects.all())
        self.fields["to"] = serializers.PrimaryKeyRelatedField(queryset=World.objects.all())

    def validate(self, attrs):
        origin, destination = attrs["from"], attrs["to"]
        if origin == destination:
            raise serializers.ValidationError({"to": "Choose two different worlds."})
        known = {
            o.id for o in build_offers(origin.slug, destination.slug, site_day(), with_range=False)
        }
        if attrs["offer_id"] not in known:
            raise serializers.ValidationError(
                {"offer_id": "Unknown offer for this pair of worlds."}
            )
        return attrs

    def create(self, validated_data):
        return Inquiry.objects.create(
            offer_id=validated_data["offer_id"],
            origin=validated_data["from"],
            destination=validated_data["to"],
            company_name=validated_data["company_name"],
            contact=validated_data["contact"],
            expected_traffic=validated_data.get("expected_traffic", ""),
        )


class InquiryConfirmationSerializer(serializers.Serializer):
    demo = serializers.BooleanField()
    message = serializers.CharField()

from rest_framework import serializers

from apps.catalog.models import Company, World

from .constants import ENVIRONMENTS, KINDS, SECTORS, SERVICE_CLASSES, TIERS
from .quotes import SORTS, Filters

ALLOWED_PARAMS = {
    "from", "to", "sort", "class", "sector", "tier", "kind", "company",
    "max_latency_ms", "reroute", "env",
}  # fmt: skip
MAX_LATENCY_MS = 100_000


class MultiChoice(serializers.Field):
    """Repeated or comma-separated values, each from a known list."""

    def __init__(self, choices, **kwargs):
        self.choices = set(choices)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        values = [v for item in data for v in item.split(",") if v]
        unknown = [v for v in values if v not in self.choices]
        if unknown:
            raise serializers.ValidationError(f"Unknown value {unknown[0]!r}.")
        return values


class QuoteQuerySerializer(serializers.Serializer):
    sort = serializers.ChoiceField(choices=SORTS, default="price")
    max_latency_ms = serializers.FloatField(
        min_value=0.001, max_value=MAX_LATENCY_MS, required=False
    )
    reroute = serializers.BooleanField(default=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # "from", "to" and "class" are Python keywords or reserved, so declare them here.
        self.fields["from"] = serializers.CharField()
        self.fields["to"] = serializers.CharField()
        self.fields["class"] = MultiChoice(SERVICE_CLASSES, required=False)
        self.fields["sector"] = MultiChoice(SECTORS, required=False)
        self.fields["tier"] = MultiChoice(TIERS, required=False)
        self.fields["kind"] = MultiChoice(KINDS, required=False)
        self.fields["env"] = MultiChoice(ENVIRONMENTS, required=False)
        self.fields["company"] = MultiChoice(
            Company.objects.values_list("slug", flat=True), required=False
        )

    def to_internal_value(self, data):
        # Query dicts return the last value per key; repeated values are read with getlist.
        lists = {
            name: data.getlist(name)
            for name in ("class", "sector", "tier", "kind", "env", "company")
            if name in data
        }
        plain = {k: data[k] for k in data if k not in lists}
        return super().to_internal_value({**plain, **lists})

    def validate_reroute(self, value):
        return value

    def validate(self, attrs):
        origin, destination = attrs["from"], attrs["to"]
        if origin == destination:
            raise serializers.ValidationError({"to": "Choose two different worlds."})
        errors = {}
        for field_name, slug in (("from", origin), ("to", destination)):
            world = World.objects.filter(pk=slug).first()
            if world is None:
                errors[field_name] = f"Unknown world {slug!r}."
            elif world.subspace_since is None or world.subspace_since > 2380:
                errors[field_name] = f"{world.name} has no subspace constellation yet."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def filters(self) -> Filters:
        data = self.validated_data
        return Filters(
            service_classes=data.get("class", []),
            sectors=data.get("sector", []),
            tiers=data.get("tier", []),
            kinds=data.get("kind", []),
            companies=data.get("company", []),
            environments=data.get("env", []),
            max_latency_ms=data.get("max_latency_ms"),
            reroute=data["reroute"],
        )


class LatencySerializer(serializers.Serializer):
    now = serializers.FloatField()
    min = serializers.FloatField()
    max = serializers.FloatField()


class BreakdownLineSerializer(serializers.Serializer):
    label = serializers.CharField()
    credits = serializers.IntegerField()


class PriceSerializer(serializers.Serializer):
    monthly = serializers.IntegerField()
    setup = serializers.IntegerField()
    currency = serializers.CharField()
    breakdown = BreakdownLineSerializer(many=True)
    terms = serializers.DictField(child=serializers.IntegerField())


class SegmentSerializer(serializers.Serializer):
    company_id = serializers.CharField()
    layer = serializers.CharField()
    node_ids = serializers.ListField(child=serializers.CharField())
    link_ids = serializers.ListField(child=serializers.CharField())
    length_km = serializers.IntegerField()
    latency_ms = serializers.FloatField()


class AddonSerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField()
    company_id = serializers.CharField(allow_null=True)
    monthly = serializers.IntegerField()


class OfferSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    kind = serializers.ChoiceField(choices=["end-to-end", "package"])
    lead_company_id = serializers.CharField()
    owner_id = serializers.CharField(allow_null=True)
    partner_ids = serializers.ListField(child=serializers.CharField())
    plan_ids = serializers.ListField(child=serializers.CharField())
    service_class = serializers.ChoiceField(choices=SERVICE_CLASSES)
    throughput = serializers.IntegerField()
    resilience_tier = serializers.ChoiceField(choices=TIERS)
    conjunction = serializers.ChoiceField(choices=["rerouted", "degraded"])
    environments = serializers.ListField(child=serializers.CharField())
    sectors = serializers.ListField(child=serializers.CharField())
    hops = serializers.IntegerField()
    handoffs = serializers.IntegerField()
    on_network_share = serializers.FloatField()
    latency_ms = LatencySerializer()
    price = PriceSerializer()
    segments = SegmentSerializer(many=True)
    addons = AddonSerializer(many=True)
    badges = serializers.ListField(child=serializers.CharField())


class DirectLatencySerializer(serializers.Serializer):
    direct = serializers.FloatField()
    min = serializers.FloatField()
    max = serializers.FloatField()


class ConjunctionSerializer(serializers.Serializer):
    active_now = serializers.BooleanField()
    next_start = serializers.DateField(allow_null=True)
    next_end = serializers.DateField(allow_null=True)


class RouteSummarySerializer(serializers.Serializer):
    date = serializers.DateField()
    stardate = serializers.CharField()
    distance_km = serializers.IntegerField()
    latency_ms = DirectLatencySerializer()
    regions = serializers.ListField(child=serializers.CharField())
    providers = serializers.IntegerField()
    independent_carriers = serializers.IntegerField()
    conjunction = ConjunctionSerializer()

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = serializers.CharField()
        fields["to"] = serializers.CharField()
        return fields


class QuoteResponseSerializer(serializers.Serializer):
    route = RouteSummarySerializer()
    offers = OfferSerializer(many=True)

from rest_framework import serializers


class NodeSerializer(serializers.Serializer):
    id = serializers.CharField()
    kind = serializers.CharField()
    world = serializers.CharField(allow_null=True)
    region = serializers.CharField(allow_null=True)
    fixed_position = serializers.ListField(
        child=serializers.FloatField(), allow_null=True, help_text="AU; conjunction relays only."
    )


class LinkSerializer(serializers.Serializer):
    id = serializers.CharField()
    layer = serializers.CharField()
    a = serializers.CharField()
    b = serializers.CharField()
    operator = serializers.CharField()
    established = serializers.IntegerField()
    processing_ms = serializers.FloatField()
    hardened = serializers.BooleanField()
    capacity_class = serializers.CharField()
    degraded = serializers.BooleanField(
        help_text="Passes within 0.1 AU of the Sun at the site date."
    )


class OrbitSerializer(serializers.Serializer):
    """A Sun-orbiting world has Keplerian elements; a moon has a circular orbit."""

    kind = serializers.ChoiceField(choices=["heliocentric", "moon"])
    semi_major_axis_au = serializers.FloatField(required=False)
    semi_major_axis_rate = serializers.FloatField(required=False)
    eccentricity = serializers.FloatField(required=False)
    eccentricity_rate = serializers.FloatField(required=False)
    longitude_of_perihelion_deg = serializers.FloatField(required=False)
    longitude_of_perihelion_rate = serializers.FloatField(required=False)
    mean_longitude_deg = serializers.FloatField(required=False)
    mean_longitude_rate = serializers.FloatField(required=False)
    b = serializers.FloatField(required=False, allow_null=True)
    c = serializers.FloatField(required=False, allow_null=True)
    s = serializers.FloatField(required=False, allow_null=True)
    f = serializers.FloatField(required=False, allow_null=True)
    parent = serializers.CharField(required=False)
    orbit_radius_km = serializers.FloatField(required=False)
    period_days = serializers.FloatField(required=False)
    phase_deg = serializers.FloatField(required=False)


class NetworkSerializer(serializers.Serializer):
    site_date = serializers.CharField()
    stardate = serializers.CharField()
    nodes = NodeSerializer(many=True)
    links = LinkSerializer(many=True)
    orbits = serializers.DictField(child=OrbitSerializer())

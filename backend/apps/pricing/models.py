from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.catalog.models import Company


class PlanTemplate(models.Model):
    """What a kind of company sells. Plans are stamped from these (all invented)."""

    kind = models.CharField(max_length=20)
    code = models.SlugField(max_length=60)
    name = models.CharField(max_length=80)
    service_class = models.CharField(max_length=20)
    throughput = models.PositiveIntegerField(help_text="Gigaquads per second.")
    monthly_base = models.FloatField()
    setup_fee = models.FloatField()
    role = models.CharField(max_length=20)
    resilience_tier = models.CharField(max_length=30, default="standard")
    conjunction_reroute = models.BooleanField(default=False)
    standalone = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["kind", "code"], name="unique_template_code"),
        ]

    def __str__(self) -> str:
        return f"{self.kind}: {self.name}"


class Plan(models.Model):
    class Role(models.TextChoices):
        TRANSIT = "transit"
        REGIONAL = "regional"
        ACCESS = "access"
        SPECIALIST = "specialist"
        ADDON = "addon"

    slug = models.CharField(max_length=100, primary_key=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="plans")
    template = models.ForeignKey(PlanTemplate, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=80)
    service_class = models.CharField(max_length=20)
    throughput = models.PositiveIntegerField()
    monthly_base = models.FloatField()
    setup_fee = models.FloatField()
    role = models.CharField(max_length=20, choices=Role.choices)
    resilience_tier = models.CharField(max_length=30, default="standard")
    conjunction_reroute = models.BooleanField(default=False)
    environments = ArrayField(models.CharField(max_length=30), default=list, blank=True)
    sectors = ArrayField(models.CharField(max_length=20), default=list)
    standalone = models.BooleanField(default=True)
    terms = models.JSONField(default=dict, help_text="Contract term to price multiplier.")

    class Meta:
        ordering = ["slug"]

    def __str__(self) -> str:
        return f"{self.company_id}: {self.name}"


class PricingParameter(models.Model):
    key = models.CharField(max_length=80, primary_key=True)
    value = models.FloatField()
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return f"{self.key} = {self.value}"

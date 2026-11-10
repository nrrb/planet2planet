from django.db import models

from apps.catalog.models import World


class Inquiry(models.Model):
    """A fictional 'Request this plan' submission. Nothing is sent anywhere."""

    offer_id = models.CharField(max_length=40)
    origin = models.ForeignKey(World, on_delete=models.CASCADE, related_name="+")
    destination = models.ForeignKey(World, on_delete=models.CASCADE, related_name="+")
    company_name = models.CharField(max_length=120)
    contact = models.EmailField()
    expected_traffic = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "inquiries"

    def __str__(self) -> str:
        return f"{self.company_name}: {self.offer_id}"

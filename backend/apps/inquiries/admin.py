from django.contrib import admin

from .models import Inquiry


@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = ("created_at", "company_name", "offer_id", "origin", "destination")
    readonly_fields = ("created_at",)

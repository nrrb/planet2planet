from django.contrib import admin

from .models import Company, Event, Region, ServiceArea, Source, World


@admin.register(World)
class WorldAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "parent", "region", "population", "subspace_since")
    list_filter = ("type", "region")
    search_fields = ("name", "slug")


class ServiceAreaInline(admin.TabularInline):
    model = ServiceArea
    extra = 0


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "status", "region", "founded", "owner")
    list_filter = ("kind", "status", "region")
    search_fields = ("name", "slug")
    inlines = [ServiceAreaInline]


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("year", "type", "world", "company")
    list_filter = ("type",)
    list_select_related = ("world", "company")


admin.site.register([Region, Source])

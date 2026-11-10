from django.urls import path

from . import views

urlpatterns = [
    path("meta/", views.MetaView.as_view(), name="meta"),
    path("worlds/", views.WorldListView.as_view(), name="world-list"),
    path("worlds/<str:world_id>/", views.WorldDetailView.as_view(), name="world-detail"),
    path("regions/", views.RegionListView.as_view(), name="region-list"),
    path("companies/", views.CompanyListView.as_view(), name="company-list"),
    path("history/", views.HistoryView.as_view(), name="history"),
]

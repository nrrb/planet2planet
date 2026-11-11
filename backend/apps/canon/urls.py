from django.urls import path

from . import views

urlpatterns = [
    path("canon/facts/", views.CanonFactListView.as_view(), name="canon-facts"),
    path("simulation/", views.SimulationView.as_view(), name="simulation"),
    path("simulation/worlds/", views.WorldStatisticsView.as_view(), name="simulation-worlds"),
]

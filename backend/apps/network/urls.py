from django.urls import path

from . import views

urlpatterns = [path("network/", views.NetworkView.as_view(), name="network")]

from django.urls import path

from . import views

urlpatterns = [path("quotes/", views.QuoteView.as_view(), name="quotes")]

from django.urls import path

from . import views

urlpatterns = [path("inquiries/", views.InquiryView.as_view(), name="inquiries")]

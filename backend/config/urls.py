from django.urls import path

from trips import views

urlpatterns = [
    path('api/health/', views.health),
    path('api/plans/', views.plan),
]

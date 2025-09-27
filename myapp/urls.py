from django.urls import path
from . import views

urlpatterns = [
    path('', views.map_view, name='map'),
    #path('api/pins/', views.PinListAPIView.as_view(), name='pin-list'),
    path('api/pins/create/', views.create_pin, name='pin-create'),
    path('api/pins/in_bounds/', views.pins_in_bounds, name='pins-in-bounds'),
]

from django.urls import path
from . import views

urlpatterns = [
    path('', views.map_view, name='map'),
    path('secret/', views.secret_map_view, name='secret_map'),
    #path('api/secret-pins/create/', views.create_secret_pin, name='secret-pin-create'),
    #path('api/pins/', views.PinListAPIView.as_view(), name='pin-list'),
    path('api/pins/create/', views.create_pin, name='pin-create'),
    path('api/pins/in_bounds/', views.pins_in_bounds, name='pins-in-bounds'),
    path('privacy-policy/', views.privacy_policy, name='privacy_policy'),
    path('terms-and-conditions/', views.terms_and_conditions, name='terms_and_conditions'),
    path('api/pins/random/', views.random_pin, name='random-pin'),
]

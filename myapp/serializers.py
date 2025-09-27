from rest_framework import serializers
from .models import Pin

class PinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pin
        fields = ['id', 'title', 'link', 'latitude', 'longitude', 'created_at', 'is_active', 'platform']
        
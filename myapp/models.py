from django.db import models
from django.contrib.auth.models import User


class Pin(models.Model):
    link = models.URLField()

    latitude = models.FloatField()
    longitude = models.FloatField()

    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    platform = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=['latitude']),
            models.Index(fields=['longitude']),
            models.Index(fields=['latitude', 'longitude']),  # Composite index for bounds queries
            models.Index(fields=['is_active']), 
        ]

    def __str__(self):
        return f"{self.link} ({self.latitude}, {self.longitude})"
    
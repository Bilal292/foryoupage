from django.db import models
from django.contrib.auth.models import User


class Pin(models.Model):
    title = models.CharField(max_length=200, default="A link")
    link = models.URLField()

    latitude = models.FloatField()
    longitude = models.FloatField()

    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    platform = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"{self.link} ({self.latitude}, {self.longitude})"
    
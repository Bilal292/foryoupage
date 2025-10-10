from django.db import models
from django.contrib.auth.models import User


class Pin(models.Model):
    latitude = models.FloatField()
    longitude = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=['latitude']),
            models.Index(fields=['longitude']),
            models.Index(fields=['latitude', 'longitude']),  # Composite index for bounds queries
            models.Index(fields=['is_active']), 
        ]

    def __str__(self):
        return f"({self.latitude}, {self.longitude})"
    
class YouTubePin(models.Model):
    pin = models.OneToOneField(Pin, on_delete=models.CASCADE, related_name='youtube_pin')
    url = models.URLField()

    def __str__(self):
        return f"YouTube pin: {self.url}"
    
class TikTokPin(models.Model):
    pin = models.OneToOneField(Pin, on_delete=models.CASCADE, related_name='tiktok_pin')
    url = models.URLField()
    video_id = models.CharField(max_length=50)  # TikTok video ID

    def __str__(self):
        return f"TikTok pin: {self.url}"
    
class InstagramPin(models.Model):
    pin = models.OneToOneField(Pin, on_delete=models.CASCADE, related_name='instagram_pin')
    url = models.URLField()
    shortcode = models.CharField(max_length=255)  # Instagram shortcode

    def __str__(self):
        return f"Instagram pin: {self.url}"
    
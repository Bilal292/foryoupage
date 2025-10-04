from django.contrib import admin
from .models import Pin, YouTubePin, TikTokPin

# Register the Pin model
@admin.register(Pin)
class PinAdmin(admin.ModelAdmin):
    list_display = ('id', 'latitude', 'longitude', 'created_at', 'is_active')
    list_filter = ('is_active', 'created_at')
    search_fields = ('id',)
    readonly_fields = ('created_at',)

# Register the YouTubePin model
@admin.register(YouTubePin)
class YouTubePinAdmin(admin.ModelAdmin):
    list_display = ('pin', 'url')
    search_fields = ('pin__id', 'url')
    readonly_fields = ('pin',)

# Register the TikTokPin model
@admin.register(TikTokPin)
class TikTokPinAdmin(admin.ModelAdmin):
    list_display = ('pin', 'video_id', 'url')
    search_fields = ('pin__id', 'video_id', 'url')
    readonly_fields = ('pin',)
    fieldsets = (
        ('Basic Information', {
            'fields': ('pin', 'url', 'video_id')
        }),
    )
    
from django.contrib import admin
from .models import Pin

@admin.register(Pin)
class PinAdmin(admin.ModelAdmin):
    list_display = ("title", "link", "created_at", "is_active")
    search_fields = ("title", "link")
    list_filter = ("is_active", "created_at")
    
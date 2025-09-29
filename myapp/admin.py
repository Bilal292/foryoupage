from django.contrib import admin
from .models import Pin

@admin.register(Pin)
class PinAdmin(admin.ModelAdmin):
    list_display = ("link", "created_at", "is_active")
    search_fields = ("link", "created_at")
    list_filter = ("is_active", "created_at")
    
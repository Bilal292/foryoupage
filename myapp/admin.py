from django.contrib import admin
from .models import Link, Vote

@admin.register(Link)
class LinkAdmin(admin.ModelAdmin):
    list_display = ("title", "url", "created_at", "is_active", "score")
    search_fields = ("title", "url")
    list_filter = ("is_active", "created_at")
    

@admin.register(Vote)
class VoteAdmin(admin.ModelAdmin):
    list_display = ("link", "user", "value")
    list_filter = ("value", "link")
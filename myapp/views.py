from django.shortcuts import render
from .models import Link

def index(request):
    links = Link.objects.all().order_by("-created_at")
    return render(request, 'index.html', {"links": links})

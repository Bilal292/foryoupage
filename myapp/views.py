from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import Pin
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from .forms import CustomUserCreationForm
import re
import random, requests
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.decorators import api_view
from .serializers import PinSerializer
from django.core.cache import cache
from django_ratelimit.decorators import ratelimit
from datetime import datetime
from django.contrib.admin.views.decorators import staff_member_required


ALLOWED_PLATFORMS = {
    "TikTok": r"tiktok\.com",
    "YouTube Shorts": r"youtube\.com",
    "Instagram Reels": r"instagram\.com",
    "X (Twitter)": r"x\.com|twitter\.com",
}


# ----------------------------
# Utilities
# ----------------------------
def get_link_platform(link):
    platform_detected = None
    for name, pattern in ALLOWED_PLATFORMS.items():
        if re.search(pattern, link, re.IGNORECASE):
            platform_detected = name
            break
    
    return platform_detected

def get_client_ip(_, request):
    """Get client IP"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

def ip_to_location(ip):
    london_lat, london_lon = 51.5074, -0.1278

    if ip in ("127.0.0.1", "::1"):
        return london_lat, london_lon
    
    # Check cache first
    cache_key = f"ip_location_{ip}"
    cached_result = cache.get(cache_key)
    if cached_result:
        return cached_result

    # 60 requests/minute (~2.59M/month)
    url = f"https://freeipapi.com/api/json/{ip}"

    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()

        if 'latitude' in data and 'longitude' in data:
            result = (float(data['latitude']), float(data['longitude']))
             # Cache for 24 hours
            cache.set(cache_key, result, 86400)
            return result
        
    except requests.exceptions.RequestException as e:
        print(f"IP lookup failed (Request Error): {e}")
    except Exception as e:
        print(f"IP lookup failed (General Error): {e}")

    return london_lat, london_lon

def jitter_coordinate(lat, lon, max_offset=0.02):
    """Scatter pins slightly so they don’t overlap exactly"""
    jitter_lat = lat + (random.random() - 0.5) * max_offset
    jitter_lon = lon + (random.random() - 0.5) * max_offset
    return jitter_lat, jitter_lon


# ----------------------------
# API Endpoints
# ----------------------------
class PinListAPIView(generics.ListAPIView):
    queryset = Pin.objects.all()
    serializer_class = PinSerializer

@api_view(['GET'])
def pins_in_bounds(request):
    try:
        sw_lat = float(request.GET.get("sw_lat"))
        sw_lng = float(request.GET.get("sw_lng"))
        ne_lat = float(request.GET.get("ne_lat"))
        ne_lng = float(request.GET.get("ne_lng"))
    except (TypeError, ValueError):
        return Response({"error": "Invalid bounds"}, status=400)

    pins = Pin.objects.filter(
        latitude__gte=sw_lat,
        latitude__lte=ne_lat,
        longitude__gte=sw_lng,
        longitude__lte=ne_lng,
        is_active=True
    )

    serializer = PinSerializer(pins, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@ratelimit(key=get_client_ip, rate='10/m', block=False) 
def create_pin(request):
    if getattr(request, 'limited', False):
        return Response({"error": "Too many posts. Please try again later."}, status=429)
    
    link = request.data.get("link")
    check_only = request.data.get("check_only", False)

    # Client-side coordinates if provided
    client_lat = request.data.get("latitude")
    client_lon = request.data.get("longitude")

    if not link:
        return Response({"error": "Link is required"}, status=400)

    link_platform = get_link_platform(link)
    if not link_platform:
        return Response({"error": "This platform is not allowed."}, status=400)

    if check_only:
        return Response({"message": "Valid link", "platform": link_platform})

    # Use client-side coordinates if available, otherwise fall back to IP-based
    if client_lat and client_lon:
        lat, lon = float(client_lat), float(client_lon)
    else:
        ip = get_client_ip("bruh", request)
        lat, lon = ip_to_location(ip)

    if not lat or not lon:
        return Response({"error": "Could not determine location"}, status=400)

    jitter_lat, jitter_lon = jitter_coordinate(lat, lon)
    pin = Pin.objects.create(
        link=link,
        latitude=jitter_lat,
        longitude=jitter_lon,
        platform=link_platform
    )

    serializer = PinSerializer(pin)
    return Response(serializer.data)


@staff_member_required
@api_view(['POST'])
def create_secret_pin(request):
    if getattr(request, 'limited', False):
        return Response({"error": "Too many posts. Please try again later."}, status=429)
    
    link = request.data.get("link")
    if not link:
        return Response({"error": "Link is required"}, status=400)

    link_platform = get_link_platform(link)
    if not link_platform:
        return Response({"error": "This platform is not allowed."}, status=400)

    # Regions with higher population density (for weighted random selection)
    regions = [
        {"name": "North America", "weight": 7, "min_lat": 15, "max_lat": 75, "min_lon": -170, "max_lon": -50},
        {"name": "Europe", "weight": 6, "min_lat": 35, "max_lat": 70, "min_lon": -10, "max_lon": 40},
        {"name": "Asia", "weight": 10, "min_lat": -10, "max_lat": 55, "min_lon": 40, "max_lon": 150},
        {"name": "Africa", "weight": 4, "min_lat": -35, "max_lat": 35, "min_lon": -20, "max_lon": 50},
        {"name": "South America", "weight": 3, "min_lat": -55, "max_lat": 15, "min_lon": -90, "max_lon": -35},
        {"name": "Oceania", "weight": 2, "min_lat": -50, "max_lat": 0, "min_lon": 110, "max_lon": 180},
    ]
    
    # Calculate total weight
    total_weight = sum(region["weight"] for region in regions)
    
    # Select a region based on weight
    r = random.uniform(0, total_weight)
    cumulative_weight = 0
    selected_region = None
    
    for region in regions:
        cumulative_weight += region["weight"]
        if r <= cumulative_weight:
            selected_region = region
            break
    
    # Generate random coordinates within the selected region
    lat = random.uniform(selected_region["min_lat"], selected_region["max_lat"])
    lon = random.uniform(selected_region["min_lon"], selected_region["max_lon"])

    # Apply jitter to avoid exact overlaps
    jitter_lat, jitter_lon = jitter_coordinate(lat, lon)

    pin = Pin.objects.create(
        link=link,
        latitude=jitter_lat,
        longitude=jitter_lon,
        platform=link_platform
    )

    serializer = PinSerializer(pin)
    return Response(serializer.data)

# ----------------------------
# Template View
# ----------------------------
def map_view(request):
    return render(request, "map.html")


def privacy_policy(request):
    context = {
        'current_date': datetime.now().strftime("%B %d, %Y")
    }
    return render(request, 'privacy_policy.html', context)


def terms_and_conditions(request):
    context = {
        'current_date': datetime.now().strftime("%B %d, %Y")
    }
    return render(request, 'terms_and_conditions.html', context)

@login_required(login_url="map")
def secret_map_view(request):
    return render(request, "secret_map.html")







# ---- USER ACCOUNT VIEWS - NOT IN USE ----
def register(request):
    if request.user.is_authenticated:
        return redirect('post_list') 
    
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            form.save()

            return redirect('login')
    else:
        form = CustomUserCreationForm()

    return render(request, 'account/register.html', {'form': form})

def user_login(request):
    if request.user.is_authenticated:
        return redirect('index') 

    if request.method == 'POST':
        form = AuthenticationForm(data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)

            return redirect('index') 
    else:
        form = AuthenticationForm()

    return render(request, 'account/login.html', {'form': form})

def user_logout(request):
    logout(request)
    return redirect('index')

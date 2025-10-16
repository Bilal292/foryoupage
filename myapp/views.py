from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .models import Pin, YouTubePin, TikTokPin, InstagramPin, RedditPin
import re
import random, requests
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.decorators import api_view
from .serializers import PinSerializer
from django.core.cache import cache
from django_ratelimit.decorators import ratelimit
from datetime import datetime
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
from urllib.parse import urlparse, urlunparse


ALLOWED_PLATFORMS = {
    "tiktok": r"(?:www\.|vm\.|vt\.)?tiktok\.com/",
    "youtube_shorts": r"(?:www\.|m\.)?youtube\.com/shorts/",
    "instagram": r"(?:www\.)?instagram\.com/(p|reel)/",
    "reddit": r"(?:www\.)?reddit\.com/r/[^/]+/(comments|s)/[^/]+/",
}


# ----------------------------
# Utilities
# ----------------------------

def clean_instagram_url(url):
    """Remove query parameters from Instagram URL to get the base URL"""
    
    # Parse the URL
    parsed_url = urlparse(url)
    
    # Reconstruct the URL without query parameters and fragment
    clean_url = urlunparse((
        parsed_url.scheme,  # scheme
        parsed_url.netloc,  # netloc
        parsed_url.path,    # path
        '',                 # params
        '',                 # query
        ''                  # fragment
    ))
    
    return clean_url

def extract_instagram_shortcode(url):
    """Extract Instagram shortcode from URL"""
    # First clean the URL to remove query parameters
    clean_url = clean_instagram_url(url)
    
    # Now extract the shortcode
    match = re.search(r'instagram\.com/(p|reel)/([^/?]+)', clean_url)
    if match:
        return match.group(2)  # Return the shortcode
    return None

def resolve_tiktok_url(url):
    """
    Resolve shortened TikTok URLs to their full URLs
    Returns the full URL or the original URL if resolution fails
    """
    try:
        # Make a HEAD request to follow redirects
        response = requests.get(url, allow_redirects=True, timeout=5)
        final_url = response.url
        
        # Verify it's a TikTok URL
        if 'tiktok.com' in final_url:
            return final_url
        return url
    except requests.exceptions.RequestException:
        return url

def resolve_reddit_url(url):
    """
    Resolve shortened Reddit URLs to their full URLs
    Returns the full URL or the original URL if resolution fails
    """
    try:
        # Make a HEAD request to follow redirects
        response = requests.head(url, allow_redirects=True, timeout=5)
        final_url = response.url
        
        # Verify it's a Reddit URL
        if 'reddit.com' in final_url:
            return final_url
        return url
    except requests.exceptions.RequestException as e:
        # Add logging to debug in production
        print(f"Error resolving Reddit URL: {e}")
        return url

def extract_tiktok_video_id(url):
    """Extract TikTok video/photo ID from URL"""
    # If it's a shortened URL, resolve it first
    if 'vm.tiktok.com' in url or 'vt.tiktok.com' in url:
        url = resolve_tiktok_url(url)
    
    # Extract content ID from both video and photo URL formats
    match = re.search(r'tiktok\.com/@[^/]+/(video|photo)/(\d+)', url)
    if match:
        return match.group(2)  # Return the ID part
    
    return None

def validate_and_sanitize_url(url):
    """Validate and sanitize URL to prevent security issues"""
    validator = URLValidator()
    try:
        validator(url)
    except ValidationError:
        return False
    
    # Additional security checks
    if not url.startswith(('http://', 'https://')):
        return False
    
    return True

def get_link_platform(link):
    # First, check if it's a Reddit short URL and resolve it
    if 'reddit.com/r/' in link and '/s/' in link:
        resolved_link = resolve_reddit_url(link)
        # Now check the resolved link
        link = resolved_link
        print(f"Resolved Reddit URL: {link}")  # Debug logging
    
    platform_detected = None
    for name, pattern in ALLOWED_PLATFORMS.items():
        if re.search(pattern, link, re.IGNORECASE):
            platform_detected = name
            print(f"Detected platform: {name}")  # Debug logging
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
    """Scatter pins slightly so they don't overlap exactly"""
    jitter_lat = lat + (random.random() - 0.5) * max_offset
    jitter_lon = lon + (random.random() - 0.5) * max_offset
    return jitter_lat, jitter_lon


# ----------------------------
# API Endpoints
# ----------------------------

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

    if not link:
        return Response({"error": "Link is required"}, status=400)
    
    # Validate URL format
    if not validate_and_sanitize_url(link):
        return Response({"error": "Invalid URL format"}, status=400)

    link_platform = get_link_platform(link)
    if not link_platform:
        return Response({"error": "This platform is not allowed."}, status=400)

    if check_only:
        platform_display = {
            "youtube_shorts": "YouTube Shorts",
            "tiktok": "TikTok",
            "instagram": "Instagram",
            "reddit": "Reddit"
        }.get(link_platform, "Unknown")
        return Response({"message": "Valid link", "platform": platform_display})

    # Get location from request
    location_type = request.data.get("location_type", "selected")
    
    if location_type == "random":
        # Generate random location (same logic as in create_secret_pin)
        regions = [
            {"name": "North America", "weight": 7, "min_lat": 15, "max_lat": 75, "min_lon": -170, "max_lon": -50},
            {"name": "Europe", "weight": 6, "min_lat": 35, "max_lat": 70, "min_lon": -10, "max_lon": 40},
            {"name": "Asia", "weight": 10, "min_lat": -10, "max_lat": 55, "min_lon": 40, "max_lon": 150},
            {"name": "Africa", "weight": 4, "min_lat": -35, "max_lat": 35, "min_lon": -20, "max_lon": 50},
            {"name": "South America", "weight": 3, "min_lat": -55, "max_lat": 15, "min_lon": -90, "max_lon": -35},
            {"name": "Oceania", "weight": 2, "min_lat": -50, "max_lat": 0, "min_lon": 110, "max_lon": 180},
        ]
        
        total_weight = sum(region["weight"] for region in regions)
        r = random.uniform(0, total_weight)
        cumulative_weight = 0
        selected_region = None
        
        for region in regions:
            cumulative_weight += region["weight"]
            if r <= cumulative_weight:
                selected_region = region
                break
        
        lat = random.uniform(selected_region["min_lat"], selected_region["max_lat"])
        lon = random.uniform(selected_region["min_lon"], selected_region["max_lon"])
    else:
        # Use provided coordinates
        client_lat = request.data.get("latitude")
        client_lon = request.data.get("longitude")
        
        if not client_lat or not client_lon:
            return Response({"error": "Location coordinates are required"}, status=400)
        
        lat, lon = float(client_lat), float(client_lon)

    jitter_lat, jitter_lon = jitter_coordinate(lat, lon)
    
    # Create the generic Pin first
    pin = Pin.objects.create(
        latitude=lat,
        longitude=lon
    )
    
    # Now create the platform-specific pin
    if link_platform == "youtube_shorts":
        youtube_pin = YouTubePin.objects.create(pin=pin, url=link)
        serializer_data = {
            "id": pin.id,
            "latitude": pin.latitude,
            "longitude": pin.longitude,
            "created_at": pin.created_at,
            "is_active": pin.is_active,
            "platform": "YouTube Shorts",
            "url": youtube_pin.url
        }
        return Response(serializer_data)
    elif link_platform == "tiktok":
        # Resolve TikTok URL to full URL
        resolved_url = resolve_tiktok_url(link)
        
        # Extract content ID (works for both videos and photos)
        content_id = extract_tiktok_video_id(resolved_url)
        if not content_id:
            pin.delete()  # Clean up the pin since we couldn't create the platform-specific part
            return Response({"error": "Could not extract TikTok content ID"}, status=400)
        
        # Create TikTokPin with minimal data
        tiktok_pin = TikTokPin.objects.create(
            pin=pin,
            url=resolved_url,
            video_id=content_id
        )
        
        serializer_data = {
            "id": pin.id,
            "latitude": pin.latitude,
            "longitude": pin.longitude,
            "created_at": pin.created_at,
            "is_active": pin.is_active,
            "platform": "TikTok",
            "url": tiktok_pin.url,
            "video_id": tiktok_pin.video_id
        }
        return Response(serializer_data)
    elif link_platform == "instagram":
        # Clean the URL to remove query parameters
        clean_url = clean_instagram_url(link)
        
        # Extract Instagram shortcode
        shortcode = extract_instagram_shortcode(link)
        if not shortcode:
            pin.delete()  # Clean up the pin since we couldn't create the platform-specific part
            return Response({"error": "Could not extract Instagram shortcode"}, status=400)
        
        # Create InstagramPin with the clean URL
        instagram_pin = InstagramPin.objects.create(
            pin=pin,
            url=clean_url,  # Use the clean URL
            shortcode=shortcode
        )
        
        serializer_data = {
            "id": pin.id,
            "latitude": pin.latitude,
            "longitude": pin.longitude,
            "created_at": pin.created_at,
            "is_active": pin.is_active,
            "platform": "Instagram",
            "url": instagram_pin.url,
            "shortcode": instagram_pin.shortcode
        }
        return Response(serializer_data)
    elif link_platform == "reddit":
        # If it's a short URL, resolve it first
        if '/s/' in link:
            resolved_url = resolve_reddit_url(link)
        else:
            resolved_url = link
        
        # Extract post ID from Reddit URL
        match = re.search(r'reddit\.com/r/[^/]+/comments/([^/?]+)', resolved_url)
        post_id = match.group(1) if match else None
        
        if not post_id:
            pin.delete()  # Clean up the pin since we couldn't extract the post ID
            return Response({"error": "Could not extract Reddit post ID"}, status=400)
        
        # Create RedditPin with the resolved URL
        reddit_pin = RedditPin.objects.create(
            pin=pin,
            url=resolved_url,
            post_id=post_id
        )
        
        serializer_data = {
            "id": pin.id,
            "latitude": pin.latitude,
            "longitude": pin.longitude,
            "created_at": pin.created_at,
            "is_active": pin.is_active,
            "platform": "Reddit",
            "url": reddit_pin.url,
            "post_id": reddit_pin.post_id
        }
        return Response(serializer_data)
    
    # If we get here, the platform wasn't handled
    pin.delete()  # Clean up the pin since we couldn't create the platform-specific part
    return Response({"error": "Platform not supported yet"}, status=400)


@api_view(['GET'])
def random_pin(request):
    # Get a random active pin
    pin = Pin.objects.filter(is_active=True).order_by('?').first()
    if not pin:
        return Response({"error": "No pins available"}, status=404)
    
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


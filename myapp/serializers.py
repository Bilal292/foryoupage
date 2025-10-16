from rest_framework import serializers
from .models import Pin, YouTubePin, TikTokPin, InstagramPin, RedditPin

class YouTubePinSerializer(serializers.ModelSerializer):
    class Meta:
        model = YouTubePin
        fields = ['url']

class TikTokPinSerializer(serializers.ModelSerializer):
    class Meta:
        model = TikTokPin
        fields = ['url', 'video_id']

class InstagramPinSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstagramPin
        fields = ['url', 'shortcode']

class RedditPinSerializer(serializers.ModelSerializer):
    class Meta:
        model = RedditPin
        fields = ['url', 'post_id']

class PinSerializer(serializers.ModelSerializer):
    platform_data = serializers.SerializerMethodField()
    platform = serializers.SerializerMethodField()
    
    class Meta:
        model = Pin
        fields = ['id', 'latitude', 'longitude', 'created_at', 'is_active', 'platform', 'platform_data']
    
    def get_platform(self, obj):
        # Check if this pin has a YouTubePin
        if hasattr(obj, 'youtube_pin'):
            return "YouTube Shorts"
        # Check if this pin has a TikTokPin
        elif hasattr(obj, 'tiktok_pin'):
            return "TikTok"
        # Check if this pin has an InstagramPin
        elif hasattr(obj, 'instagram_pin'):
            return "Instagram"
        # Check if this pin has a RedditPin
        elif hasattr(obj, 'reddit_pin'):
            return "Reddit"
        return "Unknown"
    
    def get_platform_data(self, obj):
        # Return platform-specific data
        if hasattr(obj, 'youtube_pin'):
            serializer = YouTubePinSerializer(obj.youtube_pin)
            return serializer.data
        elif hasattr(obj, 'tiktok_pin'):
            serializer = TikTokPinSerializer(obj.tiktok_pin)
            return serializer.data
        elif hasattr(obj, 'instagram_pin'):
            serializer = InstagramPinSerializer(obj.instagram_pin)
            return serializer.data
        elif hasattr(obj, 'reddit_pin'):
            serializer = RedditPinSerializer(obj.reddit_pin)
            return serializer.data
        return {}
        
from django_ratelimit.decorators import ratelimit
from functools import wraps


def ratelimit_by_ip(rate='5/h'):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            # Get the real client IP
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                client_ip = x_forwarded_for.split(',')[0]
            else:
                client_ip = request.META.get('REMOTE_ADDR')
            
            # Apply rate limiting using the client IP
            @ratelimit(key=client_ip, rate=rate)
            def __inner_view(request, *args, **kwargs):
                return view_func(request, *args, **kwargs)
            
            return __inner_view(request, *args, **kwargs)
        return _wrapped_view
    return decorator

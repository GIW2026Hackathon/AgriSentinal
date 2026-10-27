from django.conf import settings
from django.http import HttpResponse


class CorsMiddleware:
    """Small CORS layer so the Vite dev server can call the API with tokens."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS":
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)
        origin = request.headers.get("Origin", "")
        allowed = settings.CORS_ALLOWED_ORIGINS
        if origin and origin in allowed:
            response["Access-Control-Allow-Origin"] = origin
        response["Vary"] = "Origin"
        if not origin or origin not in allowed:
            return response
        response["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Requested-With"
        response["Access-Control-Max-Age"] = "86400"
        return response

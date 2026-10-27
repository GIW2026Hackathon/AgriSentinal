import functools
import hashlib
import json
import secrets
from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .models import AuthToken, User

TOKEN_TTL = timedelta(days=14)


def _token_digest(raw):
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue_token(user):
    AuthToken.objects.filter(user=user).delete()
    raw = secrets.token_urlsafe(32)
    AuthToken.objects.create(
        key=_token_digest(raw),
        user=user,
        expires_at=timezone.now() + TOKEN_TTL,
    )
    return raw


def revoke_token(raw):
    if raw:
        AuthToken.objects.filter(key=_token_digest(raw)).delete()


def bearer_user(request):
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        key = header[7:].strip()
        token = (
            AuthToken.objects.select_related("user")
            .filter(key=_token_digest(key), expires_at__gt=timezone.now())
            .first()
        )
        if token:
            return token.user
    return None


def serialize_user(user):
    name = user.get_full_name().strip() or user.username
    initials = "".join(part[0].upper() for part in name.split()[:2]) or name[:2].upper()
    return {
        "id": user.id,
        "name": name,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email or user.username,
        "phone": user.phone,
        "role": user.role,
        "region": user.region or "Nakuru",
        "farm_name": user.farm_name,
        "lat": user.lat,
        "lng": user.lng,
        "initials": initials,
        "member_since": user.created_at.strftime("%b %Y") if user.created_at else "",
        "member_since_iso": user.created_at.isoformat() if user.created_at else "",
        "today": timezone.localdate().isoformat(),
    }


def read_json(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def _wrap(fn):
    @functools.wraps(fn)
    @csrf_exempt
    def wrapper(request, *args, **kwargs):
        return fn(request, *args, **kwargs)

    return wrapper


def public_api(fn):
    return _wrap(fn)


def require_auth(roles=None):
    def decorator(fn):
        @functools.wraps(fn)
        @csrf_exempt
        def wrapper(request, *args, **kwargs):
            user = bearer_user(request)
            if not user:
                return error("Authentication required", 401)
            if roles and user.role not in roles:
                return error("You do not have access to this resource", 403)
            request.api_user = user
            request.user = user
            return fn(request, *args, **kwargs)

        return wrapper

    return decorator


def display_name(user):
    return user.get_full_name().strip() or user.username


def find_or_create_ussd_user(phone):
    phone = (phone or "").strip()
    user = User.objects.filter(phone=phone).first()
    if user:
        return user, False
    digits = "".join(ch for ch in phone if ch.isdigit())
    suffix = digits[-4:] if len(digits) >= 4 else digits or "0000"
    username = f"ussd_{digits or secrets.token_hex(3)}"
    user = User(
        username=username,
        email=f"{username}@ussd.agrisentinel.africa",
        first_name="USSD",
        last_name=f"Farmer {suffix}",
        role=User.ROLE_FARMER,
        phone=phone,
        region="Nakuru",
        farm_name="USSD smallholder",
        lat=-0.3031,
        lng=36.0800,
    )
    user.set_unusable_password()
    user.save()
    return user, True

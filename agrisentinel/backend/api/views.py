import csv
import io
import json
import secrets
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db.models import Avg, Count, Q, Sum
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from PIL import Image

from . import ml, ussd, weather
from .auth import (
    error,
    issue_token,
    public_api,
    read_json,
    require_auth,
    revoke_token,
    serialize_user,
)
from .crops import CROPS, GRADES, PRICING, REGIONS, crop_label, crop_list
from .models import (
    Booking,
    Facility,
    Notification,
    Scan,
    SupportTicket,
    TicketMessage,
    UssdLog,
    User,
)
from .utils import gen_ref, haversine_km, loss_avoided_kg, make_temp_series


# --------------------------------------------------------------------------- #
# Serializers
# --------------------------------------------------------------------------- #
def media_url(request, field):
    if not field:
        return ""
    try:
        url = field.url
    except ValueError:
        return ""
    return request.build_absolute_uri(url) if request else url


def market_window(scan):
    def last_safe_day(key):
        days = [p.get("day", 0) for p in (scan.degradation or []) if p.get(key, 0) >= 65]
        return max(days) if days else 0

    return {
        "ambient_days_above_65": last_safe_day("ambient"),
        "cold_days_above_65": last_safe_day("cold"),
    }


def scan_payload(scan, request=None, full=False):
    crop = CROPS.get(scan.crop, {})
    created = timezone.localtime(scan.created_at)
    payload = {
        "id": scan.id,
        "ref": scan.ref_code,
        "crop": scan.crop,
        "crop_label": crop.get("label", scan.crop.title()),
        "crop_color": crop.get("color", "#4b7a45"),
        "image": media_url(request, scan.image),
        "quality_score": scan.quality_score,
        "grade": scan.grade,
        "grade_label": scan.grade_label,
        "freshness_pct": scan.freshness_pct,
        "ripeness_pct": scan.ripeness_pct,
        "shelf_ambient_days": scan.shelf_ambient_days,
        "shelf_cold_days": scan.shelf_cold_days,
        "days_gained": scan.days_gained,
        "recommended_mode": scan.recommended_mode,
        "weather_risk": scan.weather_risk,
        "created_at": created.isoformat(),
        "created_label": created.strftime("%d %b %Y"),
        "created_time": created.strftime("%H:%M"),
        "farmer_name": scan.farmer.get_full_name() or scan.farmer.username,
        "location_name": scan.location_name or scan.farmer.region or "Nakuru",
    }
    if full:
        payload.update({
            "farmer": serialize_user(scan.farmer),
            "confidence": scan.confidence,
            "stress_index": scan.stress_index,
            "defects": scan.defects,
            "metrics": scan.metrics,
            "cnn": scan.cnn,
            "weather": scan.weather,
            "degradation": scan.degradation,
            "market_window": market_window(scan),
            "recommendations": scan.recommendations,
            "advisories": scan.advisories,
            "model": scan.model_meta,
            "lat": scan.lat,
            "lng": scan.lng,
        })
    return payload


def facility_payload(facility, lat=None, lng=None, with_series=False):
    series = facility.temp_series or []
    if with_series and not series:
        series = make_temp_series(facility.temperature_c, seed=facility.id or 1)
    payload = {
        "id": facility.id,
        "name": facility.name,
        "code": facility.code,
        "type": facility.type,
        "type_label": facility.get_type_display(),
        "region": facility.region,
        "lat": facility.lat,
        "lng": facility.lng,
        "capacity_kg": facility.capacity_kg,
        "used_kg": facility.used_kg,
        "available_kg": facility.available_kg,
        "utilization": facility.utilization,
        "temperature_c": facility.temperature_c,
        "target_temp_c": facility.target_temp_c,
        "status": facility.status,
        "status_label": facility.get_status_display(),
        "solar_kw": facility.solar_kw,
        "battery_pct": facility.battery_pct,
        "last_service": facility.last_service.isoformat(),
        "service_due": facility.service_due,
        "notes": facility.notes,
        "price_per_kg_day": PRICING.get(facility.type, 3.0),
        "distance_km": haversine_km(lat, lng, facility.lat, facility.lng) if lat is not None else None,
        "temp_series": series if with_series else [],
    }
    return payload


def booking_payload(booking, with_series=False):
    created = timezone.localtime(booking.created_at)
    payload = {
        "id": booking.id,
        "ref": booking.ref_code,
        "crop": booking.crop,
        "crop_label": crop_label(booking.crop),
        "quantity_kg": booking.quantity_kg,
        "start_date": booking.start_date.isoformat(),
        "days": booking.days,
        "status": booking.status,
        "status_label": booking.get_status_display(),
        "total_cost": round(booking.total_cost, 2),
        "notes": booking.notes,
        "created_at": created.isoformat(),
        "created_label": created.strftime("%d %b, %H:%M"),
        "facility": {
            "id": booking.facility.id,
            "name": booking.facility.name,
            "code": booking.facility.code,
            "type": booking.facility.get_type_display(),
            "region": booking.facility.region,
            "temperature_c": booking.facility.temperature_c,
            "temp_series": (booking.facility.temp_series or []) if with_series else [],
        },
        "farmer": {
            "id": booking.farmer.id,
            "name": booking.farmer.get_full_name() or booking.farmer.username,
            "phone": booking.farmer.phone,
            "region": booking.farmer.region,
        },
        "scan_ref": booking.scan.ref_code if booking.scan else None,
        "loss_avoided_kg": loss_avoided_kg(booking),
    }
    return payload


def ticket_payload(ticket, with_messages=False):
    messages = list(ticket.messages.all())
    payload = {
        "id": ticket.id,
        "ref": ticket.ref_code,
        "subject": ticket.subject,
        "category": ticket.category,
        "category_label": ticket.get_category_display(),
        "status": ticket.status,
        "status_label": ticket.get_status_display(),
        "priority": ticket.priority,
        "created_at": timezone.localtime(ticket.created_at).isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
        "message_count": len(messages),
        "last_message": messages[-1].body if messages else "",
        "messages": [
            {
                "id": m.id,
                "sender": m.sender,
                "author_name": m.author_name or m.sender.title(),
                "body": m.body,
                "created_at": timezone.localtime(m.created_at).isoformat(),
                "time_label": timezone.localtime(m.created_at).strftime("%d %b, %H:%M"),
            }
            for m in messages
        ] if with_messages else [],
    }
    return payload


def notification_payload(note):
    return {
        "id": note.id,
        "kind": note.kind,
        "title": note.title,
        "body": note.body,
        "severity": note.severity,
        "read": note.read,
        "created_at": timezone.localtime(note.created_at).isoformat(),
        "time_label": timezone.localtime(note.created_at).strftime("%d %b, %H:%M"),
    }


def _coords_from_region(region):
    for entry in REGIONS:
        if entry["name"].lower() == (region or "").lower():
            return entry["lat"], entry["lng"]
    return -0.3031, 36.0800


# --------------------------------------------------------------------------- #
# Meta / auth
# --------------------------------------------------------------------------- #
LOGIN_MAX_FAILURES = 5
LOGIN_LOCK_SECONDS = 600


def _client_ip(request):
    return request.META.get("REMOTE_ADDR") or "unknown"


def _failure_key(request, email):
    return f"auth-fail:{_client_ip(request)}:{(email or '').lower()}"


def _too_many_failures(request, email):
    return cache.get(_failure_key(request, email), 0) >= LOGIN_MAX_FAILURES


def _record_failure(request, email):
    key = _failure_key(request, email)
    cache.set(key, cache.get(key, 0) + 1, LOGIN_LOCK_SECONDS)


@public_api
def meta(request):
    if request.method != "GET":
        return error("Method not allowed", 405)
    return JsonResponse({
        "crops": crop_list(),
        "regions": REGIONS,
        "pricing": PRICING,
        "grades": GRADES,
        "ussd_code": "*384*74#",
        "model": ml.service_info(),
        "demo_accounts": {
            "farmer": {"email": "amina@farm.africa", "password": "demo1234"},
        },
        "google_client_id": settings.GOOGLE_CLIENT_ID,
    })


@public_api
def health(request):
    payload = {"status": "ok", "database": "ok", "ml": "ok"}
    try:
        User.objects.count()
    except Exception:
        payload["database"] = "error"
    try:
        import requests as http
        r = http.get(f"{ml_url()}/health", timeout=2)
        payload["ml"] = "ok" if r.ok else "degraded"
    except Exception:
        payload["ml"] = "offline"
        payload["status"] = "degraded"
    return JsonResponse(payload)


def ml_url():
    from django.conf import settings
    return settings.ML_SERVICE_URL


@public_api
def register(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    if not email or "@" not in email:
        return error("Enter a valid email address")
    if not name:
        return error("Enter your name")
    try:
        validate_password(password)
    except ValidationError as exc:
        return error(" ".join(exc.messages))
    if User.objects.filter(username=email).exists():
        return error("An account with this email already exists")
    # Public registration is farmer-only. Operator accounts are provisioned by
    # AgriSentinel operations, never through this endpoint.
    role = User.ROLE_FARMER
    region = data.get("region") or "Nakuru"
    lat, lng = _coords_from_region(region)
    first, _, last = name.partition(" ")
    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=first,
        last_name=last,
        role=role,
        phone=(data.get("phone") or "").strip(),
        region=region,
        farm_name=(data.get("farm_name") or "").strip(),
        lat=lat,
        lng=lng,
    )
    Notification.objects.create(
        user=user,
        kind="system",
        title="Welcome to AgriSentinel",
        body="Scan your first harvest to unlock shelf-life forecasts and cold storage.",
        severity="success",
    )
    token = issue_token(user)
    return JsonResponse({"token": token, "user": serialize_user(user)}, status=201)


@public_api
def login(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    if _too_many_failures(request, data.get("email") or ""):
        return error("Too many sign-in attempts. Try again in a few minutes.", 429)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    portal = data.get("portal") if data.get("portal") in ("farmer", "provider", "admin") else "farmer"
    expected_roles = (User.ROLE_FARMER,) if portal == "farmer" else User.STAFF_ROLES
    user = authenticate(request, username=email, password=password)
    if not user or user.role not in expected_roles:
        _record_failure(request, email)
        return error("Invalid email or password", 401)
    cache.delete(_failure_key(request, email))
    token = issue_token(user)
    return JsonResponse({"token": token, "user": serialize_user(user)})


@public_api
def google_login(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    if not settings.GOOGLE_CLIENT_ID:
        return error("Google sign-in is not configured", 503)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    credential = (data.get("credential") or "").strip()
    if not credential:
        return error("Google credential missing")

    ip_key = f"auth-google:{_client_ip(request)}"
    if cache.get(ip_key, 0) >= 20:
        return error("Too many Google sign-in attempts. Try again later.", 429)

    try:
        import requests as http
        resp = http.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": credential},
            timeout=6,
        )
        claims = resp.json()
    except Exception:
        cache.set(ip_key, cache.get(ip_key, 0) + 1, 3600)
        return error("Could not reach Google. Try again shortly.", 502)

    audiences = {settings.GOOGLE_CLIENT_ID}
    if (
        resp.status_code != 200
        or not isinstance(claims, dict)
        or claims.get("aud") not in audiences
        or claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com")
        or str(claims.get("email_verified", "")).lower() != "true"
    ):
        cache.set(ip_key, cache.get(ip_key, 0) + 1, 3600)
        return error("Google sign-in could not be verified", 401)

    email = (claims.get("email") or "").strip().lower()
    subject = (claims.get("sub") or "").strip()
    if not email or not subject:
        return error("Google sign-in could not be verified", 401)

    user = User.objects.filter(google_sub=subject).first()
    if not user:
        user = User.objects.filter(username=email).first()
    if user and user.role != User.ROLE_FARMER:
        return error("Google sign-in is not available for this account.", 403)

    if not user:
        name = (claims.get("name") or email.split("@")[0]).strip()
        first, _, last = name.partition(" ")
        user = User(
            username=email,
            email=email,
            first_name=first[:150],
            last_name=last[:150],
            role=User.ROLE_FARMER,
            region="Nakuru",
            farm_name="",
            lat=-0.3031,
            lng=36.0800,
            google_sub=subject,
        )
        user.set_unusable_password()
        user.save()
        Notification.objects.create(
            user=user,
            kind="system",
            title="Welcome to AgriSentinel",
            body="Scan your first harvest to unlock shelf-life forecasts and cold storage.",
            severity="success",
        )
    elif not user.google_sub:
        user.google_sub = subject
        user.save(update_fields=["google_sub"])

    token = issue_token(user)
    return JsonResponse({"token": token, "user": serialize_user(user)})


@require_auth()
def me(request):
    return JsonResponse({"user": serialize_user(request.api_user)})


@require_auth()
def logout(request):
    token = request.headers.get("Authorization", "")[7:].strip()
    revoke_token(token)
    return JsonResponse({"ok": True})


@require_auth()
def notifications(request):
    notes = request.api_user.notifications.all()[:30]
    unread = request.api_user.notifications.filter(read=False).count()
    return JsonResponse({"notifications": [notification_payload(n) for n in notes], "unread": unread})


@require_auth()
def read_notification(request, notification_id):
    if request.method not in ("POST", "PATCH"):
        return error("Method not allowed", 405)
    note = request.api_user.notifications.filter(id=notification_id).first()
    if not note:
        return error("Notification not found", 404)
    note.read = True
    note.save(update_fields=["read"])
    return JsonResponse({"ok": True})


# --------------------------------------------------------------------------- #
# Farmer overview / scans
# --------------------------------------------------------------------------- #
@require_auth([User.ROLE_FARMER])
def farmer_overview(request):
    farmer = request.api_user
    now = timezone.now()
    cutoff = now - timedelta(days=30)
    scans_qs = farmer.scans.all()
    scans_30 = scans_qs.filter(created_at__gte=cutoff)
    agg = scans_30.aggregate(avg=Avg("quality_score"), count=Count("id"))
    bookings = farmer.bookings.exclude(status=Booking.STATUS_CANCELLED)
    active_bookings = bookings.filter(status__in=[Booking.STATUS_PENDING, Booking.STATUS_ACTIVE])
    kg_stored = active_bookings.aggregate(total=Sum("quantity_kg"))["total"] or 0
    loss_kg = sum(loss_avoided_kg(b) for b in bookings)
    loss_value = sum(loss_avoided_kg(b) * CROPS.get(b.crop, {}).get("market_price_kes", 90) for b in bookings)
    latest = scans_qs.first()

    trend = []
    for s in reversed(list(scans_qs[:10])):
        trend.append({
            "id": s.id,
            "label": timezone.localtime(s.created_at).strftime("%d %b"),
            "score": s.quality_score,
            "crop": crop_label(s.crop),
        })

    forecast = weather.get_forecast(farmer.lat, farmer.lng, farmer.region or "Nakuru")
    tickets_open = farmer.tickets.exclude(status="resolved").count()

    grade_counts = {g: scans_qs.filter(grade=g).count() for g in ["A", "B", "C", "D"]}

    return JsonResponse({
        "farmer": serialize_user(farmer),
        "stats": {
            "total_scans": scans_qs.count(),
            "scans_30d": agg["count"] or 0,
            "avg_quality": round(agg["avg"] or 0),
            "latest_grade": latest.grade if latest else None,
            "latest_quality": latest.quality_score if latest else None,
            "latest_shelf_cold": latest.shelf_cold_days if latest else None,
            "kg_stored": kg_stored,
            "active_bookings": active_bookings.count(),
            "loss_avoided_kg": round(loss_kg, 1),
            "loss_avoided_kes": round(loss_value),
            "open_tickets": tickets_open,
            "grade_counts": grade_counts,
        },
        "recent_scans": [scan_payload(s, request) for s in scans_qs[:4]],
        "quality_trend": trend,
        "bookings": [booking_payload(b) for b in active_bookings[:3]],
        "weather": {
            "location": forecast["location"],
            "current": forecast["current"],
            "summary": forecast["summary"],
            "daily": forecast["daily"][:3],
            "source": forecast["source_label"],
            "updated_at": forecast["updated_at"],
        },
        "advisories": forecast["advisories"][:2],
        "notifications": [notification_payload(n) for n in farmer.notifications.filter(read=False)[:3]],
    })


@require_auth([User.ROLE_FARMER])
def farmer_scans(request):
    if request.method != "GET":
        return error("Method not allowed", 405)
    qs = request.api_user.scans.all()
    crop = request.GET.get("crop")
    if crop:
        qs = qs.filter(crop=crop)
    try:
        limit = min(int(request.GET.get("limit", 50)), 200)
    except ValueError:
        limit = 50
    return JsonResponse({"scans": [scan_payload(s, request) for s in qs[:limit]]})


@require_auth([User.ROLE_FARMER])
def create_scan(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    farmer = request.api_user
    upload = request.FILES.get("image")
    if not upload:
        return error("Attach a photo of the harvested produce")
    if upload.size > 12 * 1024 * 1024:
        return error("Image must be smaller than 12 MB")
    crop = (request.POST.get("crop") or "produce").lower()
    if crop not in CROPS:
        return error("Unsupported crop")
    try:
        image = Image.open(upload)
        image = image.convert("RGB")
        image.thumbnail((1600, 1600))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=88)
        image_bytes = buffer.getvalue()
    except Exception:
        return error("Could not read that image. Use a JPG or PNG photo.")

    try:
        lat = float(request.POST.get("lat") or farmer.lat)
        lng = float(request.POST.get("lng") or farmer.lng)
    except ValueError:
        lat, lng = farmer.lat, farmer.lng
    location_name = request.POST.get("location_name") or farmer.region or "Nakuru"
    forecast = weather.get_forecast(lat, lng, location_name)
    facility_temp = request.POST.get("facility_temp_c") or None
    try:
        facility_temp = float(facility_temp) if facility_temp else None
    except ValueError:
        facility_temp = None

    try:
        analysis = ml.analyse(
            image_bytes,
            upload.name,
            crop,
            weather.ml_weather(forecast),
            request.POST.get("storage_mode", "ambient"),
            facility_temp,
            is_sample=request.POST.get("is_sample", "").lower() in ("1", "true", "yes"),
        )
    except ml.ScanRejected as exc:
        return error(str(exc), 422)
    scan_data = analysis["scan"]
    shelf = analysis["shelf_life"]

    ref = gen_ref("AG")
    while Scan.objects.filter(ref_code=ref).exists():
        ref = gen_ref("AG")
    scan = Scan(
        farmer=farmer,
        crop=crop,
        ref_code=ref,
        original_name=upload.name[:180],
        quality_score=scan_data["quality_score"],
        grade=scan_data["grade"],
        grade_label=scan_data["grade_label"],
        freshness_pct=scan_data["freshness_pct"],
        ripeness_pct=scan_data["ripeness_pct"],
        confidence=scan_data.get("confidence", 0.7),
        defects=scan_data.get("defects", []),
        metrics=scan_data.get("metrics", []),
        cnn=scan_data.get("cnn", {}),
        shelf_ambient_days=shelf["ambient_days"],
        shelf_cold_days=shelf["cold_days"],
        recommended_mode=shelf["recommended_mode"],
        weather_risk=shelf["weather_risk"],
        stress_index=shelf["stress_index"],
        weather={
            "summary": forecast["summary"],
            "current": forecast["current"],
            "daily": forecast["daily"][:3],
            "advisories": forecast["advisories"],
            "source": forecast["source_label"],
            "location": forecast["location"],
        },
        degradation=shelf["degradation"],
        recommendations=analysis.get("recommendations", []),
        advisories=analysis.get("advisories", []),
        model_meta=analysis.get("model", {}),
        location_name=location_name,
        lat=lat,
        lng=lng,
    )
    scan.image.save(f"{ref}.jpg", ContentFile(image_bytes), save=False)
    scan.save()

    Notification.objects.create(
        user=farmer,
        kind="scan",
        title=f"Scan {ref} complete: grade {scan.grade}",
        body=f"{crop_label(crop)} scored {scan.quality_score}/100. Cold storage keeps it for {scan.shelf_cold_days:.0f} days.",
        severity="success" if scan.quality_score >= 70 else "warning",
    )
    payload = scan_payload(scan, request, full=True)
    payload["degraded"] = analysis.get("degraded", False)
    payload["latency_ms"] = analysis.get("latency_ms")
    return JsonResponse({"scan": payload}, status=201)


@require_auth()
def scan_detail(request, scan_id):
    scan = Scan.objects.select_related("farmer").filter(id=scan_id).first()
    if not scan:
        return error("Scan not found", 404)
    if request.api_user.role not in User.STAFF_ROLES and scan.farmer_id != request.api_user.id:
        return error("You do not have access to this scan", 403)
    return JsonResponse({"scan": scan_payload(scan, request, full=True)})


# --------------------------------------------------------------------------- #
# Weather
# --------------------------------------------------------------------------- #
@require_auth()
def weather_view(request):
    if request.method != "GET":
        return error("Method not allowed", 405)
    user = request.api_user
    try:
        lat = float(request.GET.get("lat", user.lat))
        lng = float(request.GET.get("lng", user.lng))
    except ValueError:
        lat, lng = user.lat, user.lng
    name = request.GET.get("name") or user.region or "Nakuru"
    forecast = weather.get_forecast(lat, lng, name, force=request.GET.get("refresh") == "1")
    return JsonResponse(forecast)


@require_auth()
def weather_shelf_impact(request):
    if request.method != "GET":
        return error("Method not allowed", 405)
    user = request.api_user
    crop = (request.GET.get("crop") or "tomato").lower()
    if crop not in CROPS:
        return error("Unsupported crop")
    try:
        quality = float(request.GET.get("quality", 80))
    except ValueError:
        quality = 80
    try:
        facility_temp = float(request.GET["facility_temp"]) if request.GET.get("facility_temp") else None
    except ValueError:
        facility_temp = None
    try:
        lat = float(request.GET.get("lat", user.lat))
        lng = float(request.GET.get("lng", user.lng))
    except ValueError:
        lat, lng = user.lat, user.lng
    forecast = weather.get_forecast(lat, lng, request.GET.get("name") or user.region or "Nakuru")
    payload = weather.ml_weather(forecast)
    body = {"crop": crop, "quality_score": max(1, min(100, quality)), "weather": payload}
    if facility_temp is not None:
        body["facility_temp_c"] = facility_temp
    try:
        import requests as http
        resp = http.post(f"{ml_url()}/shelf-life", json=body, timeout=12)
        resp.raise_for_status()
        data = resp.json()
        data["degraded"] = False
    except Exception:
        from .ml import _fallback
        fallback = _fallback(b"", crop, payload, facility_temp)
        data = {
            "shelf_life": fallback["shelf_life"],
            "advisories": fallback["advisories"],
            "weather_used": fallback.get("weather_used", payload.get("daily", [])),
            "model": fallback["model"],
            "degraded": True,
        }
    data["crop_info"] = CROPS[crop]
    data["weather"] = {
        "location": forecast["location"],
        "current": forecast["current"],
        "daily": forecast["daily"][:3],
        "summary": forecast["summary"],
        "source": forecast["source_label"],
    }
    return JsonResponse(data)


# --------------------------------------------------------------------------- #
# Cold storage
# --------------------------------------------------------------------------- #
@require_auth([User.ROLE_FARMER, *User.STAFF_ROLES])
def storage_facilities(request):
    if request.method != "GET":
        return error("Method not allowed", 405)
    user = request.api_user
    try:
        lat = float(request.GET.get("lat", user.lat))
        lng = float(request.GET.get("lng", user.lng))
    except ValueError:
        lat, lng = user.lat, user.lng
    facilities = list(Facility.objects.all())
    type_filter = request.GET.get("type")
    if type_filter in ("mobile", "solar"):
        facilities = [f for f in facilities if f.type == type_filter]
    data = [facility_payload(f, lat, lng, with_series=request.GET.get("series") == "1") for f in facilities]
    data.sort(key=lambda f: (f["distance_km"] if f["distance_km"] is not None else 999))
    available_kg = sum(f["available_kg"] for f in data)
    total_capacity = sum(f["capacity_kg"] for f in data)
    return JsonResponse({
        "facilities": data,
        "summary": {
            "count": len(data),
            "mobile": len([f for f in data if f["type"] == "mobile"]),
            "solar": len([f for f in data if f["type"] == "solar"]),
            "available_kg": available_kg,
            "capacity_kg": total_capacity,
            "utilization": round(100 * (total_capacity - available_kg) / max(total_capacity, 1), 1),
        },
    })


@require_auth([User.ROLE_FARMER])
def farmer_bookings(request):
    if request.method == "GET":
        qs = request.api_user.bookings.select_related("facility", "scan").all()
        return JsonResponse({"bookings": [booking_payload(b, with_series=True) for b in qs]})
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    facility = Facility.objects.filter(id=data.get("facility_id")).first()
    if not facility:
        return error("Cold storage unit not found")
    crop = (data.get("crop") or "tomato").lower()
    if crop not in CROPS:
        return error("Unsupported crop")
    try:
        quantity = int(data.get("quantity_kg") or 0)
        days = int(data.get("days") or 1)
    except (TypeError, ValueError):
        return error("Quantity and days must be numbers")
    if quantity < 10:
        return error("Minimum booking is 10 kg")
    if quantity > facility.available_kg:
        return error(f"Only {facility.available_kg} kg is available at {facility.name}")
    if not 1 <= days <= 14:
        return error("Book between 1 and 14 days")
    try:
        start = date.fromisoformat(data.get("start_date") or timezone.localdate().isoformat())
    except ValueError:
        start = timezone.localdate()
    scan = None
    if data.get("scan_id"):
        scan = request.api_user.scans.filter(id=data["scan_id"]).first()
    ref = gen_ref("BK")
    while Booking.objects.filter(ref_code=ref).exists():
        ref = gen_ref("BK")
    booking = Booking.objects.create(
        ref_code=ref,
        farmer=request.api_user,
        facility=facility,
        scan=scan,
        crop=crop,
        quantity_kg=quantity,
        start_date=start,
        days=days,
        status=Booking.STATUS_PENDING,
        total_cost=round(quantity * days * PRICING.get(facility.type, 3.0), 2),
        notes=(data.get("notes") or "")[:240],
    )
    Notification.objects.create(
        user=request.api_user,
        kind="storage",
        title=f"Booking {ref} submitted",
        body=f"{quantity}kg {crop_label(crop)} at {facility.name} for {days} day(s). Awaiting provider confirmation.",
        severity="info",
    )
    return JsonResponse({"booking": booking_payload(booking)}, status=201)


@require_auth([User.ROLE_FARMER])
def cancel_booking(request, booking_id):
    if request.method not in ("POST", "PATCH"):
        return error("Method not allowed", 405)
    booking = request.api_user.bookings.filter(id=booking_id).first()
    if not booking:
        return error("Booking not found", 404)
    if booking.status in (Booking.STATUS_COMPLETED, Booking.STATUS_CANCELLED):
        return error("This booking is already closed")
    if booking.status == Booking.STATUS_ACTIVE and booking.facility:
        facility = booking.facility
        facility.used_kg = max(0, facility.used_kg - booking.quantity_kg)
        if facility.status == Facility.STATUS_FULL and facility.used_kg < facility.capacity_kg:
            facility.status = Facility.STATUS_AVAILABLE
        facility.save(update_fields=["used_kg", "status"])
    booking.status = Booking.STATUS_CANCELLED
    booking.save(update_fields=["status"])
    return JsonResponse({"booking": booking_payload(booking)})


# --------------------------------------------------------------------------- #
# Support
# --------------------------------------------------------------------------- #
@require_auth([User.ROLE_FARMER])
def support_tickets(request):
    if request.method == "GET":
        qs = request.api_user.tickets.prefetch_related("messages")
        return JsonResponse({"tickets": [ticket_payload(t) for t in qs]})
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    subject = (data.get("subject") or "").strip()
    message = (data.get("message") or "").strip()
    category = data.get("category") if data.get("category") in dict(SupportTicket.CATEGORY_CHOICES) else "other"
    if len(subject) < 4:
        return error("Add a short subject")
    if len(message) < 8:
        return error("Describe the issue in a little more detail")
    ref = gen_ref("TS")
    while SupportTicket.objects.filter(ref_code=ref).exists():
        ref = gen_ref("TS")
    ticket = SupportTicket.objects.create(
        ref_code=ref,
        farmer=request.api_user,
        subject=subject[:160],
        category=category,
        status="open",
        priority="high" if category in ("quality", "storage") else "normal",
    )
    TicketMessage.objects.create(
        ticket=ticket, sender="farmer",
        author_name=request.api_user.get_full_name(), body=message,
    )
    for staff in User.objects.filter(role__in=User.STAFF_ROLES):
        Notification.objects.create(
            user=staff, kind="support", title=f"New ticket {ref}",
            body=f"{request.api_user.get_full_name()}: {subject}", severity="warning",
        )
    return JsonResponse({"ticket": ticket_payload(ticket, with_messages=True)}, status=201)


@require_auth([User.ROLE_FARMER, *User.STAFF_ROLES])
def ticket_detail(request, ticket_id):
    ticket = SupportTicket.objects.prefetch_related("messages").filter(id=ticket_id).first()
    if not ticket:
        return error("Ticket not found", 404)
    if request.api_user.role not in User.STAFF_ROLES and ticket.farmer_id != request.api_user.id:
        return error("You do not have access to this ticket", 403)
    return JsonResponse({"ticket": ticket_payload(ticket, with_messages=True)})


@require_auth([User.ROLE_FARMER, *User.STAFF_ROLES])
def ticket_messages(request, ticket_id):
    ticket = SupportTicket.objects.filter(id=ticket_id).first()
    if not ticket:
        return error("Ticket not found", 404)
    is_staff = request.api_user.role in User.STAFF_ROLES
    if not is_staff and ticket.farmer_id != request.api_user.id:
        return error("You do not have access to this ticket", 403)
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    body = (data.get("body") or "").strip()
    if len(body) < 2:
        return error("Write a message")
    message = TicketMessage.objects.create(
        ticket=ticket,
        sender="support" if is_staff else "farmer",
        author_name=request.api_user.get_full_name() or ("AgriSentinel support" if is_staff else "Farmer"),
        body=body[:2000],
    )
    ticket.status = "in_progress" if is_staff else "open"
    ticket.priority = "normal"
    ticket.save(update_fields=["status", "priority", "updated_at"])
    if is_staff:
        Notification.objects.create(
            user=ticket.farmer, kind="support", title=f"Reply on {ticket.ref_code}",
            body=body[:200], severity="info",
        )
    else:
        for staff in User.objects.filter(role__in=User.STAFF_ROLES):
            Notification.objects.create(
                user=staff, kind="support", title=f"Farmer reply on {ticket.ref_code}",
                body=body[:200], severity="warning",
            )
    return JsonResponse({
        "message": {
            "id": message.id, "sender": message.sender, "author_name": message.author_name,
            "body": message.body,
            "created_at": timezone.localtime(message.created_at).isoformat(),
            "time_label": timezone.localtime(message.created_at).strftime("%d %b, %H:%M"),
        },
        "ticket": ticket_payload(ticket, with_messages=True),
    }, status=201)


@require_auth(User.STAFF_ROLES)
def provider_ticket_status(request, ticket_id):
    if request.method not in ("PATCH", "POST"):
        return error("Method not allowed", 405)
    ticket = SupportTicket.objects.filter(id=ticket_id).first()
    if not ticket:
        return error("Ticket not found", 404)
    data = read_json(request) or {}
    status = data.get("status")
    if status not in dict(SupportTicket.STATUS_CHOICES):
        return error("Invalid status")
    ticket.status = status
    ticket.save(update_fields=["status", "updated_at"])
    Notification.objects.create(
        user=ticket.farmer, kind="support", title=f"Ticket {ticket.ref_code} {status.replace('_', ' ')}",
        body=ticket.subject, severity="success" if status == "resolved" else "info",
    )
    return JsonResponse({"ticket": ticket_payload(ticket)})


# --------------------------------------------------------------------------- #
# Provider dashboards
# --------------------------------------------------------------------------- #
def _scan_aggregates(scans):
    total = scans.count()
    agg = scans.aggregate(avg=Avg("quality_score"), premium=Count("id", filter=Q(grade="A")),
                          risk=Count("id", filter=Q(quality_score__lt=60)))
    avg = round(agg["avg"] or 0)
    return {
        "total": total,
        "avg_quality": avg,
        "premium_rate": round(100 * (agg["premium"] or 0) / max(total, 1), 1),
        "at_risk_rate": round(100 * (agg["risk"] or 0) / max(total, 1), 1),
    }


def _daily_trend(scans, days=14):
    today = timezone.localdate()
    buckets = {}
    for i in range(days):
        day = today - timedelta(days=days - 1 - i)
        buckets[day.isoformat()] = {"date": day.isoformat(), "label": day.strftime("%d %b"), "scans": 0, "score_sum": 0, "cold": 0}
    for s in scans:
        key = timezone.localtime(s.created_at).date().isoformat()
        if key in buckets:
            buckets[key]["scans"] += 1
            buckets[key]["score_sum"] += s.quality_score
            buckets[key]["cold"] += 1 if s.recommended_mode == "cold" else 0
    out = []
    for item in buckets.values():
        out.append({
            "date": item["date"],
            "label": item["label"],
            "scans": item["scans"],
            "avg_score": round(item["score_sum"] / item["scans"], 1) if item["scans"] else 0,
            "cold": item["cold"],
        })
    return out


@require_auth(User.STAFF_ROLES)
def provider_insights(request):
    now = timezone.now()
    cutoff_30 = now - timedelta(days=30)
    scans = Scan.objects.select_related("farmer")
    scans_30 = scans.filter(created_at__gte=cutoff_30)
    bookings = Booking.objects.exclude(status=Booking.STATUS_CANCELLED)
    bookings_30 = bookings.filter(created_at__gte=cutoff_30)
    stats = _scan_aggregates(scans_30)
    facilities = list(Facility.objects.all())
    capacity = sum(f.capacity_kg for f in facilities)
    used = sum(f.used_kg for f in facilities)
    revenue = bookings.aggregate(total=Sum("total_cost"))["total"] or 0
    loss_kg = sum(loss_avoided_kg(b) for b in bookings)
    loss_value = sum(loss_avoided_kg(b) * CROPS.get(b.crop, {}).get("market_price_kes", 90) for b in bookings)
    cold_gain = [b.scan.days_gained for b in bookings if b.scan]
    ussd_sessions = UssdLog.objects.filter(created_at__gte=cutoff_30).count()
    farmers = User.objects.filter(role=User.ROLE_FARMER)
    active_farmers = scans_30.values("farmer").distinct().count()

    crop_mix = []
    for crop, label in [(c, CROPS[c]["label"]) for c in CROPS]:
        qs = scans_30.filter(crop=crop)
        count = qs.count()
        if count:
            crop_mix.append({
                "crop": crop, "label": label, "count": count,
                "avg_score": round(qs.aggregate(a=Avg("quality_score"))["a"] or 0, 1),
                "color": CROPS[crop]["color"],
            })
    crop_mix.sort(key=lambda x: -x["count"])

    grade_mix = []
    for grade in ["A", "B", "C", "D"]:
        count = scans_30.filter(grade=grade).count()
        grade_mix.append({
            "grade": grade, "count": count,
            "pct": round(100 * count / max(stats["total"], 1), 1),
            "label": GRADES[grade]["label"], "color": GRADES[grade]["color"],
        })

    regions = []
    for region in sorted({(f.region or "Unknown") for f in farmers}):
        qs = scans_30.filter(farmer__region=region)
        count = qs.count()
        if count:
            regions.append({
                "region": region, "scans": count,
                "avg_score": round(qs.aggregate(a=Avg("quality_score"))["a"] or 0, 1),
            })

    top_farmers = []
    for farmer in farmers:
        qs = scans_30.filter(farmer=farmer)
        count = qs.count()
        if count:
            top_farmers.append({
                "id": farmer.id, "name": farmer.get_full_name() or farmer.username,
                "region": farmer.region, "scans": count,
                "avg_score": round(qs.aggregate(a=Avg("quality_score"))["a"] or 0, 1),
                "initials": "".join(p[0] for p in (farmer.get_full_name() or farmer.username).split()[:2]).upper(),
            })
    top_farmers.sort(key=lambda x: (-x["avg_score"], -x["scans"]))
    top_farmers = top_farmers[:5]

    revenue_trend = []
    today = timezone.localdate()
    for i in range(7, -1, -1):
        end = today - timedelta(days=7 * i) + timedelta(days=1)
        start = end - timedelta(days=7)
        qs = bookings.filter(created_at__date__gte=start, created_at__date__lt=end)
        revenue_trend.append({
            "label": start.strftime("%d %b"),
            "revenue": round(qs.aggregate(t=Sum("total_cost"))["t"] or 0),
            "bookings": qs.count(),
            "kg": qs.aggregate(t=Sum("quantity_kg"))["t"] or 0,
        })

    solar_kw = sum(f.solar_kw for f in facilities)
    return JsonResponse({
        "kpis": {
            "total_scans": scans.count(),
            "scans_30d": stats["total"],
            "avg_quality": stats["avg_quality"],
            "premium_rate": stats["premium_rate"],
            "at_risk_rate": stats["at_risk_rate"],
            "farmers": farmers.count(),
            "active_farmers": active_farmers,
            "revenue_kes": round(revenue),
            "revenue_30d_kes": round(bookings_30.aggregate(t=Sum("total_cost"))["t"] or 0),
            "utilization_pct": round(100 * used / max(capacity, 1), 1),
            "capacity_kg": capacity,
            "used_kg": used,
            "loss_avoided_kg": round(loss_kg, 1),
            "loss_avoided_kes": round(loss_value),
            "avg_days_gained": round(sum(cold_gain) / len(cold_gain), 1) if cold_gain else 0,
            "ussd_sessions_30d": ussd_sessions,
            "solar_share_pct": round(100 * sum(f.capacity_kg for f in facilities if f.type == "solar") / max(capacity, 1), 1),
            "co2_avoided_kg": round(solar_kw * 30 * 5 * 0.35, 1),
        },
        "quality_trend": _daily_trend(scans_30, 14),
        "crop_mix": crop_mix,
        "grade_mix": grade_mix,
        "regions": regions,
        "top_farmers": top_farmers,
        "revenue_trend": revenue_trend,
        "utilization": [
            {"name": f.code, "label": f.name, "type": f.type, "utilization": f.utilization,
             "used_kg": f.used_kg, "capacity_kg": f.capacity_kg, "status": f.status}
            for f in sorted(facilities, key=lambda x: -x.utilization)
        ],
        "model": ml.service_info(),
    })


@require_auth(User.STAFF_ROLES)
def provider_fleet(request):
    if request.method == "GET":
        facilities = list(Facility.objects.all())
        total_capacity = sum(f.capacity_kg for f in facilities)
        used = sum(f.used_kg for f in facilities)
        return JsonResponse({
            "units": [facility_payload(f, with_series=True) for f in facilities],
            "summary": {
                "total": len(facilities),
                "mobile": len([f for f in facilities if f.type == "mobile"]),
                "solar": len([f for f in facilities if f.type == "solar"]),
                "capacity_kg": total_capacity,
                "used_kg": used,
                "available_kg": max(0, total_capacity - used),
                "utilization": round(100 * used / max(total_capacity, 1), 1),
                "avg_temp": round(sum(f.temperature_c for f in facilities) / max(len(facilities), 1), 1),
                "avg_battery": round(sum(f.battery_pct for f in facilities) / max(len(facilities), 1)),
                "attention": len([f for f in facilities if f.status in ("maintenance", "offline") or f.battery_pct < 25]),
            },
        })
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    ftype = data.get("type") if data.get("type") in ("mobile", "solar") else "solar"
    region = data.get("region") or "Nakuru"
    lat, lng = _coords_from_region(region)
    name = (data.get("name") or "").strip()
    if len(name) < 3:
        return error("Give the unit a name")
    prefix = "MC" if ftype == "mobile" else "SF"
    number = Facility.objects.filter(code__startswith=prefix).count() + 1
    code = f"{prefix}-{number:02d}"
    while Facility.objects.filter(code=code).exists():
        number += 1
        code = f"{prefix}-{number:02d}"
    try:
        capacity = max(100, int(data.get("capacity_kg") or (1500 if ftype == "mobile" else 3000)))
        target = float(data.get("target_temp_c") or (4.0 if ftype == "mobile" else 3.0))
    except (TypeError, ValueError):
        return error("Capacity and temperature must be numbers")
    facility = Facility.objects.create(
        name=name,
        code=code,
        type=ftype,
        region=region,
        lat=float(data.get("lat") or lat),
        lng=float(data.get("lng") or lng),
        capacity_kg=capacity,
        used_kg=0,
        temperature_c=target,
        target_temp_c=target,
        status=Facility.STATUS_AVAILABLE,
        solar_kw=float(data.get("solar_kw") or (4.5 if ftype == "solar" else 2.5)),
        battery_pct=100,
        last_service=timezone.localdate(),
        notes=(data.get("notes") or "")[:500],
        temp_series=make_temp_series(target, seed=number),
    )
    return JsonResponse({"unit": facility_payload(facility, with_series=True)}, status=201)


@require_auth(User.STAFF_ROLES)
def provider_fleet_detail(request, facility_id):
    facility = Facility.objects.filter(id=facility_id).first()
    if not facility:
        return error("Unit not found", 404)
    if request.method == "GET":
        return JsonResponse({"unit": facility_payload(facility, with_series=True)})
    if request.method != "PATCH":
        return error("Method not allowed", 405)
    data = read_json(request)
    if data is None:
        return error("Invalid JSON")
    if "status" in data and data["status"] in dict(Facility.STATUS_CHOICES):
        facility.status = data["status"]
    if "temperature_c" in data:
        try:
            facility.temperature_c = round(float(data["temperature_c"]), 1)
        except (TypeError, ValueError):
            return error("Temperature must be a number")
    if "target_temp_c" in data:
        try:
            facility.target_temp_c = round(float(data["target_temp_c"]), 1)
        except (TypeError, ValueError):
            return error("Target temperature must be a number")
    if "used_kg" in data:
        try:
            facility.used_kg = max(0, min(facility.capacity_kg, int(data["used_kg"])))
        except (TypeError, ValueError):
            return error("Used capacity must be a number")
    if "battery_pct" in data:
        try:
            facility.battery_pct = max(0, min(100, int(data["battery_pct"])))
        except (TypeError, ValueError):
            return error("Battery must be a number")
    if "notes" in data:
        facility.notes = str(data["notes"])[:500]
    if facility.used_kg >= facility.capacity_kg and facility.status == Facility.STATUS_AVAILABLE:
        facility.status = Facility.STATUS_FULL
    series = list(facility.temp_series or [])
    series.append({"time": timezone.localtime().strftime("%H:%M"), "temp": round(facility.temperature_c, 2)})
    facility.temp_series = series[-24:]
    facility.save()
    return JsonResponse({"unit": facility_payload(facility, with_series=True)})


@require_auth(User.STAFF_ROLES)
def provider_fleet_service(request, facility_id):
    if request.method != "POST":
        return error("Method not allowed", 405)
    facility = Facility.objects.filter(id=facility_id).first()
    if not facility:
        return error("Unit not found", 404)
    facility.last_service = timezone.localdate()
    facility.status = Facility.STATUS_AVAILABLE
    facility.battery_pct = 100
    facility.notes = (facility.notes + " | Serviced " + timezone.localdate().isoformat()).strip(" |")
    facility.temp_series = make_temp_series(facility.temperature_c, seed=facility.id)
    facility.save()
    return JsonResponse({"unit": facility_payload(facility, with_series=True)})


@require_auth(User.STAFF_ROLES)
def provider_farmers(request):
    farmers = User.objects.filter(role=User.ROLE_FARMER).order_by("first_name", "username")
    data = []
    for farmer in farmers:
        scans = farmer.scans.all()
        agg = scans.aggregate(a=Avg("quality_score"))
        last = scans.first()
        bookings = farmer.bookings.exclude(status=Booking.STATUS_CANCELLED)
        active = bookings.filter(status__in=[Booking.STATUS_ACTIVE, Booking.STATUS_PENDING])
        avg_score = round(agg["a"] or 0)
        risk = "high" if (avg_score and avg_score < 62) or farmer.tickets.filter(status="open", priority="high").exists() else "low"
        if not avg_score:
            risk = "new"
        data.append({
            "id": farmer.id,
            "name": farmer.get_full_name() or farmer.username,
            "initials": "".join(p[0] for p in (farmer.get_full_name() or farmer.username).split()[:2]).upper(),
            "email": farmer.email,
            "phone": farmer.phone,
            "region": farmer.region,
            "farm_name": farmer.farm_name,
            "scans": scans.count(),
            "avg_score": avg_score,
            "last_scan": scan_payload(last) if last else None,
            "active_bookings": active.count(),
            "kg_in_storage": active.aggregate(t=Sum("quantity_kg"))["t"] or 0,
            "loss_avoided_kg": round(sum(loss_avoided_kg(b) for b in bookings), 1),
            "risk": risk,
            "member_since": farmer.created_at.strftime("%b %Y"),
            "open_tickets": farmer.tickets.exclude(status="resolved").count(),
        })
    data.sort(key=lambda x: (-x["scans"], x["name"]))
    return JsonResponse({"farmers": data, "total": len(data)})


@require_auth(User.STAFF_ROLES)
def provider_farmer_detail(request, farmer_id):
    farmer = User.objects.filter(id=farmer_id, role=User.ROLE_FARMER).first()
    if not farmer:
        return error("Farmer not found", 404)
    scans = farmer.scans.all()
    bookings = farmer.bookings.exclude(status=Booking.STATUS_CANCELLED)
    return JsonResponse({
        "farmer": serialize_user(farmer),
        "stats": {
            "scans": scans.count(),
            "avg_score": round(scans.aggregate(a=Avg("quality_score"))["a"] or 0),
            "bookings": bookings.count(),
            "kg_stored": bookings.filter(status=Booking.STATUS_ACTIVE).aggregate(t=Sum("quantity_kg"))["t"] or 0,
            "loss_avoided_kg": round(sum(loss_avoided_kg(b) for b in bookings), 1),
            "open_tickets": farmer.tickets.exclude(status="resolved").count(),
        },
        "scans": [scan_payload(s) for s in scans[:8]],
        "bookings": [booking_payload(b) for b in bookings[:6]],
        "tickets": [ticket_payload(t) for t in farmer.tickets.all()[:5]],
    })


@require_auth(User.STAFF_ROLES)
def provider_quality_report(request):
    try:
        days = int(request.GET.get("days", 30))
    except ValueError:
        days = 30
    crop = request.GET.get("crop")
    grade = request.GET.get("grade")
    search = (request.GET.get("q") or "").strip()
    scans = Scan.objects.select_related("farmer").all()
    if days > 0:
        scans = scans.filter(created_at__gte=timezone.now() - timedelta(days=days))
    if crop:
        scans = scans.filter(crop=crop)
    if grade:
        scans = scans.filter(grade=grade)
    if search:
        scans = scans.filter(
            Q(ref_code__icontains=search) | Q(farmer__first_name__icontains=search)
            | Q(farmer__last_name__icontains=search) | Q(crop__icontains=search)
        )
    total = scans.count()
    stats = scans.aggregate(avg=Avg("quality_score"), ambient=Avg("shelf_ambient_days"), cold=Avg("shelf_cold_days"))
    by_crop = []
    for key, info in CROPS.items():
        qs = scans.filter(crop=key)
        count = qs.count()
        if count:
            by_crop.append({
                "crop": key, "label": info["label"], "count": count,
                "avg_score": round(qs.aggregate(a=Avg("quality_score"))["a"] or 0, 1),
                "at_risk": qs.filter(quality_score__lt=60).count(),
                "color": info["color"],
            })
    by_grade = []
    for g, info in GRADES.items():
        count = scans.filter(grade=g).count()
        by_grade.append({
            "grade": g, "label": info["label"], "color": info["color"],
            "count": count, "pct": round(100 * count / max(total, 1), 1),
        })
    defect_counts = {}
    for scan in scans:
        for defect in scan.defects or []:
            label = defect.get("label") if isinstance(defect, dict) else str(defect)
            if label:
                defect_counts[label] = defect_counts.get(label, 0) + 1
    defects = [
        {"label": label, "count": count, "pct": round(100 * count / max(total, 1), 1)}
        for label, count in sorted(defect_counts.items(), key=lambda x: -x[1])[:6]
    ]
    cold_count = scans.filter(recommended_mode="cold").count()
    premium = scans.filter(grade="A").count()
    at_risk = scans.filter(quality_score__lt=60).count()
    summary = {
        "total": total,
        "avg_quality": round(stats["avg"] or 0),
        "premium": premium,
        "premium_rate": round(100 * premium / max(total, 1), 1),
        "at_risk": at_risk,
        "at_risk_rate": round(100 * at_risk / max(total, 1), 1),
        "cold_recommended": cold_count,
        "cold_rate": round(100 * cold_count / max(total, 1), 1),
        "avg_shelf_ambient": round(stats["ambient"] or 0, 1),
        "avg_shelf_cold": round(stats["cold"] or 0, 1),
        "avg_days_gained": round(max(0, (stats["cold"] or 0) - (stats["ambient"] or 0)), 1),
    }
    return JsonResponse({
        "summary": summary,
        "by_crop": sorted(by_crop, key=lambda x: -x["count"]),
        "by_grade": by_grade,
        "defects": defects,
        "trend": _daily_trend(scans, min(days if days > 0 else 30, 30)),
        "scans": [scan_payload(s, request) for s in scans[:200]],
        "filters": {"days": days, "crop": crop or "", "grade": grade or "", "q": search},
    })


@require_auth(User.STAFF_ROLES)
def provider_quality_csv(request):
    days = 60
    try:
        days = int(request.GET.get("days", 60))
    except ValueError:
        pass
    scans = Scan.objects.select_related("farmer").filter(created_at__gte=timezone.now() - timedelta(days=days))
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="agrisentinel-quality-{timezone.localdate().isoformat()}.csv"'
    writer = csv.writer(response)
    writer.writerow(["Scan ref", "Date", "Farmer", "Region", "Crop", "Quality score", "Grade",
                     "Ambient shelf (days)", "Cold shelf (days)", "Recommended storage", "Weather risk"])
    for scan in scans:
        writer.writerow([
            scan.ref_code, timezone.localtime(scan.created_at).strftime("%Y-%m-%d"),
            scan.farmer.get_full_name() or scan.farmer.username, scan.farmer.region,
            crop_label(scan.crop), scan.quality_score, scan.grade,
            scan.shelf_ambient_days, scan.shelf_cold_days, scan.recommended_mode, scan.weather_risk,
        ])
    return response


def _maintenance_alerts():
    alerts = []
    for facility in Facility.objects.all():
        if facility.temperature_c > facility.target_temp_c + 3:
            alerts.append({
                "kind": "temperature", "severity": "high", "unit": facility.code,
                "title": f"{facility.code} running warm",
                "detail": f"{facility.temperature_c} C vs target {facility.target_temp_c} C. Check compressor and door seals.",
            })
        if facility.battery_pct < 25:
            alerts.append({
                "kind": "battery", "severity": "high", "unit": facility.code,
                "title": f"{facility.code} battery low ({facility.battery_pct}%)",
                "detail": "Solar charge is below the safe reserve. Dispatch a technician or switch to grid backup.",
            })
        if facility.service_due:
            alerts.append({
                "kind": "maintenance", "severity": "medium", "unit": facility.code,
                "title": f"{facility.code} service due",
                "detail": f"Last serviced {facility.last_service.isoformat()}. Schedule preventative maintenance.",
            })
        if facility.status == Facility.STATUS_OFFLINE:
            alerts.append({
                "kind": "offline", "severity": "high", "unit": facility.code,
                "title": f"{facility.code} offline",
                "detail": "Unit is not reporting. Confirm power and connectivity.",
            })
    return alerts


def _activity_feed():
    items = []
    for scan in Scan.objects.select_related("farmer")[:6]:
        items.append({
            "type": "scan", "at": scan.created_at,
            "title": f"Quality scan {scan.ref_code}",
            "detail": f"{scan.farmer.get_full_name() or scan.farmer.username} - {crop_label(scan.crop)} scored {scan.quality_score} ({scan.grade})",
        })
    for booking in Booking.objects.select_related("farmer", "facility")[:6]:
        items.append({
            "type": "booking", "at": booking.created_at,
            "title": f"Booking {booking.ref_code} {booking.get_status_display().lower()}",
            "detail": f"{booking.farmer.get_full_name() or booking.farmer.username} - {booking.quantity_kg}kg at {booking.facility.code}",
        })
    for log in UssdLog.objects.all()[:6]:
        items.append({
            "type": "ussd", "at": log.created_at,
            "title": f"USSD {log.phone}",
            "detail": (log.text or "main menu")[:90],
        })
    for ticket in SupportTicket.objects.all()[:5]:
        items.append({
            "type": "support", "at": ticket.created_at,
            "title": f"Ticket {ticket.ref_code}",
            "detail": ticket.subject,
        })
    items.sort(key=lambda x: x["at"], reverse=True)
    for item in items:
        local = timezone.localtime(item["at"])
        item["at"] = local.isoformat()
        item["time_label"] = local.strftime("%d %b, %H:%M")
    return items[:12]


@require_auth(User.STAFF_ROLES)
def provider_operations(request):
    bookings = Booking.objects.select_related("farmer", "facility", "scan")[:60]
    tickets_qs = SupportTicket.objects.select_related("farmer").all()[:20]
    alerts = _maintenance_alerts()
    pending = Booking.objects.filter(status=Booking.STATUS_PENDING).count()
    if pending:
        alerts.insert(0, {
            "kind": "bookings", "severity": "medium", "unit": "",
            "title": f"{pending} storage request{'s' if pending != 1 else ''} awaiting confirmation",
            "detail": "Confirm or decline pending cold storage requests from farmers and USSD users.",
        })
    at_risk = Scan.objects.filter(created_at__gte=timezone.now() - timedelta(days=7), quality_score__lt=60).count()
    if at_risk:
        alerts.append({
            "kind": "quality", "severity": "medium", "unit": "",
            "title": f"{at_risk} at-risk scans this week",
            "detail": "Follow up with farmers whose produce graded D or fell below 60.",
        })
    status_counts = {status: Booking.objects.filter(status=status).count() for status, _ in Booking.STATUS_CHOICES}
    ussd_volume = []
    for i in range(6, -1, -1):
        day = timezone.localdate() - timedelta(days=i)
        ussd_volume.append({
            "date": day.isoformat(),
            "label": day.strftime("%a"),
            "sessions": UssdLog.objects.filter(created_at__date=day).count(),
        })
    return JsonResponse({
        "bookings": [booking_payload(b, with_series=True) for b in bookings],
        "status_counts": status_counts,
        "alerts": alerts[:8],
        "maintenance": [
            facility_payload(f, with_series=True)
            for f in Facility.objects.filter(
                Q(status=Facility.STATUS_MAINTENANCE) | Q(last_service__lte=timezone.localdate() - timedelta(days=45))
            )
        ],
        "ussd_logs": [
            {
                "id": log.id, "phone": log.phone, "text": log.text, "response": log.response,
                "user": (log.user.get_full_name() or log.user.username) if log.user else "Unknown",
                "created_at": timezone.localtime(log.created_at).isoformat(),
                "time_label": timezone.localtime(log.created_at).strftime("%d %b, %H:%M"),
            }
            for log in UssdLog.objects.select_related("user")[:30]
        ],
        "ussd_volume": ussd_volume,
        "tickets": [ticket_payload(t) for t in tickets_qs],
        "activity": _activity_feed(),
    })


@require_auth(User.STAFF_ROLES)
def provider_booking_status(request, booking_id):
    if request.method not in ("PATCH", "POST"):
        return error("Method not allowed", 405)
    booking = Booking.objects.select_related("facility", "farmer").filter(id=booking_id).first()
    if not booking:
        return error("Booking not found", 404)
    data = read_json(request) or {}
    new_status = data.get("status")
    if new_status not in dict(Booking.STATUS_CHOICES):
        return error("Invalid booking status")
    old_status = booking.status
    facility = booking.facility
    if new_status == Booking.STATUS_ACTIVE and old_status != Booking.STATUS_ACTIVE:
        if facility.available_kg < booking.quantity_kg:
            return error(f"Not enough capacity at {facility.code}")
        facility.used_kg += booking.quantity_kg
        if facility.used_kg >= facility.capacity_kg:
            facility.status = Facility.STATUS_FULL
        facility.save(update_fields=["used_kg", "status"])
    if new_status in (Booking.STATUS_COMPLETED, Booking.STATUS_CANCELLED) and old_status == Booking.STATUS_ACTIVE:
        facility.used_kg = max(0, facility.used_kg - booking.quantity_kg)
        if facility.status == Facility.STATUS_FULL and facility.used_kg < facility.capacity_kg:
            facility.status = Facility.STATUS_AVAILABLE
        facility.save(update_fields=["used_kg", "status"])
    booking.status = new_status
    if new_status == Booking.STATUS_COMPLETED:
        booking.completed_at = timezone.now()
    booking.save(update_fields=["status", "completed_at"])
    Notification.objects.create(
        user=booking.farmer, kind="storage",
        title=f"Booking {booking.ref_code} {booking.get_status_display().lower()}",
        body=f"{booking.quantity_kg}kg at {booking.facility.name}.",
        severity="success" if new_status in (Booking.STATUS_ACTIVE, Booking.STATUS_COMPLETED) else "warning",
    )
    return JsonResponse({"booking": booking_payload(booking, with_series=True)})


@require_auth(User.STAFF_ROLES)
def provider_ussd_simulate(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = read_json(request) or {}
    phone = (data.get("phone") or "+254700000001").strip()
    text = (data.get("text") or "").strip()
    session_id = data.get("session_id") or f"SIM-{secrets.token_hex(3).upper()}"
    response, user = ussd.process(text, phone, session_id)
    return JsonResponse({
        "response": response,
        "phone": phone,
        "session_id": session_id,
        "ended": response.startswith("END"),
        "user": {
            "id": user.id,
            "name": user.get_full_name() or user.username,
            "region": user.region,
        } if user else None,
    })


@require_auth(User.STAFF_ROLES)
def provider_ussd_logs(request):
    logs = UssdLog.objects.select_related("user")[:80]
    return JsonResponse({
        "logs": [
            {
                "id": log.id, "phone": log.phone, "text": log.text, "response": log.response,
                "session_id": log.session_id,
                "user": (log.user.get_full_name() or log.user.username) if log.user else "Unknown",
                "created_at": timezone.localtime(log.created_at).isoformat(),
                "time_label": timezone.localtime(log.created_at).strftime("%d %b, %H:%M"),
            }
            for log in logs
        ]
    })


# --------------------------------------------------------------------------- #
# Public USSD webhook (Africa's Talking compatible)
# --------------------------------------------------------------------------- #
@public_api
def ussd_webhook(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    if request.content_type == "application/json":
        data = read_json(request) or {}
        phone = data.get("phoneNumber") or data.get("phone") or ""
        text = data.get("text") or ""
        session_id = data.get("sessionId") or ""
    else:
        phone = request.POST.get("phoneNumber", "")
        text = request.POST.get("text", "")
        session_id = request.POST.get("sessionId", "")
    if not phone:
        return HttpResponse("END Missing phone number", content_type="text/plain")
    response, _ = ussd.process(text, phone, session_id)
    return HttpResponse(response, content_type="text/plain")

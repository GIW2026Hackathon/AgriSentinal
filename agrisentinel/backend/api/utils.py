import math
import random
import secrets
import string
from datetime import timedelta

from django.utils import timezone


def gen_ref(prefix="AG", length=5):
    alphabet = string.ascii_uppercase + string.digits
    body = "".join(secrets.choice(alphabet) for _ in range(length))
    return f"{prefix}-{body}"


def haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return None
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)), 1)


def make_temp_series(base=3.0, hours=24, seed=None, amplitude=0.6):
    rng = random.Random(seed)
    now = timezone.localtime()
    series = []
    for i in range(hours):
        stamp = now - timedelta(hours=hours - i - 1)
        drift = math.sin((i / hours) * 2 * math.pi) * amplitude
        series.append({
            "time": stamp.strftime("%H:%M"),
            "temp": round(base + drift + rng.uniform(-0.18, 0.18), 2),
        })
    return series


def loss_avoided_kg(booking):
    ratio = 0.15
    scan = booking.scan
    if scan and scan.shelf_ambient_days:
        ratio = min(0.28, scan.days_gained / max(scan.shelf_ambient_days + scan.days_gained, 1))
    return round(booking.quantity_kg * ratio, 1)

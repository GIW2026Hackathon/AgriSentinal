"""Seed AgriSentinel with a rich demo dataset.

    python manage.py seed_demo --reset
"""

import io
import json
import math
import random
import shutil
import sys
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone

from api.crops import CROPS, GRADES, PRICING, REGIONS
from api.models import (
    Booking, Facility, Notification, Scan, SupportTicket, TicketMessage, User, UssdLog,
)
from api.utils import make_temp_series

ROOT = Path(settings.BASE_DIR).parent
sys.path.insert(0, str(ROOT / "ml_service"))
try:
    from synth import render_produce
except Exception:  # pragma: no cover - seeding still works with a plain image
    render_produce = None

rng = random.Random(20261026)

FARMERS = [
    ("Amina", "Njeri", "Nakuru", "Rift Valley Greens", "amina@farm.africa", "+254712300401"),
    ("John", "Kamau", "Meru", "Maua Fresh Farm", "john@farm.africa", "+254713300402"),
    ("Grace", "Otieno", "Kisumu", "Lakeview Horticulture", "grace.otieno@farm.africa", "+254714300403"),
    ("Peter", "Mwangi", "Kiambu", "Green Ridge Farm", "peter.mwangi@farm.africa", "+254715300404"),
    ("Faith", "Wambui", "Nyeri", "Aberdare Fresh", "faith.wambui@farm.africa", "+254716300405"),
    ("Samuel", "Kiprono", "Eldoret", "Highland Produce", "samuel.kiprono@farm.africa", "+254717300406"),
    ("Mary", "Atieno", "Kisumu", "Kano Plains Growers", "mary.atieno@farm.africa", "+254718300407"),
    ("David", "Mutua", "Machakos", "Athi River Farms", "david.mutua@farm.africa", "+254719300408"),
    ("Esther", "Nyambura", "Kiambu", "Limuru Greens", "esther.nyambura@farm.africa", "+254710300409"),
    ("Joseph", "Kiptoo", "Eldoret", "Kaptagat Fields", "joseph.kiptoo@farm.africa", "+254711300410"),
    ("Lucy", "Achieng", "Kisumu", "Nyando Fresh", "lucy.achieng@farm.africa", "+254720300411"),
    ("Daniel", "Njoroge", "Nakuru", "Menengai Farms", "daniel.njoroge@farm.africa", "+254721300412"),
    ("Sarah", "Chebet", "Eldoret", "Turbo Highlands", "sarah.chebet@farm.africa", "+254722300413"),
    ("Brian", "Omondi", "Kisumu", "Muhoroni Produce", "brian.omondi@farm.africa", "+254723300414"),
    ("Nancy", "Wanjiku", "Nyeri", "Karatina Greens", "nancy.wanjiku@farm.africa", "+254724300415"),
    ("Kevin", "Maina", "Kiambu", "Ruiru Urban Farm", "kevin.maina@farm.africa", "+254725300416"),
    ("Mercy", "Wairimu", "Naivasha", "Lake Naivasha Growers", "mercy.wairimu@farm.africa", "+254726300417"),
    ("Victor", "Kilonzo", "Machakos", "Kangundo Farms", "victor.kilonzo@farm.africa", "+254727300418"),
    ("Beatrice", "Wanjala", "Naivasha", "Mirera Fresh", "beatrice.wanjala@farm.africa", "+254728300419"),
    ("Dennis", "Githinji", "Nyeri", "Nyeri Ridge Farm", "dennis.githinji@farm.africa", "+254729300420"),
    ("Christine", "Moraa", "Kisumu", "Ahero Horticulture", "christine.moraa@farm.africa", "+254730300421"),
    ("Paul", "Mwenda", "Meru", "Chuka Fresh Produce", "paul.mwenda@farm.africa", "+254731300422"),
    ("Janet", "Wanjala", "Nakuru", "Gilgil Growers", "janet.wanjala@farm.africa", "+254732300423"),
    ("Isaiah", "Kariuki", "Nyeri", "Othaya Coffee & Produce", "isaiah.kariuki@farm.africa", "+254733300424"),
]

FACILITIES = [
    {"code": "SF-01", "name": "Nakuru Market Solar Freezer", "type": "solar", "region": "Nakuru",
     "capacity_kg": 3000, "used_kg": 1850, "temperature_c": 2.9, "target_temp_c": 3.0, "solar_kw": 6.0,
     "battery_pct": 82, "status": "available", "service_days": 20,
     "notes": "Flagship aggregation point beside Nakuru wholesale market."},
    {"code": "SF-02", "name": "Kiambu Aggregation Hub", "type": "solar", "region": "Kiambu",
     "capacity_kg": 2400, "used_kg": 1320, "temperature_c": 3.4, "target_temp_c": 3.0, "solar_kw": 5.2,
     "battery_pct": 64, "status": "available", "service_days": 52,
     "notes": "Dual-chamber unit serving Limuru and Ruiru cooperatives."},
    {"code": "SF-03", "name": "Meru Cool Collective", "type": "solar", "region": "Meru",
     "capacity_kg": 1800, "used_kg": 820, "temperature_c": 2.6, "target_temp_c": 3.0, "solar_kw": 4.4,
     "battery_pct": 91, "status": "available", "service_days": 12,
     "notes": "Avocado and banana pre-cooling for export aggregators."},
    {"code": "SF-04", "name": "Naivasha Lakeside Freezer", "type": "solar", "region": "Naivasha",
     "capacity_kg": 1500, "used_kg": 410, "temperature_c": 4.1, "target_temp_c": 3.5, "solar_kw": 3.6,
     "battery_pct": 38, "status": "available", "service_days": 31,
     "notes": "Serves flower-farm surplus and vegetable smallholders."},
    {"code": "MC-01", "name": "Mobile Cold Unit - Nakuru", "type": "mobile", "region": "Nakuru",
     "capacity_kg": 1200, "used_kg": 640, "temperature_c": 4.3, "target_temp_c": 4.0, "solar_kw": 3.2,
     "battery_pct": 76, "status": "in_transit", "service_days": 18,
     "notes": "On route to Bahati collection point, ETA 40 minutes."},
    {"code": "MC-02", "name": "Mobile Cold Unit - Eldoret", "type": "mobile", "region": "Eldoret",
     "capacity_kg": 1000, "used_kg": 560, "temperature_c": 5.2, "target_temp_c": 4.0, "solar_kw": 3.0,
     "battery_pct": 54, "status": "available", "service_days": 26,
     "notes": "Parked at Eldoret produce market for evening bookings."},
    {"code": "MC-03", "name": "Mobile Cold Unit - Machakos", "type": "mobile", "region": "Machakos",
     "capacity_kg": 900, "used_kg": 0, "temperature_c": 4.8, "target_temp_c": 4.0, "solar_kw": 2.8,
     "battery_pct": 22, "status": "maintenance", "service_days": 61,
     "notes": "Compressor service and solar controller replacement in progress."},
    {"code": "SF-05", "name": "Machakos Solar Freezer", "type": "solar", "region": "Machakos",
     "capacity_kg": 1600, "used_kg": 1180, "temperature_c": 7.4, "target_temp_c": 3.0, "solar_kw": 4.0,
     "battery_pct": 24, "status": "available", "service_days": 40,
     "notes": "Temperature drifting during afternoon peak. Technician follow-up flagged."},
]

CROPS_WEIGHTED = ["tomato"] * 8 + ["kale"] * 7 + ["avocado"] * 5 + ["mango"] * 4 + ["potato"] * 3 + ["onion"] * 3 + ["cabbage"] * 4 + ["banana"] * 3


def _ref(prefix, taken):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        candidate = prefix + "-" + "".join(rng.choice(alphabet) for _ in range(5))
        if candidate not in taken:
            taken.add(candidate)
            return candidate


def _coords(region):
    base = next((r for r in REGIONS if r["name"] == region), REGIONS[0])
    return round(base["lat"] + rng.uniform(-0.035, 0.035), 4), round(base["lng"] + rng.uniform(-0.035, 0.035), 4)


def _grade(score):
    for key, info in GRADES.items():
        if score >= info["min"]:
            return key, info["label"]
    return "D", GRADES["D"]["label"]


def _weather_snapshot():
    daily = []
    today = timezone.localdate()
    for i in range(3):
        day = today + timedelta(days=i)
        tmax = round(rng.uniform(24, 33), 1)
        tmin = round(tmax - rng.uniform(7, 11), 1)
        daily.append({
            "date": day.isoformat(),
            "day": day.strftime("%a"),
            "day_full": day.strftime("%A"),
            "temp_max": tmax,
            "temp_min": tmin,
            "humidity": rng.randint(52, 88),
            "rain_mm": round(rng.choice([0, 0, 0, 0.4, 2.0, 6.0, 12.0]), 1),
            "precip_prob": rng.randint(5, 80),
            "wind_kph": round(rng.uniform(5, 26), 1),
            "solar": round(rng.uniform(14, 25), 1),
            "uv": round(rng.uniform(5, 11), 1),
            "condition": rng.choice(["Sunny", "Partly cloudy", "Light showers", "Overcast"]),
            "icon": rng.choice(["sun", "cloud-sun", "rain", "cloud"]),
            "sunrise": "06:22",
            "sunset": "18:41",
        })
    return {
        "summary": {
            "rain_total_mm": round(sum(d["rain_mm"] for d in daily), 1),
            "max_temp_c": max(d["temp_max"] for d in daily),
            "avg_temp_c": round(sum((d["temp_max"] + d["temp_min"]) / 2 for d in daily) / 3, 1),
            "risk": rng.choice(["low", "moderate", "moderate", "high"]),
            "headline": rng.choice(["Stable harvest window", "Plan around the heat", "Protect your harvest"]),
            "source": "seed-data",
        },
        "current": {
            "temp_c": round(rng.uniform(20, 28), 1),
            "feels_like_c": round(rng.uniform(21, 29), 1),
            "humidity": rng.randint(48, 84),
            "rain_mm": 0,
            "wind_kph": round(rng.uniform(6, 20), 1),
            "uv": round(rng.uniform(5, 10), 1),
            "condition": "Partly cloudy",
            "icon": "cloud-sun",
        },
        "daily": daily,
        "advisories": [
            {"level": "medium", "title": "Warm afternoon expected",
             "detail": "Temperature peaks above 30 C. Harvest early and keep crates shaded before transport."}
        ],
        "source": "AgriSentinel demo forecast",
    }


def _defects(score, rng):
    defects = []
    if score < 58:
        defects.append({"label": "Surface blemishes / bruising", "confidence": 0.77, "severity": "high"})
        defects.append({"label": "Uneven colour development", "confidence": 0.61, "severity": "medium"})
    elif score < 72:
        defects.append({"label": "Minor skin marks", "confidence": 0.52, "severity": "low"})
        defects.append({"label": "Uneven colour development", "confidence": 0.43, "severity": "low"})
    elif rng.random() < 0.35:
        defects.append({"label": "Minor skin marks", "confidence": 0.38, "severity": "low"})
    else:
        defects.append({"label": "No visible defects", "confidence": 0.88, "severity": "none"})
    return defects


def _metrics(score, rng):
    return [
        {"key": "colour", "label": "Colour uniformity", "value": max(8, min(99, score + rng.randint(-8, 6)))},
        {"key": "surface", "label": "Surface integrity", "value": max(8, min(99, score + rng.randint(-10, 8)))},
        {"key": "firmness", "label": "Firmness estimate", "value": max(8, min(99, score + rng.randint(-6, 4)))},
        {"key": "moisture", "label": "Moisture retention", "value": max(8, min(99, score + rng.randint(-4, 8)))},
        {"key": "vitality", "label": "Freshness vitality", "value": max(8, min(99, score + rng.randint(-5, 5)))},
    ]


def _shelf(scan_dict, crop, score):
    weather_data = scan_dict["weather"]["daily"]
    info = CROPS[crop]
    heat = sum(max(0, d["temp_max"] - info["optimal_temp_c"]) for d in weather_data) / 3
    humidity = sum(max(0, d["humidity"] - 70) for d in weather_data) / 3
    rain = sum(d["rain_mm"] for d in weather_data)
    stress = min(1.0, (heat * 0.045 + humidity * 0.012 + rain * 0.007) / 1.6)
    ambient = info["base_shelf_days"] * (score / 100) ** 1.3 * math.exp(-stress)
    cold = ambient * info["cold_multiplier"] * rng.uniform(0.86, 0.98)
    ambient = max(0.8, ambient)
    cold = max(ambient * 1.25, cold)
    risk = "high" if stress > 0.55 else "moderate" if stress > 0.25 else "low"
    curve = []
    for day in range(6):
        amb = 35 + (score - 35) * math.exp(-day * math.log(max(score, 38) / 35) / max(ambient, 0.7))
        cld = 35 + (score - 35) * math.exp(-day * math.log(max(score, 38) / 35) / max(cold, 0.7))
        curve.append({
            "day": day,
            "ambient": round(min(100, amb), 1),
            "cold": round(min(100, cld), 1),
            "ambient_state": "safe" if amb >= 65 else "watch" if amb >= 45 else "risk",
            "cold_state": "safe" if cld >= 65 else "watch",
        })
    return round(ambient, 1), round(cold, 1), stress, risk, curve


def _recommendations(crop, score, grade, ambient, cold, risk, defects):
    info = CROPS[crop]
    recs = []
    if score < 65:
        recs.append({"title": "Sell into the local market", "priority": "high",
                     "detail": "Premium grading is unlikely. Target nearby markets or processing before quality drops further."})
    else:
        recs.append({"title": "Target premium buyers", "priority": "medium",
                     "detail": f"Grade {grade} meets retail thresholds. Keep the cold chain intact to protect the premium."})
    recs.append({
        "title": f"Book cold storage within {max(2, int(ambient * 0.5))} hours",
        "priority": "high" if ambient <= 3 else "medium",
        "detail": f"Cold storage extends shelf life from {ambient:.0f} to {cold:.0f} days at about {info['optimal_temp_c']} C.",
    })
    if risk in ("high", "extreme"):
        recs.append({"title": "Weather-driven loss risk", "priority": "high",
                     "detail": "The 3-day forecast sharply shortens shelf life. Dispatch or cool before the warmest window."})
    recs.append({"title": "Share the USSD code", "priority": "low",
                 "detail": "Field agents can check this lot on *384*74# using the scan reference."})
    return recs[:4]


def _render_image(crop, quality, seed):
    if render_produce is None:
        from PIL import Image
        img = Image.new("RGB", (320, 320), (215, 205, 180))
        return img
    ripeness = 0.5 + (quality / 100) * 0.45 + rng.uniform(-0.08, 0.08)
    blemish = max(0.02, min(0.95, (97 - quality) / 70 + rng.uniform(-0.05, 0.08)))
    wilt = max(0.01, min(0.8, (95 - quality) / 90 + rng.uniform(-0.05, 0.06)))
    return render_produce(crop, ripeness, blemish, wilt, seed=seed, size=340)


class Command(BaseCommand):
    help = "Create demo users, scans, facilities, bookings, tickets, USSD logs and notifications."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo data first")

    def handle(self, *args, **options):
        if options["reset"]:
            User.objects.all().delete()
            Facility.objects.all().delete()
            Scan.objects.all().delete()
            UssdLog.objects.all().delete()
            media_scans = Path(settings.MEDIA_ROOT) / "scans"
            if media_scans.exists():
                shutil.rmtree(media_scans, ignore_errors=True)
            self.stdout.write(self.style.WARNING("Existing data cleared."))

        if User.objects.filter(username__in=("grace@agrisentinel.africa", "admin@agrisentinel.africa")).exists():
            self.stdout.write(self.style.WARNING("Demo data already exists. Use --reset to rebuild."))
            return

        from django.contrib.auth.hashers import make_password

        password_hash = make_password("demo1234")
        now = timezone.now()

        admin = User.objects.create(
            username="admin@agrisentinel.africa", email="admin@agrisentinel.africa",
            first_name="System", last_name="Admin", role=User.ROLE_ADMIN,
            phone="+254720100101", region="Nakuru", farm_name="AgriSentinel Admin",
            lat=-0.3031, lng=36.0800, password=password_hash, is_staff=True, is_superuser=True,
        )

        provider = User.objects.create(
            username="grace@agrisentinel.africa", email="grace@agrisentinel.africa",
            first_name="Grace", last_name="Wanjiru", role=User.ROLE_PROVIDER,
            phone="+254720100100", region="Nakuru", farm_name="AgriSentinel Operations",
            lat=-0.3031, lng=36.0800, password=password_hash, is_staff=True,
        )

        farmers = []
        for idx, (first, last, region, farm, email, phone) in enumerate(FARMERS):
            lat, lng = _coords(region)
            farmer = User.objects.create(
                username=email, email=email, first_name=first, last_name=last,
                role=User.ROLE_FARMER, phone=phone, region=region, farm_name=farm,
                lat=lat, lng=lng, password=password_hash,
            )
            if idx % 6 == 0:
                farmer.created_at = now - timedelta(days=280 - idx * 3)
                farmer.save(update_fields=["created_at"])
            farmers.append(farmer)

        facilities = []
        for entry in FACILITIES:
            lat, lng = _coords(entry["region"])
            facility = Facility.objects.create(
                name=entry["name"], code=entry["code"], type=entry["type"], region=entry["region"],
                lat=lat, lng=lng, capacity_kg=entry["capacity_kg"], used_kg=entry["used_kg"],
                temperature_c=entry["temperature_c"], target_temp_c=entry["target_temp_c"],
                status=entry["status"], solar_kw=entry["solar_kw"], battery_pct=entry["battery_pct"],
                last_service=timezone.localdate() - timedelta(days=entry["service_days"]),
                notes=entry["notes"],
            )
            facility.temp_series = make_temp_series(entry["temperature_c"], seed=len(facilities) + 1)
            facility.save(update_fields=["temp_series"])
            facilities.append(facility)

        taken_scans = set()
        scans = []
        primary_farmers = farmers[:2]
        total_scans = 82
        counts = {farmers[0].id: 15, farmers[1].id: 12}

        for i in range(total_scans):
            if i < 27:
                farmer = primary_farmers[i % 2]
            else:
                farmer = rng.choice(farmers)
                current = counts.get(farmer.id, 0)
                if current > 6:
                    farmer = rng.choice(primary_farmers)
                counts[farmer.id] = counts.get(farmer.id, 0) + 1

            crop = rng.choice(CROPS_WEIGHTED)
            score = int(max(38, min(97, rng.gauss(75, 12))))
            grade, grade_label = _grade(score)
            weather_snapshot = _weather_snapshot()
            seed_scan = {
                "weather": weather_snapshot,
            }
            ambient, cold, stress, risk, curve = _shelf(seed_scan, crop, score)
            days_ago = int(rng.triangular(0, 58, 9))
            created = now - timedelta(days=days_ago, hours=rng.randint(0, 20), minutes=rng.randint(0, 59))
            ref = _ref("AG", taken_scans)
            image = _render_image(crop, score, seed=1000 + i)
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=86)
            ripeness = int(max(20, min(97, score + rng.randint(-6, 6))))
            scan = Scan.objects.create(
                farmer=farmer, crop=crop, ref_code=ref,
                original_name=f"{crop}-{ref.lower()}.jpg",
                quality_score=score, grade=grade, grade_label=grade_label,
                freshness_pct=max(10, min(98, score + rng.randint(-3, 6))),
                ripeness_pct=ripeness,
                confidence=round(rng.uniform(0.72, 0.94), 2),
                defects=_defects(score, rng),
                metrics=_metrics(score, rng),
                cnn={"label": "fresh" if score >= 80 else "ripe" if score >= 65 else "overripe" if score >= 50 else "defective",
                     "probabilities": {}},
                shelf_ambient_days=ambient, shelf_cold_days=cold,
                recommended_mode="cold" if (ambient < 4 or stress > 0.32 or score < 72) else "ambient",
                weather_risk=risk, stress_index=round(stress, 2),
                weather=weather_snapshot, degradation=curve,
                recommendations=_recommendations(crop, score, grade, ambient, cold, risk, _defects(score, rng)),
                advisories=weather_snapshot["advisories"],
                model_meta={"version": "1.4.0", "vision": "AgriVision CNN", "quality": "RandomForest ensemble",
                            "shelf_life": "WeatherLSTM", "data_source": "seeded demo"},
                location_name=farmer.region,
                lat=farmer.lat, lng=farmer.lng,
            )
            scan.image.save(f"{ref}.jpg", ContentFile(buffer.getvalue()), save=False)
            scan.save()
            Scan.objects.filter(pk=scan.pk).update(created_at=created)
            scan.created_at = created
            scans.append(scan)

        # Bookings
        status_plan = ["pending"] * 5 + ["active"] * 6 + ["completed"] * 13 + ["cancelled"] * 2
        rng.shuffle(status_plan)
        taken_bookings = set()
        for idx, status in enumerate(status_plan):
            farmer = rng.choice(farmers)
            farmer_scans = [s for s in scans if s.farmer_id == farmer.id]
            scan = rng.choice(farmer_scans) if farmer_scans and rng.random() < 0.65 else None
            facility = rng.choice([f for f in facilities if f.status != "maintenance" and f.code != "MC-03"])
            crop = scan.crop if scan else rng.choice(CROPS_WEIGHTED)
            quantity = rng.randint(40, 480)
            days = rng.randint(1, 7)
            start_offset = rng.randint(-24, 4)
            created = now - timedelta(days=max(0, -start_offset) + rng.randint(0, 3), hours=rng.randint(0, 18))
            if status == "completed":
                created = now - timedelta(days=rng.randint(8, 45), hours=rng.randint(0, 20))
            ref = _ref("BK", taken_bookings)
            booking = Booking.objects.create(
                ref_code=ref, farmer=farmer, facility=facility, scan=scan, crop=crop,
                quantity_kg=quantity, start_date=timezone.localdate() + timedelta(days=start_offset),
                days=days, status=status,
                total_cost=round(quantity * days * PRICING[facility.type], 2),
                notes="USSD booking" if idx % 7 == 0 else "",
                completed_at=created + timedelta(days=days) if status == "completed" else None,
            )
            Booking.objects.filter(pk=booking.pk).update(created_at=created)

        # Guaranteed bookings for the two demo farmers so their dashboards are rich.
        facility_by_code = {f.code: f for f in facilities}
        primary_plan = [
            (farmers[0], "BK-AMN01", "tomato", 220, 3, "active", "SF-01", 1, "Cold chain confirmed by provider."),
            (farmers[0], "BK-AMN02", "kale", 120, 2, "pending", "MC-01", 0, "Waiting for provider confirmation."),
            (farmers[0], "BK-AMN03", "mango", 180, 5, "completed", "SF-01", 22, "Completed lot."),
            (farmers[1], "BK-JKM01", "avocado", 300, 4, "active", "SF-03", 2, "Export-grade avocado lot."),
            (farmers[1], "BK-JKM02", "banana", 90, 2, "pending", "SF-02", 0, "Requested through field agent."),
        ]
        for idx, (farmer, ref, crop, qty, days, status, code, ago, note) in enumerate(primary_plan):
            facility = facility_by_code[code]
            farmer_scan = next((s for s in scans if s.farmer_id == farmer.id and s.crop == crop), None)
            created = now - timedelta(days=ago, hours=2)
            booking = Booking.objects.create(
                ref_code=ref, farmer=farmer, facility=facility, scan=farmer_scan, crop=crop,
                quantity_kg=qty, start_date=timezone.localdate() - timedelta(days=ago), days=days,
                status=status, total_cost=round(qty * days * PRICING[facility.type], 2),
                notes=note, completed_at=created + timedelta(days=days) if status == "completed" else None,
            )
            Booking.objects.filter(pk=booking.pk).update(created_at=created)

        # Tickets
        ticket_specs = [
            ("Cold storage pickup delayed", "storage", "in_progress", "high",
             "The mobile unit was scheduled for 8am but has not arrived at the Bahati collection point. My tomatoes are getting warm.",
             [("support", "AgriSentinel Support",
               "Karibu Amina. MC-01 was delayed by a road closure near Bahati. The driver is 40 minutes away and we have reserved 200kg for you.")]),
            ("Need help reading my quality score", "quality", "open", "normal",
             "My last scan showed grade C but the produce looks fine. How is the score decided and can I request a second check?",
             [("support", "AgriSentinel Support",
               "The score combines the photo analysis with weather stress. We can compare a second photo in daylight - please upload a top-down image.")]),
            ("How do I use the USSD service?", "ussd", "resolved", "normal",
             "My neighbour does not have a smartphone. How can she book cold storage?",
             [("support", "AgriSentinel Support",
               "Dial *384*74# and choose 2. The menu walks through facility, crop, quantity and days, then sends a booking reference by SMS.")]),
        ]
        for idx, (subject, category, status, priority, message, replies) in enumerate(ticket_specs):
            ref = f"TS-{4800 + idx}"
            created = now - timedelta(days=[2, 6, 21][idx], hours=3)
            ticket = SupportTicket.objects.create(
                ref_code=ref, farmer=farmers[0] if idx != 1 else farmers[1],
                subject=subject, category=category, status=status, priority=priority,
            )
            SupportTicket.objects.filter(pk=ticket.pk).update(created_at=created, updated_at=created + timedelta(hours=2))
            TicketMessage.objects.create(
                ticket=ticket, sender="farmer",
                author_name=ticket.farmer.get_full_name(), body=message,
            )
            for sender, author, body in replies:
                msg = TicketMessage.objects.create(ticket=ticket, sender=sender, author_name=author, body=body)
                TicketMessage.objects.filter(pk=msg.pk).update(created_at=created + timedelta(hours=3))

        # USSD logs
        ussd_samples = [
            ("", "CON AgriSentinel 384*74\n1 Quality check\n2 Cold storage\n3 Weather (3 days)\n4 Support\n5 My bookings\n0 Exit"),
            ("2", "CON Cold storage near Nakuru:\n1 SF-01 Nakuru 1150kg\n2 MC-01 Nakuru 560kg\n3 SF-04 Naivasha 1090kg\nReply e.g. 2*1"),
            ("2*1*1*150*3", "END Booked BK-8VQ2L: 150kg tomato, 3d at SF-01. KES 1125. Await provider confirmation."),
            ("3", "END 3-day Nakuru:\nMon 28/17C 0mm\nTue 31/18C 2mm\nWed 27/16C 9mm\nRisk: moderate. Keep harvest shaded."),
            ("1", "CON Enter scan code (e.g. AG-4KD2F):"),
            ("1*AG-4K8Q2", "END AG-4K8Q2 Tomato: B (78/100). Ambient 5d, cold 12d. Store cold."),
            ("4*Need pick-up at Bahati", "END Ticket TS-9XK2M created. Our team will call +254712300401 within 24h. Asante."),
            ("5", "END My storage:\nBK-8VQ2L SF-01 150kg 3d Pending"),
        ]
        for idx in range(18):
            text, response = ussd_samples[idx % len(ussd_samples)]
            phone = farmers[idx % 4].phone if idx % 3 != 2 else "+254799888777"
            created = now - timedelta(days=rng.randint(0, 12), hours=rng.randint(0, 20))
            log = UssdLog.objects.create(
                session_id=f"SIM-{9000 + idx}", phone=phone, text=text, response=response,
                user=next((f for f in farmers if f.phone == phone), None),
            )
            UssdLog.objects.filter(pk=log.pk).update(created_at=created)

        # Notifications
        note_specs = [
            (farmers[0], "storage", "Mobile unit arriving soon", "MC-01 is 40 minutes from the Bahati collection point.", "info", False),
            (farmers[0], "scan", "Quality scan completed", "Your latest tomato lot is ready. Cold storage keeps it fresh for longer.", "success", False),
            (farmers[0], "system", "Weather alert: warm afternoon", "Temperatures above 30 C expected tomorrow. Harvest before 10:00.", "warning", False),
            (farmers[0], "support", "Reply on TS-4800", "Our team replied to your storage pickup ticket.", "info", True),
            (farmers[1], "scan", "Premium avocado lot", "Target export buyers within 4 days.", "success", False),
            (farmers[1], "storage", "Booking BK-JKM01 confirmed", "Your 300kg avocado booking at SF-03 is now active.", "success", True),
            (provider, "booking", "5 storage requests waiting", "Confirm pending bookings to start the cooling cycle.", "warning", False),
            (provider, "fleet", "SF-05 temperature drift", "Machakos freezer is 4.4 C above target. Technician review needed.", "error", False),
            (provider, "support", "New priority ticket TS-4800", "Amina Njeri reported a delayed pickup at Bahati.", "warning", False),
            (admin, "system", "Weekly network summary ready", "82 scans, 14 active bookings and 6 units online across the network.", "info", False),
            (admin, "fleet", "SF-02 service due", "Kiambu aggregation hub passed its 45-day service window.", "warning", False),
        ]
        for user, kind, title, body, severity, read in note_specs:
            note = Notification.objects.create(user=user, kind=kind, title=title, body=body, severity=severity, read=read)
            Notification.objects.filter(pk=note.pk).update(created_at=now - timedelta(hours=rng.randint(1, 72)))

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(farmers)} farmers, {len(facilities)} facilities, {len(scans)} scans, "
            f"{len(status_plan)} bookings, {len(ticket_specs)} tickets and 18 USSD logs."
        ))
        self.stdout.write("Farmer: amina@farm.africa / demo1234")
        self.stdout.write("Admin: admin@agrisentinel.africa / demo1234")
        self.stdout.write("Provider: grace@agrisentinel.africa / demo1234")

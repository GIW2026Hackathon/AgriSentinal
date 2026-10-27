"""3-day farm weather with Open-Meteo and a deterministic offline fallback."""

import math
import random
from datetime import date, datetime, timedelta

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

WEATHER_CODES = {
    0: ("Clear sky", "sun"),
    1: ("Mostly clear", "sun"),
    2: ("Partly cloudy", "cloud-sun"),
    3: ("Overcast", "cloud"),
    45: ("Fog", "fog"),
    48: ("Rime fog", "fog"),
    51: ("Light drizzle", "drizzle"),
    53: ("Drizzle", "drizzle"),
    55: ("Heavy drizzle", "drizzle"),
    56: ("Freezing drizzle", "drizzle"),
    57: ("Freezing drizzle", "drizzle"),
    61: ("Light rain", "rain"),
    63: ("Rain", "rain"),
    65: ("Heavy rain", "heavy-rain"),
    66: ("Freezing rain", "rain"),
    67: ("Freezing rain", "rain"),
    71: ("Light snow", "snow"),
    73: ("Snow", "snow"),
    75: ("Heavy snow", "snow"),
    77: ("Snow grains", "snow"),
    80: ("Light showers", "rain"),
    81: ("Showers", "rain"),
    82: ("Violent showers", "heavy-rain"),
    85: ("Snow showers", "snow"),
    86: ("Snow showers", "snow"),
    95: ("Thunderstorm", "storm"),
    96: ("Thunderstorm, hail", "storm"),
    99: ("Thunderstorm, hail", "storm"),
}


def describe(code):
    return WEATHER_CODES.get(int(code or 0), ("Mixed conditions", "cloud"))


def _advisories(daily):
    advisories = []
    hottest = max(daily, key=lambda d: d["temp_max"])
    wettest = max(daily, key=lambda d: d["rain_mm"])
    most_humid = max(daily, key=lambda d: d["humidity"])
    windiest = max(daily, key=lambda d: d["wind_kph"])

    if hottest["temp_max"] >= 33:
        advisories.append({
            "level": "high",
            "title": f"Extreme heat on {hottest['day']}",
            "detail": f"Peak of {hottest['temp_max']:.0f} C. Harvest before 10:00, shade crates and prioritise cold storage.",
        })
    elif hottest["temp_max"] >= 30:
        advisories.append({
            "level": "medium",
            "title": "Warm afternoons ahead",
            "detail": f"Up to {hottest['temp_max']:.0f} C on {hottest['day']}. Move delicate crops out of the sun after harvest.",
        })
    if wettest["rain_mm"] >= 10:
        advisories.append({
            "level": "high",
            "title": f"Heavy rain on {wettest['day']}",
            "detail": f"{wettest['rain_mm']:.0f} mm forecast. Cover harvests, avoid field traffic and dry produce before storage.",
        })
    elif wettest["rain_mm"] >= 3:
        advisories.append({
            "level": "medium",
            "title": "Showers expected",
            "detail": f"{wettest['rain_mm']:.0f} mm on {wettest['day']}. Harvest in dry windows and keep crates raised off the ground.",
        })
    if most_humid["humidity"] >= 85:
        advisories.append({
            "level": "medium",
            "title": "Mould-pressure window",
            "detail": f"Humidity reaches {most_humid['humidity']:.0f}% on {most_humid['day']}. Ventilate storage and avoid warm stacking.",
        })
    if windiest["wind_kph"] >= 30:
        advisories.append({
            "level": "medium",
            "title": "Strong winds",
            "detail": f"Wind gusts near {windiest['wind_kph']:.0f} km/h on {windiest['day']}. Secure greenhouse covers and crates.",
        })
    if not advisories:
        advisories.append({
            "level": "low",
            "title": "Favourable field window",
            "detail": "Mild temperatures and low rain risk. Good conditions for harvest, transport and ambient marketing.",
        })
    return advisories


def _risk_from(daily):
    score = 0.0
    for d in daily[:3]:
        score += max(0.0, d["temp_max"] - 30) * 0.16
        score += max(0.0, d["rain_mm"] - 3) * 0.05
        score += max(0.0, d["humidity"] - 80) * 0.02
    score = min(score, 3.0)
    if score >= 1.8:
        return "high"
    if score >= 0.8:
        return "moderate"
    return "low"


def _summary(daily, source):
    rain_total = round(sum(d["rain_mm"] for d in daily[:3]), 1)
    max_temp = round(max(d["temp_max"] for d in daily[:3]), 1)
    avg_temp = round(sum((d["temp_max"] + d["temp_min"]) / 2 for d in daily[:3]) / 3, 1)
    risk = _risk_from(daily)
    if risk == "high":
        headline = "Protect your harvest"
    elif risk == "moderate":
        headline = "Plan around the heat"
    else:
        headline = "Stable harvest window"
    return {
        "rain_total_mm": rain_total,
        "max_temp_c": max_temp,
        "avg_temp_c": avg_temp,
        "risk": risk,
        "headline": headline,
        "source": source,
    }


def _day_label(date_obj):
    return date_obj.strftime("%a")


def _parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return timezone.localdate()


def _fallback(lat, lng, location_name):
    rng = random.Random(int(lat * 1000) + int(lng * 1000) + timezone.localdate().toordinal())
    today = timezone.localdate()
    daily = []
    for i in range(5):
        day = today + timedelta(days=i)
        seasonal = math.sin((day.timetuple().tm_yday / 365) * 2 * math.pi)
        temp_max = round(27.5 + seasonal * 1.8 + rng.uniform(-3.2, 3.6), 1)
        temp_min = round(temp_max - rng.uniform(7.5, 11.5), 1)
        rain = round(rng.choice([0, 0, 0, 1.2, 4.5, 9.0, 16.0]), 1)
        humidity = int(min(94, max(42, rng.gauss(71, 12) + rain * 0.8)))
        code = rng.choice([0, 1, 2, 3, 61, 80]) if rain == 0 else rng.choice([61, 63, 80, 95])
        condition, icon = describe(code)
        daily.append({
            "date": day.isoformat(),
            "day": _day_label(day),
            "day_full": day.strftime("%A"),
            "temp_max": temp_max,
            "temp_min": temp_min,
            "humidity": humidity,
            "rain_mm": rain,
            "precip_prob": int(min(95, max(3, rain * 6 + rng.uniform(0, 18)))),
            "wind_kph": round(rng.uniform(6, 24), 1),
            "solar": round(rng.uniform(13, 24), 1),
            "uv": round(rng.uniform(5, 11), 1),
            "condition": condition,
            "icon": icon,
            "sunrise": "06:%02d" % rng.randint(10, 35),
            "sunset": "18:%02d" % rng.randint(30, 55),
        })
    now_hour = timezone.localtime().hour
    hourly = []
    for i in range(24):
        hour = (now_hour + i) % 24
        tmax = daily[0]["temp_max"]
        tmin = daily[0]["temp_min"]
        wave = math.sin((hour - 8) / 24 * 2 * math.pi)
        hourly.append({
            "time": "%02d:00" % hour,
            "temp": round((tmax + tmin) / 2 + (tmax - tmin) / 2 * wave, 1),
            "humidity": int(min(96, max(35, daily[0]["humidity"] - wave * 12))),
            "rain_prob": int(min(95, max(0, daily[0]["precip_prob"] + rng.randint(-6, 8)))),
            "icon": daily[0]["icon"] if i < 6 else ("moon" if hour < 6 or hour >= 19 else daily[0]["icon"]),
        })
    return {
        "location": {"name": location_name, "lat": lat, "lng": lng},
        "source": "agrisentinel-model",
        "source_label": "AgriSentinel offline forecast",
        "updated_at": timezone.now().isoformat(),
        "current": {
            "temp_c": hourly[0]["temp"],
            "feels_like_c": round(hourly[0]["temp"] + 1.2, 1),
            "humidity": hourly[0]["humidity"],
            "rain_mm": daily[0]["rain_mm"],
            "wind_kph": daily[0]["wind_kph"],
            "uv": daily[0]["uv"],
            "condition": daily[0]["condition"],
            "icon": daily[0]["icon"],
        },
        "daily": daily,
        "hourly": hourly,
        "summary": _summary(daily, "offline"),
        "advisories": _advisories(daily),
    }


def _open_meteo(lat, lng, location_name):
    params = {
        "latitude": lat,
        "longitude": lng,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,"
                 "precipitation_probability_max,wind_speed_10m_max,shortwave_radiation_sum,uv_index_max",
        "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code",
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,"
                   "weather_code,wind_speed_10m,uv_index",
        "timezone": "Africa/Nairobi",
        "forecast_days": 5,
    }
    resp = requests.get(
        "https://api.open-meteo.com/v1/forecast", params=params, timeout=settings.WEATHER_TIMEOUT
    )
    resp.raise_for_status()
    payload = resp.json()
    daily_raw = payload["daily"]
    hourly_raw = payload["hourly"]
    timezone.localdate()

    hourly_by_date = {}
    for idx, stamp in enumerate(hourly_raw["time"]):
        day_key = stamp[:10]
        humidity = hourly_raw["relative_humidity_2m"][idx]
        hourly_by_date.setdefault(day_key, []).append(humidity)

    daily = []
    for i, stamp in enumerate(daily_raw["time"]):
        day = _parse_date(stamp)
        hums = hourly_by_date.get(stamp, [68])
        code = daily_raw["weather_code"][i]
        condition, icon = describe(code)
        daily.append({
            "date": stamp,
            "day": _day_label(day),
            "day_full": day.strftime("%A"),
            "temp_max": round(float(daily_raw["temperature_2m_max"][i]), 1),
            "temp_min": round(float(daily_raw["temperature_2m_min"][i]), 1),
            "humidity": int(round(sum(hums) / max(len(hums), 1))),
            "rain_mm": round(float(daily_raw["precipitation_sum"][i] or 0), 1),
            "precip_prob": int(daily_raw["precipitation_probability_max"][i] or 0),
            "wind_kph": round(float(daily_raw["wind_speed_10m_max"][i] or 0), 1),
            "solar": round(float(daily_raw["shortwave_radiation_sum"][i] or 18), 1),
            "uv": round(float(daily_raw["uv_index_max"][i] or 7), 1),
            "condition": condition,
            "icon": icon,
            "sunrise": (daily_raw["sunrise"][i] or "06:30")[-5:],
            "sunset": (daily_raw["sunset"][i] or "18:45")[-5:],
        })

    now_local = timezone.localtime()
    hourly = []
    hourly_times = hourly_raw["time"]
    start = 0
    for idx, stamp in enumerate(hourly_times):
        try:
            parsed = datetime.fromisoformat(stamp)
        except ValueError:
            continue
        if parsed.date() == now_local.date() and parsed.hour >= now_local.hour:
            start = idx
            break
    for idx in range(start, min(start + 24, len(hourly_times))):
        stamp = hourly_times[idx]
        code = hourly_raw["weather_code"][idx]
        condition, icon = describe(code)
        hour = int(stamp[11:13])
        if 6 <= hour < 19:
            pass
        elif icon == "sun":
            icon = "moon"
        hourly.append({
            "time": stamp[11:16],
            "temp": round(float(hourly_raw["temperature_2m"][idx]), 1),
            "humidity": int(hourly_raw["relative_humidity_2m"][idx] or 0),
            "rain_prob": int(hourly_raw["precipitation_probability"][idx] or 0),
            "icon": icon,
            "condition": condition,
        })
    while len(hourly) < 24:
        last = hourly[-1]
        hourly.append({**last, "time": "next"})

    current_raw = payload.get("current", {})
    condition, icon = describe(current_raw.get("weather_code"))
    current = {
        "temp_c": round(float(current_raw.get("temperature_2m", daily[0]["temp_max"])), 1),
        "feels_like_c": round(float(current_raw.get("apparent_temperature", daily[0]["temp_max"])), 1),
        "humidity": int(current_raw.get("relative_humidity_2m", daily[0]["humidity"])),
        "rain_mm": round(float(current_raw.get("precipitation", 0) or 0), 1),
        "wind_kph": round(float(current_raw.get("wind_speed_10m", daily[0]["wind_kph"])), 1),
        "uv": round(float(current_raw.get("uv_index", daily[0]["uv"]) or 0), 1),
        "condition": condition,
        "icon": icon,
    }
    return {
        "location": {"name": location_name, "lat": lat, "lng": lng},
        "source": "open-meteo",
        "source_label": "Open-Meteo forecast",
        "updated_at": timezone.now().isoformat(),
        "current": current,
        "daily": daily,
        "hourly": hourly,
        "summary": _summary(daily, "open-meteo"),
        "advisories": _advisories(daily),
    }


def get_forecast(lat=None, lng=None, location_name="Nakuru", force=False):
    lat = float(lat if lat is not None else -0.3031)
    lng = float(lng if lng is not None else 36.08)
    key = f"weather:v2:{lat:.2f}:{lng:.2f}"
    if not force:
        cached = cache.get(key)
        if cached:
            return cached
    try:
        data = _open_meteo(lat, lng, location_name)
    except Exception:
        data = _fallback(lat, lng, location_name)
    cache.set(key, data, 900)
    return data


def ml_weather(forecast):
    return {
        "daily": [
            {
                "date": d["date"],
                "temp_max": d["temp_max"],
                "temp_min": d["temp_min"],
                "humidity": d["humidity"],
                "rain_mm": d["rain_mm"],
                "wind_kph": d["wind_kph"],
                "solar": d["solar"],
                "uv": d["uv"],
                "condition": d["condition"],
            }
            for d in forecast["daily"][:3]
        ]
    }

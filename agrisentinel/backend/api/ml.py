"""Client for the FastAPI inference service with an offline-safe fallback."""

import io
import json
import math

import numpy as np
import requests
from django.conf import settings
from django.core.cache import cache
from PIL import Image, ImageOps

from .crops import CROPS

FALLBACK_MODEL = {
    "version": "heuristic-1.0",
    "vision": "Colour/texture heuristic (ML service offline)",
    "quality": "Agronomic rules + image statistics",
    "shelf_life": "Weather stress model (offline)",
    "cnn_accuracy": None,
    "quality_mae": None,
    "shelf_mae_days": None,
    "data_source": "offline fallback",
}


def service_info():
    cached = cache.get("ml:model_info")
    if cached:
        return cached
    try:
        resp = requests.get(f"{settings.ML_SERVICE_URL}/model-info", timeout=2.5)
        resp.raise_for_status()
        info = resp.json()
        cache.set("ml:model_info", info, 300)
        return info
    except Exception:
        return FALLBACK_MODEL


class ScanRejected(Exception):
    """Raised when an upload is not a photo of horticultural produce."""


def analyse(image_bytes, filename, crop, weather_payload, storage_mode="ambient", facility_temp=None, is_sample=False):
    files = {"file": (filename or "scan.jpg", image_bytes, "image/jpeg")}
    data = {
        "crop": crop,
        "weather": json.dumps(weather_payload),
        "storage_mode": storage_mode,
        "facility_temp_c": str(facility_temp) if facility_temp is not None else "",
        "is_sample": "true" if is_sample else "false",
    }
    try:
        resp = requests.post(f"{settings.ML_SERVICE_URL}/analyze", files=files, data=data, timeout=35)
        if resp.status_code == 422:
            try:
                detail = (resp.json() or {}).get("detail") or {}
            except ValueError:
                detail = {}
            message = detail.get("message") if isinstance(detail, dict) else str(detail)
            raise ScanRejected(message or "This does not look like horticultural produce.")
        resp.raise_for_status()
        payload = resp.json()
        payload["degraded"] = False
        return payload
    except ScanRejected:
        raise
    except Exception:
        return _fallback(image_bytes, crop, weather_payload, facility_temp)


def _fallback(image_bytes, crop, weather_payload, facility_temp):
    info = CROPS.get(crop, CROPS["tomato"])
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = ImageOps.exif_transpose(img)
        img.thumbnail((256, 256))
        hsv = np.asarray(img.convert("HSV"), np.float32) / 255.0
        s, v = hsv[..., 1], hsv[..., 2]
        saturation = float(s.mean())
        brightness = float(v.mean())
        dark = float((v < 0.2).mean())
        score = int(np.clip(42 + saturation * 48 + brightness * 22 - dark * 90, 28, 93))
    except Exception:
        score = 72
        saturation = 0.45
        dark = 0.03

    daily = weather_payload.get("daily") or [
        {"temp_max": 28, "temp_min": 17, "humidity": 68, "rain_mm": 0, "wind_kph": 12, "solar": 19, "uv": 8, "date": "Day 1"},
        {"temp_max": 29, "temp_min": 18, "humidity": 65, "rain_mm": 0, "wind_kph": 14, "solar": 20, "uv": 9, "date": "Day 2"},
        {"temp_max": 27, "temp_min": 17, "humidity": 72, "rain_mm": 1, "wind_kph": 10, "solar": 17, "uv": 7, "date": "Day 3"},
    ]
    daily = daily[:3]
    heat = float(np.mean([max(0.0, d.get("temp_max", 28) - info["optimal_temp_c"]) for d in daily]))
    humidity = float(np.mean([max(0.0, d.get("humidity", 68) - 70) for d in daily]))
    rain = float(sum(d.get("rain_mm", 0) for d in daily))
    stress = float(np.clip((heat * 0.045 + humidity * 0.012 + rain * 0.007) / 1.6, 0, 1))
    ambient = max(0.6, info["base_shelf_days"] * (score / 100) ** 1.3 * math.exp(-stress))
    cold_temp = facility_temp if facility_temp is not None else min(info["optimal_temp_c"] + 1, 8)
    cold = max(ambient * 1.3, ambient * info["cold_multiplier"] * (0.82 + 0.18 * (1 - stress)))
    risk = "high" if stress > 0.55 else "moderate" if stress > 0.25 else "low"
    grade = "A" if score >= 85 else "B" if score >= 71 else "C" if score >= 56 else "D"
    labels = {"A": "Premium", "B": "Market ready", "C": "Fair / local market", "D": "At risk"}
    curve = []
    for day in range(6):
        curve.append({
            "day": day,
            "ambient": round(max(0, score * math.exp(-day / max(ambient, 0.8))), 1),
            "cold": round(max(0, score * math.exp(-day / max(cold, 0.8))), 1),
            "ambient_state": "safe" if score * math.exp(-day / max(ambient, 0.8)) >= 65 else "watch",
            "cold_state": "safe",
        })
    defects = [{"label": "Visible surface variation", "confidence": 0.4, "severity": "low" if dark < 0.08 else "medium"}]
    return {
        "scan": {
            "quality_score": int(score),
            "grade": grade,
            "grade_label": labels[grade],
            "freshness_pct": int(np.clip(score + 4, 5, 99)),
            "ripeness_pct": int(np.clip(48 + saturation * 42, 10, 95)),
            "confidence": 0.61,
            "defects": defects,
            "metrics": [
                {"key": "colour", "label": "Colour uniformity", "value": int(np.clip(62 + saturation * 30, 10, 96))},
                {"key": "surface", "label": "Surface integrity", "value": int(np.clip(92 - dark * 220, 10, 96))},
                {"key": "firmness", "label": "Firmness estimate", "value": int(np.clip(58 + brightness * 30, 10, 96))},
                {"key": "moisture", "label": "Moisture retention", "value": int(np.clip(60 + saturation * 25, 10, 96))},
                {"key": "vitality", "label": "Freshness vitality", "value": score},
            ],
            "cnn": {"label": "unavailable", "probabilities": {}},
            "signals": {"blemish": round(dark, 3), "moisture": round(saturation, 3)},
        },
        "shelf_life": {
            "ambient_days": round(ambient, 1),
            "cold_days": round(cold, 1),
            "days_gained": round(max(0, cold - ambient), 1),
            "recommended_mode": "cold" if ambient < 4 or stress > 0.3 else "ambient",
            "cold_temp_c": round(cold_temp, 1),
            "ambient_temp_c": 28.0,
            "weather_risk": risk,
            "stress_index": round(stress, 2),
            "weather_signals": {"heat_load": round(heat, 1), "humidity_load": round(humidity, 1), "rain_total_mm": round(rain, 1),
                                 "warmest_day": daily[0].get("date", "Day 1"), "warmest_max_c": max(d.get("temp_max", 28) for d in daily)},
            "market_window": {"ambient_days_above_65": max(0, int(ambient * 0.55)), "cold_days_above_65": max(0, int(cold * 0.6))},
            "degradation": curve,
            "confidence": 0.6,
            "storage_note": info["storage_note"],
        },
        "crop": {"key": crop, "label": info["label"]},
        "advisories": [{"level": "medium", "title": "ML service offline", "detail": "A rules-based fallback produced this estimate. Restart the ML service for full CNN/LSTM analysis."}],
        "recommendations": [
            {"title": "Keep the cold chain ready", "detail": f"Cold storage can add roughly {max(0, cold - ambient):.0f} days for this lot.", "priority": "medium"},
            {"title": "Re-scan when online", "detail": "Full AgriVision analysis needs the inference service on port 8001.", "priority": "low"},
        ],
        "model": FALLBACK_MODEL,
        "degraded": True,
        "latency_ms": None,
    }

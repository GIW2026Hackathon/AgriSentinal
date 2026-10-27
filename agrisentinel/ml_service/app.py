"""AgriSentinel ML inference service (FastAPI).

Combines:
  * QualityCNN       - visual grade from the uploaded photo
  * RandomForest     - handcrafted colour/texture quality regressor
  * WeatherLSTM      - shelf life from a 3-day weather sequence + produce context
"""

import io
import json
import math
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps
from pydantic import BaseModel

import features as feats
import vision
from crops import CROPS, CROP_KEYS
from models import QualityCNN, ShelfLifeLSTM

ART = Path(__file__).parent / "artifacts"
DEVICE = "cpu"
CLASSES = ["fresh", "ripe", "overripe", "defective"]
CLASS_QUALITY = np.array([93.0, 77.0, 55.0, 27.0], dtype=np.float32)
SHELF_SCALE = 81.0

STATE = {}


def _load():
    meta_path = ART / "meta.json"
    if not (meta_path.exists() and (ART / "quality_cnn.pt").exists() and (ART / "shelf_lstm.pt").exists()):
        print("[ml] artifacts missing - training quick models...")
        from train import main as train_main
        train_main()
    STATE["meta"] = json.loads(meta_path.read_text(encoding="utf-8"))
    cnn = QualityCNN()
    ckpt = torch.load(ART / "quality_cnn.pt", map_location=DEVICE)
    cnn.load_state_dict(ckpt["state_dict"])
    cnn.eval()
    STATE["cnn"] = cnn
    STATE["cnn_classes"] = ckpt.get("classes", CLASSES)
    STATE["cnn_size"] = ckpt.get("img_size", 112)
    STATE["rf"] = joblib.load(ART / "quality_rf.joblib")
    lstm = ShelfLifeLSTM()
    lkpt = torch.load(ART / "shelf_lstm.pt", map_location=DEVICE)
    lstm.load_state_dict(lkpt["state_dict"])
    lstm.eval()
    STATE["lstm"] = lstm
    STATE["shelf_scale"] = lkpt.get("shelf_scale", SHELF_SCALE)
    STATE["validator"] = vision.ProduceValidator()
    print("[ml] models ready:", STATE["meta"]["version"])


@asynccontextmanager
async def lifespan(app):
    _load()
    yield


app = FastAPI(title="AgriSentinel ML", version="1.4.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_DAILY = [
    {"date": "Day 1", "temp_max": 28.0, "temp_min": 17.0, "humidity": 68, "rain_mm": 0.0,
     "wind_kph": 12.0, "solar": 19.0, "uv": 8.0, "condition": "Partly cloudy"},
    {"date": "Day 2", "temp_max": 29.0, "temp_min": 18.0, "humidity": 65, "rain_mm": 0.0,
     "wind_kph": 14.0, "solar": 20.0, "uv": 9.0, "condition": "Sunny"},
    {"date": "Day 3", "temp_max": 27.0, "temp_min": 17.0, "humidity": 72, "rain_mm": 1.2,
     "wind_kph": 10.0, "solar": 17.0, "uv": 7.0, "condition": "Light showers"},
]


def _normalise_daily(daily):
    if not daily:
        return DEFAULT_DAILY
    out = []
    for i, d in enumerate(daily[:3]):
        out.append({
            "date": d.get("date") or f"Day {i + 1}",
            "temp_max": float(d.get("temp_max", 28.0)),
            "temp_min": float(d.get("temp_min", 17.0)),
            "humidity": float(d.get("humidity", 68.0)),
            "rain_mm": float(d.get("rain_mm", 0.0)),
            "wind_kph": float(d.get("wind_kph", 12.0)),
            "solar": float(d.get("solar", 19.0)),
            "uv": float(d.get("uv", 8.0)),
            "condition": d.get("condition", "Mixed"),
        })
    while len(out) < 3:
        out.append(dict(out[-1]))
    return out


def _sequence(daily, crop, quality, cold, storage_temp):
    info = CROPS.get(crop, CROPS["tomato"])
    seq = []
    extended = list(daily[:3]) + [daily[2], daily[2]]
    for day, d in enumerate(extended):
        thermal = storage_temp if cold else max(d["temp_max"], storage_temp)
        seq.append([
            d["temp_max"] / 45.0,
            d["temp_min"] / 45.0,
            d["humidity"] / 100.0,
            d["rain_mm"] / 50.0,
            d["wind_kph"] / 30.0,
            d["solar"] / 35.0,
            day / 5.0,
            thermal / 40.0,
            float(cold),
        ])
    static = [quality / 100.0, info["base_shelf_days"] / 45.0, float(cold), storage_temp / 40.0]
    # Unnamed produce shares the model's tomato one-hot slot; the shelf limits
    # above still come from the generic produce profile.
    model_crop = crop if crop in CROP_KEYS else "tomato"
    static += [1.0 if model_crop == k else 0.0 for k in CROP_KEYS]
    return (
        torch.tensor(np.array([seq], np.float32)),
        torch.tensor(np.array([static], np.float32)),
    )


def _predict_shelf(crop, quality, daily, cold, storage_temp):
    info = CROPS.get(crop, CROPS["tomato"])
    seq, static = _sequence(daily, crop, quality, cold, storage_temp)
    with torch.no_grad():
        out = STATE["lstm"](seq, static).item()
    days = math.expm1(min(max(out, 0.0), 1.3) * math.log1p(STATE["shelf_scale"]))
    cap = info["base_shelf_days"] * info["cold_multiplier"] + 10
    return float(np.clip(days, 0.5, cap))


def _weather_stress(daily, crop):
    info = CROPS.get(crop, CROPS["tomato"])
    heat = np.mean([max(0.0, d["temp_max"] - info["optimal_temp_c"]) for d in daily])
    humid = np.mean([max(0.0, d["humidity"] - 70) for d in daily])
    rain = sum(d["rain_mm"] for d in daily)
    raw = heat * 0.045 + humid * 0.012 + rain * 0.007
    return float(np.clip(raw / 1.6, 0, 1)), heat, humid, rain


def _risk_label(stress):
    if stress >= 0.62:
        return "extreme"
    if stress >= 0.4:
        return "high"
    if stress >= 0.2:
        return "moderate"
    return "low"


def _degradation(score, ambient_days, cold_days, quality_floor=35.0):
    curve = []
    for day in range(0, 6):
        if day == 0:
            amb = cold = score
        else:
            amb = quality_floor + (score - quality_floor) * math.exp(-day * math.log(max(score, 38) / quality_floor) / max(ambient_days, 0.6))
            cold = quality_floor + (score - quality_floor) * math.exp(-day * math.log(max(score, 38) / quality_floor) / max(cold_days, 0.6))
        curve.append({
            "day": day,
            "ambient": round(float(np.clip(amb, 0, 100)), 1),
            "cold": round(float(np.clip(cold, 0, 100)), 1),
            "ambient_state": "safe" if amb >= 65 else "watch" if amb >= 45 else "risk",
            "cold_state": "safe" if cold >= 65 else "watch" if cold >= 45 else "risk",
        })
    return curve


def _advisories(daily, crop, risk, stress):
    info = CROPS.get(crop, CROPS["tomato"])
    adv = []
    hottest = max(daily, key=lambda d: d["temp_max"])
    wettest = max(daily, key=lambda d: d["rain_mm"])
    if hottest["temp_max"] >= 32:
        adv.append({
            "level": "high",
            "title": f"Heat spike on {hottest['date']}",
            "detail": f"{hottest['temp_max']:.0f} C forecast, {hottest['temp_max'] - info['optimal_temp_c']:.0f} C above the ideal "
                      f"{info['optimal_temp_c']} C for {info['label'].lower()}. Shade or cold storage is advised.",
        })
    if wettest["rain_mm"] >= 8:
        adv.append({
            "level": "medium",
            "title": f"Heavy rain on {wettest['date']}",
            "detail": f"{wettest['rain_mm']:.0f} mm expected. Keep crates covered and move produce before wet handling.",
        })
    if max(d["humidity"] for d in daily) >= 85:
        adv.append({
            "level": "medium",
            "title": "High humidity window",
            "detail": "Humidity above 85% raises mould pressure. Ventilate and avoid stacking warm crates.",
        })
    if not adv:
        adv.append({
            "level": "low",
            "title": "Stable 3-day window",
            "detail": f"{risk.capitalize()} weather stress ({stress * 100:.0f}/100). Ambient handling is workable but cold storage keeps quality higher.",
        })
    return adv


def analyse_image(image_bytes, crop):
    try:
        image = feats.load_image(image_bytes, size=288)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read image: {exc}") from exc

    vector, extras = feats.extract(image)
    rf_score = float(STATE["rf"].predict(vector.reshape(1, -1))[0])

    small = image.resize((STATE["cnn_size"], STATE["cnn_size"]))
    tensor = torch.from_numpy(np.asarray(small, np.float32) / 255.0).permute(2, 0, 1)[None]
    tensor = tensor * 2.0 - 1.0
    with torch.no_grad():
        logits = STATE["cnn"](tensor)
        probs = torch.softmax(logits, dim=1)[0].numpy()
    classes = STATE["cnn_classes"]
    cnn_quality = float(np.dot(probs, CLASS_QUALITY))
    top = int(probs.argmax())

    score = float(np.clip(0.58 * rf_score + 0.42 * cnn_quality, 5, 99))
    freshness = float(np.clip(0.52 * score + 30 * extras["moisture_signal"] + 18 * (1 - extras["blemish_signal"]), 3, 99))
    ripeness = float(np.clip(
        32 + 26 * probs[classes.index("fresh")] + 52 * probs[classes.index("ripe")]
        + 78 * probs[classes.index("overripe")] + 18 * probs[classes.index("defective")]
        + (extras["color_richness"] - 0.5) * 16,
        12, 98,
    ))

    if score >= 85:
        grade, grade_label = "A", "Premium"
    elif score >= 71:
        grade, grade_label = "B", "Market ready"
    elif score >= 56:
        grade, grade_label = "C", "Fair / local market"
    else:
        grade, grade_label = "D", "At risk"

    confidence = float(np.clip(0.55 + 0.28 * extras["confidence"] + 0.17 * float(probs[top]), 0.5, 0.97))
    defects = feats.defect_labels(extras, score)
    metrics = feats.quality_metrics(extras, score)

    return {
        "quality_score": round(score),
        "grade": grade,
        "grade_label": grade_label,
        "freshness_pct": round(freshness),
        "ripeness_pct": round(ripeness),
        "confidence": round(confidence, 2),
        "defects": defects,
        "metrics": metrics,
        "cnn": {
            "label": classes[top],
            "probabilities": {c: round(float(p), 3) for c, p in zip(classes, probs)},
        },
        "signals": {
            "blemish": round(extras["blemish_signal"], 3),
            "moisture": round(extras["moisture_signal"], 3),
            "colour_uniformity": round(extras["hue_uniformity"], 3),
            "coverage": round(extras["coverage"], 3),
        },
    }


def _recommendations(crop, scan, daily, shelf, defects, stress):
    info = CROPS.get(crop, CROPS["tomato"])
    recs = []
    riskiest = max(defects, key=lambda d: d["severity"] == "high")
    if riskiest["severity"] in ("high", "medium"):
        recs.append({
            "title": "Sort affected produce first",
            "detail": f"{riskiest['label']} detected. Grade out affected units before storage to protect the rest of the crate.",
            "priority": "high" if riskiest["severity"] == "high" else "medium",
        })
    if shelf["recommended_mode"] == "cold":
        recs.append({
            "title": f"Book cold storage within {max(2, int(shelf['ambient_days'] * 0.5))} hours",
            "detail": f"Cold storage adds about {shelf['days_gained']:.0f} days. Nearest aggregation freezer holds "
                      f"{info['optimal_temp_c']} C conditions for {info['label'].lower()}.",
            "priority": "high" if shelf["ambient_days"] <= 3 else "medium",
        })
    else:
        recs.append({
            "title": "Ambient handling is viable",
            "detail": f"Quality should stay above 65% for about {max(1, int(shelf['ambient_days']))} days. "
                      f"Keep crates shaded and off the ground.",
            "priority": "low",
        })
    if shelf["weather_risk"] in ("high", "extreme"):
        recs.append({
            "title": "Weather-driven loss risk",
            "detail": "The 3-day forecast sharply shortens shelf life. Prioritise dispatch or cooling before the warmest window.",
            "priority": "high",
        })
    if scan["quality_score"] < 65:
        recs.append({
            "title": "Sell into the local market",
            "detail": "Premium retail grading is unlikely. Target nearby markets or processing to avoid rejection and transport loss.",
            "priority": "medium",
        })
    else:
        recs.append({
            "title": "Target premium buyers",
            "detail": f"Grade {scan['grade']} meets retail quality thresholds. Keep the cold chain intact to protect the premium.",
            "priority": "medium",
        })
    recs.append({
        "title": "Log a USSD quality check",
        "detail": "Share this scan reference with field agents. Farmers without smartphones can pull the result on *384*74#.",
        "priority": "low",
    })
    return recs[:4]


def _shelf_payload(crop, quality, daily, facility_temp=None):
    info = CROPS.get(crop, CROPS["tomato"])
    cold_temp = float(np.clip(facility_temp if facility_temp is not None else min(info["optimal_temp_c"] + 1, 8), 1.5, 14))
    ambient_temp = float(np.clip(np.mean([d["temp_max"] for d in daily]) - 1, 17, 36))
    ambient_days = _predict_shelf(crop, quality, daily, False, ambient_temp)
    cold_days = _predict_shelf(crop, quality, daily, True, cold_temp)
    stress, heat, humid, rain = _weather_stress(daily, crop)
    risk = _risk_label(stress)
    cold_days = max(cold_days, ambient_days * 1.25)
    warmest = max(daily, key=lambda d: d["temp_max"])

    market_days = 0
    for point in _degradation(quality, ambient_days, cold_days):
        if point["ambient"] >= 65:
            market_days = point["day"]
    cold_market_days = 0
    for point in _degradation(quality, ambient_days, cold_days):
        if point["cold"] >= 65:
            cold_market_days = point["day"]

    return {
        "ambient_days": round(ambient_days, 1),
        "cold_days": round(cold_days, 1),
        "days_gained": round(max(0.0, cold_days - ambient_days), 1),
        "recommended_mode": "cold" if (ambient_days < 4 or stress > 0.32 or quality < 72) else "ambient",
        "cold_temp_c": round(cold_temp, 1),
        "ambient_temp_c": round(ambient_temp, 1),
        "weather_risk": risk,
        "stress_index": round(stress, 2),
        "weather_signals": {
            "heat_load": round(float(heat), 1),
            "humidity_load": round(float(humid), 1),
            "rain_total_mm": round(float(rain), 1),
            "warmest_day": warmest["date"],
            "warmest_max_c": round(float(warmest["temp_max"]), 1),
        },
        "market_window": {
            "ambient_days_above_65": market_days,
            "cold_days_above_65": cold_market_days,
        },
        "degradation": _degradation(quality, ambient_days, cold_days),
        "confidence": round(float(np.clip(0.6 + 0.2 * (1 - stress) + 0.12 * (quality / 100), 0.55, 0.95)), 2),
        "storage_note": info["storage_note"],
    }


def _model_info():
    m = STATE["meta"]
    return {
        "version": m["version"],
        "trained_at": m["trained_at"],
        "vision": "AgriVision CNN (PyTorch)",
        "quality": "RandomForest quality ensemble (scikit-learn)",
        "shelf_life": "WeatherLSTM (PyTorch)",
        "cnn_accuracy": m["cnn"]["accuracy"],
        "quality_mae": m["quality_rf"]["mae"],
        "shelf_mae_days": m["shelf_lstm"]["mae_days"],
        "data_source": m["data_source"],
    }


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": bool(STATE.get("cnn")), "version": STATE.get("meta", {}).get("version")}


@app.get("/model-info")
def model_info():
    return _model_info()


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    crop: str = Form("tomato"),
    weather: str = Form("{}"),
    storage_mode: str = Form("ambient"),
    facility_temp_c: str = Form(""),
    is_sample: bool = Form(False),
):
    if crop not in CROPS:
        crop = "tomato"
    try:
        payload = json.loads(weather) if weather else {}
    except json.JSONDecodeError:
        payload = {}
    daily = _normalise_daily(payload.get("daily"))
    image_bytes = await file.read()
    if len(image_bytes) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 12 MB)")
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that image. Use a JPG or PNG photo.")
    validation = STATE["validator"].validate(image, is_sample=is_sample)
    if not validation["valid"]:
        raise HTTPException(
            status_code=422,
            detail={"reason": validation["reason"], "message": validation["message"]},
        )
    started = __import__("time").time()
    scan = analyse_image(image_bytes, crop)
    facility_temp = None
    if facility_temp_c:
        try:
            facility_temp = float(facility_temp_c)
        except ValueError:
            facility_temp = None
    shelf = _shelf_payload(crop, scan["quality_score"], daily, facility_temp)
    elapsed = round((__import__("time").time() - started) * 1000)
    return {
        "scan": scan,
        "shelf_life": shelf,
        "crop": {"key": crop, "label": CROPS[crop]["label"]},
        "advisories": _advisories(daily, crop, shelf["weather_risk"], shelf["stress_index"]),
        "recommendations": _recommendations(crop, scan, daily, shelf, scan["defects"], shelf["stress_index"]),
        "weather_used": daily,
        "model": _model_info(),
        "latency_ms": elapsed,
    }


class ShelfRequest(BaseModel):
    crop: str = "tomato"
    quality_score: float = 80
    weather: dict | None = None
    facility_temp_c: float | None = None


@app.post("/shelf-life")
def shelf_life(req: ShelfRequest):
    crop = req.crop if req.crop in CROPS else "tomato"
    daily = _normalise_daily((req.weather or {}).get("daily"))
    shelf = _shelf_payload(crop, float(np.clip(req.quality_score, 1, 100)), daily, req.facility_temp_c)
    return {
        "shelf_life": shelf,
        "advisories": _advisories(daily, crop, shelf["weather_risk"], shelf["stress_index"]),
        "weather_used": daily,
        "model": _model_info(),
    }

"""Image decoding, handcrafted produce features and defect interpretation."""

import io

import numpy as np
from PIL import Image, ImageFilter, ImageOps

FEATURE_NAMES = [
    "h_mean", "h_std", "s_mean", "s_std", "v_mean", "v_std",
    "brown_ratio", "dark_ratio", "yellow_ratio", "green_ratio", "gloss_ratio",
    "edge_density", "edge_std", "texture_var", "sharpness", "contrast",
    "hue_uniformity", "fg_fill", "center_s_mean", "center_s_std", "center_v_mean",
    "center_h_std", "sat_hist_0", "sat_hist_1", "sat_hist_2", "sat_hist_3",
    "val_hist_0", "val_hist_1", "val_hist_2", "val_hist_3",
    "blemish_signal", "moisture_signal",
]


def load_image(source, size=288):
    if isinstance(source, Image.Image):
        img = source
    elif isinstance(source, (bytes, bytearray)):
        img = Image.open(io.BytesIO(source))
    else:
        img = Image.open(source)
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    return img


def _hue_hist(hue, weights, bins=12):
    hist, _ = np.histogram(hue, bins=bins, range=(0, 1), weights=weights)
    total = hist.sum()
    return np.asarray(hist / total if total > 0 else hist, np.float32)


def extract(source):
    img = load_image(source)
    arr = np.asarray(img, np.float32) / 255.0
    hsv = np.asarray(img.convert("HSV"), np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    fg = (s > 0.22) & (v > 0.14)
    if fg.sum() < arr.shape[0] * arr.shape[1] * 0.05:
        fg = np.ones_like(fg, bool)
    fg_flat = fg.reshape(-1)
    weights = fg_flat.astype(np.float32)

    hf, sf, vf = h[fg], s[fg], v[fg]

    gray = arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    edge = np.sqrt(gx**2 + gy**2)
    lap = (
        4 * gray
        - np.roll(gray, 1, 0) - np.roll(gray, -1, 0)
        - np.roll(gray, 1, 1) - np.roll(gray, -1, 1)
    )
    sharpness = float(np.var(lap[fg] if fg.any() else lap))
    edge_mean = float(edge[fg].mean() if fg.any() else edge.mean())
    edge_std = float(edge[fg].std() if fg.any() else edge.std())
    contrast = float(np.std(gray[fg])) if fg.any() else float(np.std(gray))

    brown = (h >= 0.03) & (h <= 0.15) & (s > 0.22) & (v < 0.68)
    dark = v < 0.22
    yellow = (h > 0.13) & (h <= 0.23) & (s > 0.25)
    green = (h > 0.23) & (h <= 0.46) & (s > 0.2)
    gloss = (v > 0.88) & (s < 0.5)

    def ratio(mask):
        return float((mask & fg).sum() / max(fg.sum(), 1))

    hue_hist = _hue_hist(hf, np.ones_like(hf))
    hue_entropy = float(-np.sum(hue_hist * np.log(hue_hist + 1e-9)) / np.log(len(hue_hist)))
    hue_uniformity = float(np.clip(1.0 - hue_entropy, 0, 1))

    sat_hist = np.histogram(sf, bins=4, range=(0, 1))[0].astype(np.float32)
    sat_hist /= max(sat_hist.sum(), 1)
    val_hist = np.histogram(vf, bins=4, range=(0, 1))[0].astype(np.float32)
    val_hist /= max(val_hist.sum(), 1)

    center = np.zeros_like(fg)
    n = arr.shape[0]
    center[n // 4: 3 * n // 4, n // 4: 3 * n // 4] = True
    cf = center & fg

    blemish_signal = float(np.clip(ratio(brown) * 2.4 + ratio(dark) * 1.5 + max(0, contrast - 0.24) * 1.1, 0, 1))
    moisture_signal = float(np.clip(0.55 + ratio(gloss) * 1.8 - ratio(dark) * 1.2 - max(0, edge_mean - 0.06) * 2.0, 0, 1))

    features = np.array([
        float(hf.mean()), float(hf.std()), float(sf.mean()), float(sf.std()),
        float(vf.mean()), float(vf.std()),
        ratio(brown), ratio(dark), ratio(yellow), ratio(green), ratio(gloss),
        edge_mean, edge_std, float(np.var(gray[fg])) if fg.any() else float(np.var(gray)),
        np.log1p(sharpness), contrast, hue_uniformity,
        float(fg.sum() / fg.size),
        float(s[cf].mean()) if cf.any() else 0.0,
        float(s[cf].std()) if cf.any() else 0.0,
        float(v[cf].mean()) if cf.any() else 0.0,
        float(h[cf].std()) if cf.any() else 0.0,
        *sat_hist, *val_hist,
        blemish_signal, moisture_signal,
    ], dtype=np.float32)

    focus = float(np.clip(sharpness / 0.012, 0, 1))
    coverage = float(fg.sum() / fg.size)
    confidence = float(np.clip(0.45 + 0.32 * focus + 0.28 * min(coverage / 0.55, 1.0), 0.45, 0.97))

    extras = {
        "hue_uniformity": hue_uniformity,
        "blemish_signal": blemish_signal,
        "moisture_signal": moisture_signal,
        "color_richness": float(np.clip(sf.mean() * 1.3, 0, 1)),
        "edge_mean": edge_mean,
        "coverage": coverage,
        "confidence": confidence,
        "preview_size": img.size,
    }
    return features, extras


def defect_labels(extras, quality_score):
    labels = []
    b = extras["blemish_signal"]
    u = extras["hue_uniformity"]
    m = extras["moisture_signal"]
    if b > 0.52:
        labels.append({
            "label": "Surface blemishes / bruising",
            "confidence": round(min(0.95, 0.45 + b * 0.55), 2),
            "severity": "high" if b > 0.72 else "medium",
        })
    elif b > 0.34:
        labels.append({
            "label": "Minor skin marks",
            "confidence": round(0.38 + b * 0.4, 2),
            "severity": "low",
        })
    if u < 0.55:
        labels.append({
            "label": "Uneven colour development",
            "confidence": round(min(0.9, 0.4 + (0.55 - u)), 2),
            "severity": "medium" if u < 0.4 else "low",
        })
    if m < 0.38:
        labels.append({
            "label": "Moisture loss / shrivel risk",
            "confidence": round(min(0.88, 0.4 + (0.38 - m)), 2),
            "severity": "high" if m < 0.25 else "medium",
        })
    if quality_score < 45:
        labels.append({
            "label": "Over-ripe tissue breakdown",
            "confidence": 0.7,
            "severity": "high",
        })
    if not labels:
        labels.append({
            "label": "No visible defects",
            "confidence": 0.86,
            "severity": "none",
        })
    return labels


def quality_metrics(extras, score):
    b = extras["blemish_signal"]
    m = extras["moisture_signal"]
    u = extras["hue_uniformity"]
    richness = extras["color_richness"]
    return [
        {"key": "colour", "label": "Colour uniformity", "value": round(np.clip(u * 100, 5, 99))},
        {"key": "surface", "label": "Surface integrity", "value": round(np.clip(100 - b * 105, 4, 99))},
        {"key": "firmness", "label": "Firmness estimate", "value": round(np.clip(58 + m * 42 - b * 20, 5, 99))},
        {"key": "moisture", "label": "Moisture retention", "value": round(np.clip(m * 100, 5, 99))},
        {"key": "vitality", "label": "Freshness vitality", "value": round(np.clip(score * 0.62 + richness * 38, 5, 99))},
    ]

"""Procedural horticulture imagery used to bootstrap the demo ML models.

The production system is designed to be retrained on field photos. Until a
labelled dataset is available, these physically-plausible renders give the CNN
and the feature regressor a consistent signal to learn from.
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from crops import CROPS, BASE_COLORS, CROP_KEYS


def _noise(rng, size, scale):
    small = rng.normal(0, 1, (scale, scale))
    lo, hi = small.min(), small.max()
    small = (small - lo) / (hi - lo + 1e-6) * 255
    img = Image.fromarray(small.astype(np.uint8)).resize((size, size), Image.BICUBIC)
    return np.asarray(img, np.float32) / 255.0


def _shape_mask(crop, size, rng):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cx = size / 2 + rng.uniform(-0.03, 0.03) * size
    cy = size / 2 + rng.uniform(-0.03, 0.03) * size
    x = (xx - cx) / size
    y = (yy - cy) / size
    theta = np.arctan2(y, x)
    rot = rng.uniform(-0.25, 0.25) if crop == "banana" else 0.0
    xr = np.cos(rot) * x + np.sin(rot) * y
    yr = -np.sin(rot) * x + np.cos(rot) * y

    if crop in ("tomato", "onion"):
        r = np.sqrt(xr**2 + yr**2)
        outline = 0.33 * (1 + 0.035 * np.sin(5 * theta + rng.uniform(0, 6)))
        mask = r < outline
    elif crop in ("potato",):
        r = np.sqrt((xr / 0.29) ** 2 + (yr / 0.21) ** 2)
        mask = r < (1 + 0.05 * np.sin(4 * theta + rng.uniform(0, 6)))
    elif crop == "avocado":
        top = ((xr - 0.02) / 0.17) ** 2 + ((yr + 0.14) / 0.17) ** 2 < 1
        bottom = ((xr + 0.01) / 0.28) ** 2 + ((yr - 0.08) / 0.23) ** 2 < 1
        mask = top | bottom
    elif crop == "mango":
        r = np.sqrt((xr / 0.16) ** 2 + (yr / 0.31) ** 2)
        mask = r < 1.0
    elif crop == "banana":
        outer = ((xr / 0.34) ** 2 + (yr / 0.16) ** 2) < 1
        inner = (((xr - 0.10) / 0.30) ** 2 + ((yr - 0.05) / 0.17) ** 2) < 1
        mask = outer & ~inner
        mask |= ((xr + 0.28) ** 2 + yr**2) < 0.045
    elif crop in ("kale", "cabbage"):
        r = np.sqrt(xr**2 + yr**2)
        lobes = 0.31 * (1 + 0.16 * np.cos(7 * theta + rng.uniform(0, 6)))
        mask = r < lobes
        if crop == "cabbage":
            mask = np.sqrt(xr**2 + yr**2) < 0.36
    else:
        mask = np.sqrt(xr**2 + yr**2) < 0.32

    mask = Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(1.1)
    )
    return np.asarray(mask, np.float32) / 255.0


def render_produce(
    crop="tomato",
    ripeness=0.7,
    blemish=0.1,
    wilt=0.1,
    seed=0,
    size=128,
):
    """Render a single synthetic produce item on a neutral surface."""
    rng = np.random.default_rng(seed)
    info = CROPS[crop]
    base = np.array(BASE_COLORS[crop], np.float32) / 255.0

    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / max(size - 1, 1)
    backdrop = 0.58 + 0.10 * (1 - yy) + 0.05 * _noise(rng, size, 6) - 0.04 * (
        (xx - 0.5) ** 2 + (yy - 0.55) ** 2
    )
    bg = np.stack([backdrop * 1.02, backdrop * 0.99, backdrop * 0.92], axis=-1)

    mask = _shape_mask(crop, size, rng)[..., None]

    # Colour evolution: unripe green -> crop colour -> overripe brown.
    green = np.array([0.36, 0.50, 0.23], np.float32)
    brown = np.array([0.36, 0.24, 0.13], np.float32)
    ripe = np.clip(ripeness / 0.72, 0, 1)
    color = green * (1 - ripe) + base * ripe
    over = np.clip((ripeness - 0.78) / 0.4, 0, 1)
    color = color * (1 - over * 0.55) + brown * (over * 0.55)
    color = color * (1 - wilt * 0.35) + brown * (wilt * 0.25)

    # Soft studio lighting from the upper left.
    light = 0.72 + 0.45 * np.clip(1.0 - ((xx - 0.38) ** 2 + (yy - 0.32) ** 2) * 2.1, 0, 1)
    fg = color[None, None, :] * light[..., None]
    fg += (_noise(rng, size, max(10, size // 8))[..., None] - 0.5) * 0.07

    # Blemishes.
    spot_layer = np.zeros((size, size, 3), np.float32)
    spot_mask = np.zeros((size, size), np.float32)
    n_spots = int(2 + blemish * 26)
    for _ in range(n_spots):
        sx, sy = rng.uniform(0.18, 0.82) * size, rng.uniform(0.18, 0.82) * size
        sr = rng.uniform(0.012, 0.045) * size
        d = ((np.arange(size)[None, :] - sx) ** 2 + (np.arange(size)[:, None] - sy) ** 2) ** 0.5
        blob = np.clip(1 - d / sr, 0, 1) ** 1.5
        spot_mask = np.maximum(spot_mask, blob * (0.35 + 0.65 * blemish))
        shade = rng.uniform(0.45, 0.8)
        spot_layer += blob[..., None] * np.array([0.22, 0.13, 0.06]) * shade
    fg = fg * (1 - spot_mask[..., None] * 0.65) + spot_layer * 0.65

    # Wilt veins / shrivel lines.
    if wilt > 0.03:
        lines = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(lines)
        for _ in range(int(4 + wilt * 18)):
            x0, y0 = rng.uniform(0.2, 0.8) * size, rng.uniform(0.2, 0.8) * size
            pts = [(x0, y0)]
            ang = rng.uniform(0, 6.28)
            for _step in range(4):
                ang += rng.uniform(-0.8, 0.8)
                x0 += np.cos(ang) * size * 0.045
                y0 += np.sin(ang) * size * 0.045
                pts.append((x0, y0))
            draw.line(pts, fill=int(70 + 90 * wilt), width=max(1, size // 90))
        lines = np.asarray(lines.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255.0
        fg = fg * (1 - lines[..., None] * 0.28 * wilt)

    # Specular highlight.
    gloss = np.clip(
        1.0 - (((xx - 0.36) ** 2 + (yy - 0.3) ** 2) / 0.012) ** 0.7, 0, 1
    ) ** 2
    fg += gloss[..., None] * 0.18 * (1 - blemish * 0.4)

    # Ground shadow.
    shadow_mask = np.roll(np.roll(mask, int(size * 0.05), axis=0), int(size * 0.03), axis=1)
    bg = bg * (1 - shadow_mask * 0.18)

    out = bg * (1 - mask) + np.clip(fg, 0, 1) * mask
    out = np.clip(out + (rng.normal(0, 0.012, out.shape)), 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8))


def sample_params(category, rng):
    if category == "fresh":
        return rng.uniform(0.5, 0.75), rng.uniform(0, 0.05), rng.uniform(0, 0.05)
    if category == "ripe":
        return rng.uniform(0.78, 0.95), rng.uniform(0.15, 0.3), rng.uniform(0.08, 0.18)
    if category == "overripe":
        return rng.uniform(0.96, 1.15), rng.uniform(0.38, 0.6), rng.uniform(0.25, 0.45)
    return rng.uniform(0.2, 1.25), rng.uniform(0.65, 0.95), rng.uniform(0.5, 0.85)


def quality_from_params(ripeness, blemish, wilt, rng=None):
    noise = rng.normal(0, 2.0) if rng is not None else 0.0
    score = (
        97
        - 40 * blemish
        - 30 * wilt
        - 30 * abs(ripeness - 0.72)
        + noise
    )
    return float(np.clip(score, 5, 99))


def generate_dataset(n_per_class=150, size=112, seed=42):
    """Returns (images uint8 [N,H,W,3], cnn_labels, qualities, crops)."""
    rng = np.random.default_rng(seed)
    classes = ["fresh", "ripe", "overripe", "defective"]
    images, labels, qualities, crops = [], [], [], []
    for ci, category in enumerate(classes):
        for i in range(n_per_class):
            crop = CROP_KEYS[int(rng.integers(0, len(CROP_KEYS)))]
            ripe, blemish, wilt = sample_params(category, rng)
            im = render_produce(
                crop, ripe, blemish, wilt, seed=int(rng.integers(0, 2**31)), size=size
            )
            images.append(np.asarray(im, np.uint8))
            labels.append(ci)
            qualities.append(quality_from_params(ripe, blemish, wilt, rng))
            crops.append(crop)
    return (
        np.stack(images),
        np.array(labels, np.int64),
        np.array(qualities, np.float32),
        np.array(crops),
    )


def generate_shelf_life_dataset(n=3200, seed=7):
    """Weather + quality sequences with a physics-informed shelf-life target."""
    rng = np.random.default_rng(seed)
    crop_keys = CROP_KEYS
    X_seq, X_static, y, meta = [], [], [], []
    for _ in range(n):
        crop = crop_keys[int(rng.integers(0, len(crop_keys)))]
        info = CROPS[crop]
        quality = float(rng.uniform(38, 99))
        cold = int(rng.integers(0, 2))
        storage_temp = float(rng.uniform(2, 8) if cold else rng.uniform(16, 30))
        seq = []
        heat_days = 0.0
        humidity_days = 0.0
        rain_total = 0.0
        for day in range(5):
            if day < 3:
                tmax = float(np.clip(rng.normal(28.5, 4.0), 16, 41))
                tmin = tmax - rng.uniform(6, 12)
                rh = float(np.clip(rng.normal(68, 14), 30, 98))
                rain = float(rng.choice([0, 0, 0, 1.5, 6, 14, 25], p=[0.42, 0.12, 0.1, 0.14, 0.12, 0.07, 0.03]))
                wind = float(np.clip(rng.normal(11, 5), 1, 30))
                solar = float(np.clip(rng.normal(19, 5), 5, 30))
            else:
                tmax = float(np.clip(rng.normal(28.5, 4.0), 16, 41))
                tmin = tmax - rng.uniform(7, 11)
                rh = float(np.clip(rng.normal(66, 12), 32, 96))
                rain = float(rng.choice([0, 0, 4, 12], p=[0.6, 0.2, 0.15, 0.05]))
                wind = float(np.clip(rng.normal(10, 4), 1, 26))
                solar = float(np.clip(rng.normal(20, 4), 8, 29))
            seq.append(
                [
                    tmax / 45,
                    tmin / 45,
                    rh / 100,
                    rain / 50,
                    wind / 30,
                    solar / 35,
                    (day / 5),
                    storage_temp / 40,
                    cold,
                ]
            )
            heat_days += max(0.0, tmax - info["optimal_temp_c"])
            humidity_days += max(0.0, rh - 70)
            rain_total += rain
        stress = heat_days * 0.011 + humidity_days * 0.004 + rain_total * 0.006
        if cold:
            stress *= 0.18
        shelf = (
            info["base_shelf_days"]
            * (quality / 100) ** 1.35
            * np.exp(-stress)
            * rng.uniform(0.88, 1.12)
        )
        if cold:
            shelf *= info["cold_multiplier"] * 0.86
        shelf = float(np.clip(shelf, 0.6, 75))
        static = [quality / 100, info["base_shelf_days"] / 45, cold, storage_temp / 40]
        static += [1.0 if crop == k else 0.0 for k in crop_keys]
        X_seq.append(seq)
        X_static.append(static)
        y.append(shelf)
        meta.append({"crop": crop, "cold": cold, "quality": quality})
    return (
        np.array(X_seq, np.float32),
        np.array(X_static, np.float32),
        np.array(y, np.float32),
        meta,
    )

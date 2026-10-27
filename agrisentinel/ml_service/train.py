"""Train the AgriSentinel demo models on procedurally generated data.

Usage:  python train.py            full training (~1-2 min on CPU)
        python train.py --quick    fewer samples/epochs
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import torch
import torch.nn as nn
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from torch.utils.data import DataLoader, TensorDataset

from crops import CROP_KEYS
from features import FEATURE_NAMES, extract
from models import QualityCNN, ShelfLifeLSTM
from synth import generate_dataset, generate_shelf_life_dataset

ART = Path(__file__).parent / "artifacts"
ART.mkdir(exist_ok=True)
CLASSES = ["fresh", "ripe", "overripe", "defective"]
CLASS_QUALITY = np.array([92.0, 76.0, 54.0, 28.0], dtype=np.float32)
SHELF_SCALE = 81.0


def seed_everything(seed=42):
    np.random.seed(seed)
    torch.manual_seed(seed)


def train_cnn(n_per_class=200, epochs=22):
    from PIL import Image

    print(f"[cnn] generating {n_per_class * 4} synthetic images...")
    imgs, labels, qualities, crops = generate_dataset(n_per_class=n_per_class, size=112)
    idx = np.random.permutation(len(imgs))
    split = int(len(idx) * 0.84)
    train_idx, val_idx = idx[:split], idx[split:]

    x = torch.from_numpy(imgs).float().permute(0, 3, 1, 2) / 127.5 - 1.0
    y = torch.from_numpy(labels).long()
    train_ds = TensorDataset(x[train_idx], y[train_idx])
    val_x, val_y = x[val_idx], y[val_idx]
    loader = DataLoader(train_ds, batch_size=32, shuffle=True)

    model = QualityCNN()
    opt = torch.optim.AdamW(model.parameters(), lr=2.4e-3, weight_decay=2e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs, eta_min=2e-4)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)

    for epoch in range(epochs):
        model.train()
        total, correct, loss_sum = 0, 0, 0.0
        for bx, by in loader:
            if np.random.rand() < 0.5:
                bx = torch.flip(bx, dims=[3])
            gain = 1.0 + (np.random.rand() - 0.5) * 0.18
            bx = (bx * gain).clamp(-1, 1)
            opt.zero_grad()
            logits = model(bx)
            loss = loss_fn(logits, by)
            loss.backward()
            opt.step()
            loss_sum += loss.item() * len(bx)
            correct += (logits.argmax(1) == by).sum().item()
            total += len(bx)
        scheduler.step()
        print(f"[cnn] epoch {epoch + 1}/{epochs} loss={loss_sum / total:.3f} acc={correct / total:.3f}")

    model.eval()
    with torch.no_grad():
        val_acc = (model(val_x).argmax(1) == val_y).float().mean().item()

    torch.save(
        {"state_dict": model.state_dict(), "classes": CLASSES, "img_size": 112},
        ART / "quality_cnn.pt",
    )

    # scikit-learn quality regressor on handcrafted features.
    print("[quality] extracting handcrafted features...")
    feats = []
    for im in imgs:
        f, _ = extract(Image.fromarray(im))
        feats.append(f)
    feats = np.stack(feats)
    rf = RandomForestRegressor(n_estimators=180, max_depth=14, min_samples_leaf=2, random_state=42, n_jobs=-1)
    rf.fit(feats[train_idx], qualities[train_idx])
    pred = rf.predict(feats[val_idx])
    mae = float(mean_absolute_error(qualities[val_idx], pred))
    r2 = float(r2_score(qualities[val_idx], pred))
    joblib.dump(rf, ART / "quality_rf.joblib")
    print(f"[quality] val MAE={mae:.2f} R2={r2:.3f}")

    return {"accuracy": round(val_acc, 4), "mae": round(mae, 2), "r2": round(r2, 3),
            "samples": int(len(imgs)), "epochs": epochs}


def train_lstm(n=2600, epochs=26):
    print(f"[shelf] generating {n} weather sequences...")
    seq, static, y_days, _ = generate_shelf_life_dataset(n=n)
    y = np.log1p(y_days) / np.log1p(SHELF_SCALE)
    idx = np.random.permutation(len(seq))
    split = int(len(idx) * 0.84)
    tr, va = idx[:split], idx[split:]

    seq_t = torch.from_numpy(seq)
    st_t = torch.from_numpy(static)
    y_t = torch.from_numpy(y.astype(np.float32))
    ds = TensorDataset(seq_t[tr], st_t[tr], y_t[tr])
    loader = DataLoader(ds, batch_size=64, shuffle=True)

    model = ShelfLifeLSTM()
    opt = torch.optim.AdamW(model.parameters(), lr=2.5e-3, weight_decay=1e-4)
    loss_fn = nn.SmoothL1Loss()
    for epoch in range(epochs):
        model.train()
        total, loss_sum = 0, 0.0
        for bs, bst, by in loader:
            opt.zero_grad()
            out = model(bs, bst)
            loss = loss_fn(out, by)
            loss.backward()
            opt.step()
            loss_sum += loss.item() * len(bs)
            total += len(bs)
        if (epoch + 1) % 6 == 0:
            print(f"[shelf] epoch {epoch + 1}/{epochs} loss={loss_sum / total:.4f}")

    model.eval()
    with torch.no_grad():
        p = model(seq_t[va], st_t[va]).numpy()
    pred_days = np.expm1(np.clip(p, 0, 1.3) * np.log1p(SHELF_SCALE))
    mae_days = float(np.mean(np.abs(pred_days - y_days[va])))
    torch.save({"state_dict": model.state_dict(), "shelf_scale": SHELF_SCALE}, ART / "shelf_lstm.pt")
    print(f"[shelf] val MAE={mae_days:.2f} days")
    return {"mae_days": round(mae_days, 2), "samples": int(n), "epochs": epochs}


def main():
    t0 = time.time()
    quick = "--quick" in sys.argv
    seed_everything()
    if quick:
        cnn_metrics = train_cnn(n_per_class=70, epochs=4)
        lstm_metrics = train_lstm(n=900, epochs=10)
    else:
        cnn_metrics = train_cnn()
        lstm_metrics = train_lstm()
    meta = {
        "version": "1.4.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "cnn": cnn_metrics,
        "quality_rf": {"mae": cnn_metrics["mae"], "r2": cnn_metrics["r2"]},
        "shelf_lstm": lstm_metrics,
        "classes": CLASSES,
        "crop_keys": CROP_KEYS,
        "feature_names": FEATURE_NAMES,
        "shelf_scale": SHELF_SCALE,
        "training_seconds": round(time.time() - t0, 1),
        "data_source": "procedural horticulture renders + agronomic simulation",
    }
    (ART / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"[done] artifacts in {ART} in {meta['training_seconds']}s")


if __name__ == "__main__":
    main()

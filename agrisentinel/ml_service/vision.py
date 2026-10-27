"""Reject people and non-horticultural photos before quality analysis."""

from pathlib import Path

import numpy as np
import torch
from PIL import Image

ART = Path(__file__).parent / "artifacts"
VISION_WEIGHTS = ART / "vision_mobilenet_v3_small.pth"

# ImageNet labels that correspond to raw fruit, vegetables, nuts or mushrooms.
PRODUCE_LABELS = {
    "Granny Smith",
    "strawberry",
    "orange",
    "lemon",
    "fig",
    "pineapple",
    "banana",
    "jackfruit",
    "custard apple",
    "pomegranate",
    "acorn squash",
    "butternut squash",
    "spaghetti squash",
    "cucumber",
    "artichoke",
    "bell pepper",
    "cardoon",
    "mushroom",
    "head cabbage",
    "broccoli",
    "cauliflower",
    "zucchini",
    "corn",
    "mashed potato",
    "rapeseed",
    "acorn",
    "hip",
    "buckeye",
    "coral fungus",
    "agaric",
    "gyromitra",
    "stinkhorn",
    "earthstar",
    "hen-of-the-woods",
    "bolete",
}

HUMAN_LABELS = {
    "person",
    "man",
    "woman",
    "groom",
    "bridegroom",
    "ballplayer",
    "scuba diver",
    "baseball player",
    "face",
    "wig",
}

NOT_PRODUCE_MESSAGE = (
    "This does not look like horticultural produce. Upload a clear photo of your harvest "
    "(tomato, kale, avocado, mango, potato, onion, cabbage or banana)."
)
PERSON_MESSAGE = "This looks like a person. Upload a photo of the harvested produce only."


class ProduceValidator:
    """Small ImageNet classifier plus face detection used as an upload guard."""

    def __init__(self):
        self.model = None
        self.categories = []
        self.prep = None
        self.cv2 = None
        self.frontal = None
        self.profile = None
        self._load_classifier()
        self._load_face_detectors()

    def _load_classifier(self):
        try:
            import torchvision
            from torchvision import transforms

            weights = torchvision.models.MobileNet_V3_Small_Weights.DEFAULT
            self.categories = weights.meta["categories"]
            if VISION_WEIGHTS.exists():
                model = torchvision.models.mobilenet_v3_small(weights=None)
                model.load_state_dict(torch.load(VISION_WEIGHTS, map_location="cpu"))
            else:
                model = torchvision.models.mobilenet_v3_small(weights=weights)
            model.eval()
            self.model = model
            self.prep = transforms.Compose([
                transforms.Resize(256),
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
            print("[ml] produce validator ready")
        except Exception as exc:
            print(f"[ml] produce validator unavailable: {exc}")

    def _load_face_detectors(self):
        try:
            import cv2

            self.cv2 = cv2
            cascade_dir = Path(cv2.data.haarcascades)
            frontal = cv2.CascadeClassifier(str(cascade_dir / "haarcascade_frontalface_default.xml"))
            profile = cv2.CascadeClassifier(str(cascade_dir / "haarcascade_profileface.xml"))
            self.frontal = None if frontal.empty() else frontal
            self.profile = None if profile.empty() else profile
        except Exception as exc:
            print(f"[ml] face detector unavailable: {exc}")

    def _face_count(self, image):
        if not self.cv2 or (self.frontal is None and self.profile is None):
            return 0
        rgb = np.asarray(image.convert("RGB"))
        gray = self.cv2.cvtColor(rgb, self.cv2.COLOR_RGB2GRAY)
        gray = self.cv2.equalizeHist(gray)
        # Only count faces that take up a meaningful part of the frame. Small
        # detections are usually texture false positives on produce (a mango
        # photo can trigger the cascade at ~15% of the frame).
        min_side = max(32, int(min(gray.shape[:2]) * 0.18))
        count = 0
        for cascade in (self.frontal, self.profile):
            if cascade is None:
                continue
            faces = cascade.detectMultiScale(
                gray, scaleFactor=1.08, minNeighbors=7, minSize=(min_side, min_side)
            )
            count += len(faces)
        return count

    def _classify(self, image):
        if self.model is None or self.prep is None:
            return None
        with torch.inference_mode():
            probabilities = self.model(self.prep(image).unsqueeze(0)).softmax(1)[0]
        values, indices = probabilities.topk(5)
        return [
            (self.categories[int(index)], float(value))
            for value, index in zip(values, indices)
        ]

    def _person(self, label, confidence, faces):
        return {
            "valid": False,
            "reason": "person",
            "message": PERSON_MESSAGE,
            "label": label or "person",
            "confidence": round(confidence, 3),
            "faces": faces,
        }

    def validate(self, image: Image.Image, is_sample: bool = False) -> dict:
        faces = self._face_count(image)

        # Bundled demo samples are synthetic renders and confuse ImageNet models.
        if is_sample:
            if faces:
                return self._person("person", 1.0, faces)
            return {
                "valid": True,
                "reason": "sample",
                "message": "",
                "label": "sample",
                "confidence": 1.0,
                "faces": 0,
            }

        top = self._classify(image)
        if top is None:
            if faces:
                return self._person("", 0.0, faces)
            return {
                "valid": True,
                "reason": "validator_unavailable",
                "message": "",
                "label": "",
                "confidence": 0.0,
                "faces": 0,
            }

        top_label, top_confidence = top[0]
        allowed = [(label, confidence) for label, confidence in top if label in PRODUCE_LABELS]
        best_allowed = max((confidence for _, confidence in allowed), default=0.0)
        # A confident produce match wins over a spurious face detection.
        strong_produce = (
            top_label in PRODUCE_LABELS and top_confidence >= 0.30
        ) or best_allowed >= 0.35

        if faces and not strong_produce:
            return self._person(top_label, top_confidence, faces)

        if top_label in PRODUCE_LABELS or best_allowed >= 0.10:
            label, confidence = (
                (top_label, top_confidence)
                if top_label in PRODUCE_LABELS
                else max(allowed, key=lambda item: item[1])
            )
            return {
                "valid": True,
                "reason": "ok",
                "message": "",
                "label": label,
                "confidence": round(confidence, 3),
                "faces": 0,
            }

        if top_label in HUMAN_LABELS:
            return self._person(top_label, top_confidence, faces)

        return {
            "valid": False,
            "reason": "not_produce",
            "message": NOT_PRODUCE_MESSAGE,
            "label": top_label,
            "confidence": round(top_confidence, 3),
            "faces": 0,
        }

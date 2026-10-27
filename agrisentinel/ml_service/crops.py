"""Crop agronomy reference data shared by the ML models."""

CROPS = {
    "tomato": {
        "label": "Tomato",
        "base_shelf_days": 8,
        "optimal_temp_c": 11,
        "cold_multiplier": 2.4,
        "hue_center": 0.02,
        "storage_note": "Store at 10-13 C, away from direct sun. Never below 8 C.",
    },
    "kale": {
        "label": "Kale",
        "base_shelf_days": 5,
        "optimal_temp_c": 2,
        "cold_multiplier": 2.2,
        "hue_center": 0.28,
        "storage_note": "Keep humid and cold (0-4 C). Leaves wilt within hours in heat.",
    },
    "avocado": {
        "label": "Avocado",
        "base_shelf_days": 7,
        "optimal_temp_c": 7,
        "cold_multiplier": 2.6,
        "hue_center": 0.22,
        "storage_note": "Store at 5-8 C. Chilling injury below 4 C.",
    },
    "mango": {
        "label": "Mango",
        "base_shelf_days": 6,
        "optimal_temp_c": 12,
        "cold_multiplier": 2.0,
        "hue_center": 0.12,
        "storage_note": "Store at 10-13 C. Ripe fruit is very heat sensitive.",
    },
    "potato": {
        "label": "Potato",
        "base_shelf_days": 32,
        "optimal_temp_c": 8,
        "cold_multiplier": 2.8,
        "hue_center": 0.09,
        "storage_note": "Dark, ventilated, 7-10 C. Avoid light to prevent greening.",
    },
    "onion": {
        "label": "Onion",
        "base_shelf_days": 40,
        "optimal_temp_c": 5,
        "cold_multiplier": 2.3,
        "hue_center": 0.9,
        "storage_note": "Dry, ventilated storage at 0-5 C. Keep humidity below 70%.",
    },
    "cabbage": {
        "label": "Cabbage",
        "base_shelf_days": 14,
        "optimal_temp_c": 2,
        "cold_multiplier": 2.5,
        "hue_center": 0.3,
        "storage_note": "Cold and humid (0-3 C, 95% RH) keeps heads firm.",
    },
    "banana": {
        "label": "Banana",
        "base_shelf_days": 9,
        "optimal_temp_c": 13,
        "cold_multiplier": 1.9,
        "hue_center": 0.14,
        "storage_note": "Store at 13-15 C. Below 11 C causes chilling injury.",
    },
    "produce": {
        "label": "Fresh produce",
        "base_shelf_days": 9,
        "optimal_temp_c": 8,
        "cold_multiplier": 2.3,
        "hue_center": 0.15,
        "storage_note": "Keep cool, shaded and ventilated.",
    },
}

# The trained models expect one-hot values for the eight named crops only.
CROP_KEYS = ["tomato", "kale", "avocado", "mango", "potato", "onion", "cabbage", "banana"]

BASE_COLORS = {
    "tomato": (205, 58, 39),
    "kale": (52, 104, 48),
    "avocado": (76, 101, 46),
    "mango": (222, 160, 45),
    "potato": (181, 139, 88),
    "onion": (150, 72, 102),
    "cabbage": (140, 181, 99),
    "banana": (224, 196, 67),
}

INDEX_TO_CROP = {i: k for i, k in enumerate(CROP_KEYS)}

"""Crop, pricing and region reference data."""

CROPS = {
    "tomato": {"label": "Tomato", "base_shelf_days": 8, "optimal_temp_c": 11, "cold_multiplier": 2.4,
               "color": "#d2553a", "market_price_kes": 120, "storage_note": "Store at 10-13 C away from direct sun."},
    "kale": {"label": "Kale", "base_shelf_days": 5, "optimal_temp_c": 2, "cold_multiplier": 2.2,
             "color": "#3f7a3a", "market_price_kes": 80, "storage_note": "Keep humid and cold at 0-4 C."},
    "avocado": {"label": "Avocado", "base_shelf_days": 7, "optimal_temp_c": 7, "cold_multiplier": 2.6,
                "color": "#5c7a37", "market_price_kes": 200, "storage_note": "Store at 5-8 C; avoid chilling injury."},
    "mango": {"label": "Mango", "base_shelf_days": 6, "optimal_temp_c": 12, "cold_multiplier": 2.0,
              "color": "#dea52d", "market_price_kes": 150, "storage_note": "Store at 10-13 C; ripe fruit is heat sensitive."},
    "potato": {"label": "Potato", "base_shelf_days": 32, "optimal_temp_c": 8, "cold_multiplier": 2.8,
               "color": "#b58b57", "market_price_kes": 70, "storage_note": "Dark, ventilated storage at 7-10 C."},
    "onion": {"label": "Onion", "base_shelf_days": 40, "optimal_temp_c": 5, "cold_multiplier": 2.3,
              "color": "#96506e", "market_price_kes": 90, "storage_note": "Dry, ventilated storage below 70% humidity."},
    "cabbage": {"label": "Cabbage", "base_shelf_days": 14, "optimal_temp_c": 2, "cold_multiplier": 2.5,
                "color": "#8cb563", "market_price_kes": 60, "storage_note": "Cold and humid at 0-3 C keeps heads firm."},
    "banana": {"label": "Banana", "base_shelf_days": 9, "optimal_temp_c": 13, "cold_multiplier": 1.9,
               "color": "#dfbd3f", "market_price_kes": 110, "storage_note": "Store at 13-15 C; below 11 C causes injury."},
    "produce": {"label": "Fresh produce", "base_shelf_days": 9, "optimal_temp_c": 8, "cold_multiplier": 2.3,
                "color": "#4b7a45", "market_price_kes": 100, "storage_note": "Keep cool, shaded and ventilated."},
}

PRICING = {"mobile": 3.5, "solar": 2.5}  # KES per kg per day

REGIONS = [
    {"name": "Nakuru", "lat": -0.3031, "lng": 36.0800},
    {"name": "Kiambu", "lat": -1.1714, "lng": 36.8356},
    {"name": "Meru", "lat": 0.0515, "lng": 37.6456},
    {"name": "Eldoret", "lat": 0.5143, "lng": 35.2698},
    {"name": "Naivasha", "lat": -0.7167, "lng": 36.4359},
    {"name": "Machakos", "lat": -1.5177, "lng": 37.2634},
    {"name": "Kisumu", "lat": -0.0917, "lng": 34.7680},
    {"name": "Nyeri", "lat": -0.4210, "lng": 36.9476},
]

GRADES = {
    "A": {"label": "Premium", "color": "#2f7d5a", "min": 85},
    "B": {"label": "Market ready", "color": "#7a9a3d", "min": 71},
    "C": {"label": "Fair / local market", "color": "#c08a2e", "min": 56},
    "D": {"label": "At risk", "color": "#b34b3e", "min": 0},
}

DEFECT_SEVERITY_WEIGHT = {"none": 0, "low": 1, "medium": 2, "high": 3}


def crop_label(key):
    return CROPS.get(key, {}).get("label", key.title())


def crop_list():
    return [
        {
            "key": key,
            "label": info["label"],
            "color": info["color"],
            "base_shelf_days": info["base_shelf_days"],
            "optimal_temp_c": info["optimal_temp_c"],
            "market_price_kes": info["market_price_kes"],
            "storage_note": info["storage_note"],
        }
        for key, info in CROPS.items()
    ]

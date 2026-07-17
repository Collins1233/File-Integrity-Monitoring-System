import json
import os

from config import (
    MONITORING_INTERVAL_SECONDS,
    SETTINGS_FILE,
    HASH_ONLY_SIZE_BYTES,
)

DEFAULT_SETTINGS = {
    "monitoring_interval_seconds": MONITORING_INTERVAL_SECONDS,
    "monitoring_enabled": True,
    "excluded_extensions": [".tmp", ".swp", ".DS_Store"],
    "hash_only_enabled": True,
    "hash_only_size_bytes": HASH_ONLY_SIZE_BYTES,
    "max_reports_retained": 5,
}


def load_settings() -> dict:
    if not os.path.exists(SETTINGS_FILE):
        return DEFAULT_SETTINGS.copy()

    with open(SETTINGS_FILE, "r", encoding="utf-8") as file:
        stored = json.load(file)

    merged = DEFAULT_SETTINGS.copy()
    merged.update(stored)
    return merged


def save_settings(settings: dict) -> dict:
    current = load_settings()
    current.update(settings)

    with open(SETTINGS_FILE, "w", encoding="utf-8") as file:
        json.dump(current, file, indent=4)

    return current

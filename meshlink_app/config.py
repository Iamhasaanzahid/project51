import os
from functools import lru_cache


@lru_cache()
def get_settings():
    return Settings()


class Settings:
    APP_NAME = "MeshLink"
    VERSION = "0.1.0"
    DESCRIPTION = "Free, secure, offline-first messaging"

    UIN_PREFIX = "MZ"
    UIN_LENGTH = 6

    ECC_CURVE = "X25519"
    SYMMETRIC_CIPHER = "AES-GCM"
    KDF = "HKDF-SHA256"

    BLUETOOTH_MAX_HOPS = 5
    BLUETOOTH_RANGE_M = 30
    MESH_DISCOVERY_TIMEOUT = 30

    EMAIL_REGEX = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

    DB_PATH = os.getenv("MESHLINK_DB", "meshlink.db")

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    def model_validate(self, data: dict) -> "Settings":
        for k, v in data.items():
            setattr(self, k, v)
        return self
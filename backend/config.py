"""
Configuration management for the web app.

Supports both environment file configuration and runtime overrides via the UI.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import BaseModel
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # MS Photos database
    ms_photos_db: str = "../../legacy_data/MediaDb.v1.sqlite"

    # Immich API
    immich_api_url: str = "http://localhost:2283"
    immich_api_key: str = ""

    # Immich PostgreSQL
    immich_db_host: str = "localhost"
    immich_db_port: int = 5432
    immich_db_name: str = "immich"
    immich_db_user: str = "postgres"
    immich_db_password: str = "immich_db_password"

    # Migration settings
    min_overlap_score: float = 0.3
    min_photos_in_cluster: int = 1

    # Path mappings for converting Immich container paths to local filesystem paths.
    # Configure this in config.env as a JSON string, e.g.:
    # PATH_MAPPINGS='{"/external/photos": "C:/Users/you/Pictures"}'
    path_mappings: dict = {}

    class Config:
        env_file = "../config.env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def ms_photos_db_path(self) -> Path:
        """Get absolute path to MS Photos database."""
        path = Path(self.ms_photos_db)
        if path.is_absolute():
            return path
        # Resolve relative to webapp directory (parent of backend)
        base = Path(__file__).parent.parent
        return (base / self.ms_photos_db).resolve()

    @property
    def immich_db_url(self) -> str:
        """Get PostgreSQL connection URL."""
        return f"postgresql://{self.immich_db_user}:{self.immich_db_password}@{self.immich_db_host}:{self.immich_db_port}/{self.immich_db_name}"


# Runtime overrides - these take precedence over env file settings
class RuntimeOverrides:
    """Runtime configuration overrides set via the UI."""

    def __init__(self):
        self.ms_photos_db: Optional[str] = None
        self.immich_api_url: Optional[str] = None
        self.immich_api_key: Optional[str] = None
        self.immich_db_host: Optional[str] = None
        self.immich_db_port: Optional[int] = None
        self.immich_db_name: Optional[str] = None
        self.immich_db_user: Optional[str] = None
        self.immich_db_password: Optional[str] = None


_settings_instance: Optional[Settings] = None
_runtime_overrides = RuntimeOverrides()


def get_settings() -> Settings:
    """Get settings instance (cached after first load)."""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance


def get_runtime_overrides() -> RuntimeOverrides:
    """Get runtime overrides instance."""
    return _runtime_overrides


def get_effective_ms_photos_db() -> str:
    """Get effective MS Photos database path (override or default)."""
    if _runtime_overrides.ms_photos_db is not None:
        return _runtime_overrides.ms_photos_db
    return get_settings().ms_photos_db


def get_effective_ms_photos_db_path() -> Path:
    """Get effective absolute path to MS Photos database."""
    db_path = get_effective_ms_photos_db()
    path = Path(db_path)
    if path.is_absolute():
        return path
    base = Path(__file__).parent.parent
    return (base / db_path).resolve()


def get_effective_immich_api_url() -> str:
    """Get effective Immich API URL (override or default)."""
    if _runtime_overrides.immich_api_url is not None:
        return _runtime_overrides.immich_api_url
    return get_settings().immich_api_url


def get_effective_immich_api_key() -> str:
    """Get effective Immich API key (override or default)."""
    if _runtime_overrides.immich_api_key is not None:
        return _runtime_overrides.immich_api_key
    return get_settings().immich_api_key


def get_effective_immich_db_url() -> str:
    """Get effective Immich PostgreSQL connection URL."""
    host = _runtime_overrides.immich_db_host or get_settings().immich_db_host
    port = _runtime_overrides.immich_db_port or get_settings().immich_db_port
    name = _runtime_overrides.immich_db_name or get_settings().immich_db_name
    user = _runtime_overrides.immich_db_user or get_settings().immich_db_user
    password = _runtime_overrides.immich_db_password or get_settings().immich_db_password
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


def get_effective_immich_db_config() -> dict:
    """Get effective Immich database configuration as a dict."""
    return {
        "host": _runtime_overrides.immich_db_host or get_settings().immich_db_host,
        "port": _runtime_overrides.immich_db_port or get_settings().immich_db_port,
        "name": _runtime_overrides.immich_db_name or get_settings().immich_db_name,
        "user": _runtime_overrides.immich_db_user or get_settings().immich_db_user,
        "password": _runtime_overrides.immich_db_password or get_settings().immich_db_password,
    }


def update_ms_photos_db(path: str) -> None:
    """Update the MS Photos database path at runtime."""
    _runtime_overrides.ms_photos_db = path


def update_immich_api(url: Optional[str] = None, api_key: Optional[str] = None) -> None:
    """Update Immich API settings at runtime."""
    if url is not None:
        _runtime_overrides.immich_api_url = url
    if api_key is not None:
        _runtime_overrides.immich_api_key = api_key


def update_immich_db(
    host: Optional[str] = None,
    port: Optional[int] = None,
    name: Optional[str] = None,
    user: Optional[str] = None,
    password: Optional[str] = None
) -> None:
    """Update Immich database settings at runtime."""
    if host is not None:
        _runtime_overrides.immich_db_host = host
    if port is not None:
        _runtime_overrides.immich_db_port = port
    if name is not None:
        _runtime_overrides.immich_db_name = name
    if user is not None:
        _runtime_overrides.immich_db_user = user
    if password is not None:
        _runtime_overrides.immich_db_password = password


def get_current_config() -> dict:
    """Get current effective configuration (with sensitive values masked)."""
    return {
        "ms_photos_db": get_effective_ms_photos_db(),
        "ms_photos_db_path": str(get_effective_ms_photos_db_path()),
        "immich_api_url": get_effective_immich_api_url(),
        "immich_api_key_set": bool(get_effective_immich_api_key()),
        "immich_db_host": _runtime_overrides.immich_db_host or get_settings().immich_db_host,
        "immich_db_port": _runtime_overrides.immich_db_port or get_settings().immich_db_port,
        "immich_db_name": _runtime_overrides.immich_db_name or get_settings().immich_db_name,
        "immich_db_user": _runtime_overrides.immich_db_user or get_settings().immich_db_user,
        "immich_db_password_set": bool(_runtime_overrides.immich_db_password or get_settings().immich_db_password),
        "has_overrides": {
            "ms_photos_db": _runtime_overrides.ms_photos_db is not None,
            "immich_api_url": _runtime_overrides.immich_api_url is not None,
            "immich_api_key": _runtime_overrides.immich_api_key is not None,
            "immich_db": any([
                _runtime_overrides.immich_db_host is not None,
                _runtime_overrides.immich_db_port is not None,
                _runtime_overrides.immich_db_name is not None,
                _runtime_overrides.immich_db_user is not None,
                _runtime_overrides.immich_db_password is not None,
            ]),
        }
    }

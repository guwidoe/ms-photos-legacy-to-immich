"""
Configuration management for the web app.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


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


_settings_instance = None

def get_settings() -> Settings:
    """Get settings instance (cached after first load)."""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance

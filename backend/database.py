"""
Database access layer for MS Photos and Immich databases.
"""

import sqlite3
import psycopg2
from contextlib import contextmanager
from typing import Generator
from config import get_settings


@contextmanager
def get_ms_photos_connection() -> Generator[sqlite3.Connection, None, None]:
    """Get connection to MS Photos SQLite database."""
    settings = get_settings()
    conn = sqlite3.connect(settings.ms_photos_db_path)
    conn.create_collation(
        "NoCaseUnicode",
        lambda x, y: (x.lower() > y.lower()) - (x.lower() < y.lower())
    )
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_immich_connection() -> Generator:
    """Get connection to Immich PostgreSQL database."""
    settings = get_settings()
    conn = psycopg2.connect(
        host=settings.immich_db_host,
        port=settings.immich_db_port,
        dbname=settings.immich_db_name,
        user=settings.immich_db_user,
        password=settings.immich_db_password,
    )
    try:
        yield conn
    finally:
        conn.close()


def test_ms_photos_connection() -> dict:
    """Test MS Photos database connection and return stats."""
    settings = get_settings()
    if not settings.ms_photos_db_path.exists():
        return {"connected": False, "error": f"Database not found: {settings.ms_photos_db_path}"}
    
    try:
        with get_ms_photos_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM Person")
            total_persons = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT COUNT(*) FROM Person 
                WHERE Person_Name IS NOT NULL AND Person_Name != '' AND TRIM(Person_Name) != ''
            """)
            named_persons = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT COUNT(DISTINCT Person_Name) FROM Person 
                WHERE Person_Name IS NOT NULL AND Person_Name != '' AND TRIM(Person_Name) != ''
            """)
            unique_named_persons = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM Face")
            total_faces = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM Item")
            total_items = cursor.fetchone()[0]
            
            return {
                "connected": True,
                "total_persons": total_persons,
                "named_persons": named_persons,
                "unique_named_persons": unique_named_persons,
                "total_faces": total_faces,
                "total_items": total_items,
            }
    except Exception as e:
        return {"connected": False, "error": str(e)}


def test_immich_connection() -> dict:
    """Test Immich database connection and return stats."""
    try:
        with get_immich_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM person")
            total_persons = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM person WHERE name IS NOT NULL AND name != ''")
            named_persons = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(DISTINCT name) FROM person WHERE name IS NOT NULL AND name != ''")
            unique_named_persons = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM asset_face WHERE "deletedAt" IS NULL')
            total_faces = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM asset WHERE "deletedAt" IS NULL')
            total_assets = cursor.fetchone()[0]
            
            return {
                "connected": True,
                "total_persons": total_persons,
                "named_persons": named_persons,
                "unique_named_persons": unique_named_persons,
                "unnamed_persons": total_persons - named_persons,
                "total_faces": total_faces,
                "total_assets": total_assets,
            }
    except Exception as e:
        return {"connected": False, "error": str(e)}

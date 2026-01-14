"""Debug name comparison."""

from database import get_ms_photos_connection, get_immich_connection

with get_immich_connection() as conn:
    c = conn.cursor()
    c.execute("SELECT DISTINCT LOWER(name) FROM person WHERE name IS NOT NULL AND name != ''")
    immich_lower = set(r[0] for r in c.fetchall())
    print(f"Immich unique lowercase names: {len(immich_lower)}")

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    c.execute("SELECT DISTINCT LOWER(Person_Name) FROM Person WHERE Person_Name IS NOT NULL AND Person_Name != '' AND TRIM(Person_Name) != ''")
    ms_lower = set(r[0] for r in c.fetchall())
    print(f"MS unique lowercase names: {len(ms_lower)}")

missing = ms_lower - immich_lower
print(f"Missing (in MS but not Immich): {len(missing)}")
print(f"Sample: {sorted(list(missing))[:20]}")

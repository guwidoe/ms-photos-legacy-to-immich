"""Explore the MS Photos Legacy shared database to see what data it contains."""

import sqlite3
from pathlib import Path

# Update this path to your MS Photos shared database location
SHARED_DB = Path(r"path/to/Microsoft.PhotosLegacy_8wekyb3d8bbwe_shared.sqlite")

print("=" * 70)
print("EXPLORING MS PHOTOS LEGACY SHARED DATABASE")
print("=" * 70)

print(f"\nDatabase: {SHARED_DB}")
print(f"Exists: {SHARED_DB.exists()}")
if SHARED_DB.exists():
    print(f"Size: {SHARED_DB.stat().st_size / 1024 / 1024:.1f} MB")

if not SHARED_DB.exists():
    print("\nERROR: Database not found!")
    exit(1)

conn = sqlite3.connect(SHARED_DB)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# List all tables
print("\n" + "=" * 70)
print("TABLES IN DATABASE")
print("=" * 70)

c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [row[0] for row in c.fetchall()]
print(f"\nFound {len(tables)} tables:")
for table in tables:
    c.execute(f"SELECT COUNT(*) FROM [{table}]")
    count = c.fetchone()[0]
    print(f"  {table}: {count} rows")

# Look for person/face related tables
print("\n" + "=" * 70)
print("CHECKING FOR PERSON/FACE RELATED DATA")
print("=" * 70)

person_tables = [t for t in tables if 'person' in t.lower() or 'face' in t.lower() or 'people' in t.lower()]
if person_tables:
    print(f"\nFound person/face related tables: {person_tables}")
    for table in person_tables:
        c.execute(f"PRAGMA table_info([{table}])")
        columns = c.fetchall()
        print(f"\n  {table} columns:")
        for col in columns:
            print(f"    {col['name']} ({col['type']})")
else:
    print("\nNo person/face related tables found directly.")

# Check schema of interesting tables
print("\n" + "=" * 70)
print("EXPLORING KEY TABLES")
print("=" * 70)

for table in tables[:15]:  # Look at first 15 tables
    c.execute(f"PRAGMA table_info([{table}])")
    columns = c.fetchall()
    col_names = [col['name'] for col in columns]
    
    # Check if any column names suggest person/face data
    interesting = any(keyword in ' '.join(col_names).lower() for keyword in ['person', 'face', 'name', 'tag', 'label'])
    if interesting or table in tables[:5]:
        print(f"\n{table}:")
        for col in columns:
            print(f"  {col['name']} ({col['type']})")
        
        # Show sample data
        c.execute(f"SELECT * FROM [{table}] LIMIT 3")
        rows = c.fetchall()
        if rows:
            print(f"  Sample data:")
            for row in rows:
                row_dict = dict(row)
                # Truncate long values
                for k, v in row_dict.items():
                    if isinstance(v, str) and len(v) > 50:
                        row_dict[k] = v[:50] + "..."
                    elif isinstance(v, bytes) and len(v) > 20:
                        row_dict[k] = f"<{len(v)} bytes>"
                print(f"    {row_dict}")

# Check if there's anything that looks like photo metadata
print("\n" + "=" * 70)
print("SEARCHING FOR PHOTO/MEDIA REFERENCES")
print("=" * 70)

for table in tables:
    c.execute(f"PRAGMA table_info([{table}])")
    columns = c.fetchall()
    col_names = [col['name'].lower() for col in columns]
    
    if any(keyword in ' '.join(col_names) for keyword in ['photo', 'image', 'media', 'file', 'path', 'asset']):
        c.execute(f"SELECT COUNT(*) FROM [{table}]")
        count = c.fetchone()[0]
        if count > 0:
            print(f"\n{table} ({count} rows) - columns: {[col['name'] for col in columns]}")
            c.execute(f"SELECT * FROM [{table}] LIMIT 2")
            for row in c.fetchall():
                row_dict = dict(row)
                for k, v in row_dict.items():
                    if isinstance(v, str) and len(v) > 60:
                        row_dict[k] = v[:60] + "..."
                    elif isinstance(v, bytes):
                        row_dict[k] = f"<{len(v)} bytes>"
                print(f"  {row_dict}")

conn.close()
print("\n" + "=" * 70)
print("DONE")
print("=" * 70)

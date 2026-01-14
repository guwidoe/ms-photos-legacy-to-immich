"""Compare current MS Photos DB with old backup to find lost face data."""

import sqlite3
from pathlib import Path

# Update these paths to your MS Photos database locations
CURRENT_DB = Path(r"path/to/MediaDb.v1.sqlite")
OLD_DB = Path(r"path/to/MediaDb.v1_old.sqlite")

def nocase_unicode_collation(str1, str2):
    """Custom collation that mimics NoCaseUnicode."""
    if str1 is None and str2 is None:
        return 0
    if str1 is None:
        return -1
    if str2 is None:
        return 1
    s1 = str1.lower() if isinstance(str1, str) else str(str1).lower()
    s2 = str2.lower() if isinstance(str2, str) else str(str2).lower()
    if s1 < s2:
        return -1
    elif s1 > s2:
        return 1
    return 0

def get_connection(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.create_collation("NoCaseUnicode", nocase_unicode_collation)
    return conn

print("=" * 70)
print("COMPARING MS PHOTOS DATABASES")
print("=" * 70)

# Check if files exist
print(f"\nCurrent DB: {CURRENT_DB}")
print(f"  Exists: {CURRENT_DB.exists()}")
print(f"  Size: {CURRENT_DB.stat().st_size / 1024 / 1024:.1f} MB" if CURRENT_DB.exists() else "")

print(f"\nOld DB: {OLD_DB}")
print(f"  Exists: {OLD_DB.exists()}")
print(f"  Size: {OLD_DB.stat().st_size / 1024 / 1024:.1f} MB" if OLD_DB.exists() else "")

if not OLD_DB.exists():
    print("\nERROR: Old database not found!")
    exit(1)

# Connect to both databases
current_conn = get_connection(CURRENT_DB)
old_conn = get_connection(OLD_DB)

# Basic stats comparison
print("\n" + "=" * 70)
print("BASIC STATS COMPARISON")
print("=" * 70)

for name, conn in [("Current", current_conn), ("Old Backup", old_conn)]:
    c = conn.cursor()
    
    c.execute("SELECT COUNT(*) FROM Person")
    total_persons = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM Person WHERE Person_Name IS NOT NULL AND Person_Name != ''")
    named_persons = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM Face")
    total_faces = c.fetchone()[0]
    
    c.execute("SELECT COUNT(DISTINCT p.Person_Id) FROM Person p JOIN Face f ON f.Face_PersonId = p.Person_Id WHERE p.Person_Name IS NOT NULL AND p.Person_Name != ''")
    named_with_faces = c.fetchone()[0]
    
    print(f"\n{name} Database:")
    print(f"  Total Persons: {total_persons}")
    print(f"  Named Persons: {named_persons}")
    print(f"  Total Faces: {total_faces}")
    print(f"  Named persons with faces: {named_with_faces}")

# Find orphan people in current DB
print("\n" + "=" * 70)
print("CHECKING ORPHAN PEOPLE IN OLD DATABASE")
print("=" * 70)

current_c = current_conn.cursor()
old_c = old_conn.cursor()

# Get orphan people from current DB (named but no faces)
current_c.execute("""
    SELECT p.Person_Id, p.Person_Name, p.Person_ItemCount
    FROM Person p
    LEFT JOIN Face f ON f.Face_PersonId = p.Person_Id
    WHERE p.Person_Name IS NOT NULL 
      AND p.Person_Name != '' 
      AND TRIM(p.Person_Name) != ''
      AND f.Face_Id IS NULL
""")

orphans = current_c.fetchall()
print(f"\nFound {len(orphans)} orphan people in current DB (no face data)")

# Check how many of these have face data in the old DB
recovered = []
still_orphan = []

for orphan in orphans:
    person_id = orphan['Person_Id']
    person_name = orphan['Person_Name']
    
    # Try to find by Person_Id first
    old_c.execute("SELECT COUNT(*) FROM Face WHERE Face_PersonId = ?", (person_id,))
    face_count_by_id = old_c.fetchone()[0]
    
    # Also try to find by name (in case IDs differ)
    old_c.execute("""
        SELECT p.Person_Id, COUNT(f.Face_Id) as face_count
        FROM Person p
        LEFT JOIN Face f ON f.Face_PersonId = p.Person_Id
        WHERE p.Person_Name = ?
        GROUP BY p.Person_Id
    """, (person_name,))
    by_name = old_c.fetchone()
    face_count_by_name = by_name['face_count'] if by_name else 0
    
    face_count = max(face_count_by_id, face_count_by_name)
    
    if face_count > 0:
        recovered.append({
            'name': person_name,
            'current_id': person_id,
            'face_count': face_count,
        })
    else:
        still_orphan.append(person_name)

print(f"\n[RECOVERABLE] {len(recovered)} orphan people have face data in old DB!")
print(f"[STILL ORPHAN] {len(still_orphan)} people have no face data in either DB")

def safe_print(name):
    """Print name safely, replacing non-ASCII chars if needed."""
    try:
        return name.encode('cp1252').decode('cp1252')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name.encode('ascii', 'replace').decode('ascii')

if recovered:
    print(f"\nRecoverable people (sample):")
    total_faces_recoverable = 0
    for r in sorted(recovered, key=lambda x: x['face_count'], reverse=True)[:20]:
        print(f"  {safe_print(r['name'])}: {r['face_count']} faces")
        total_faces_recoverable += r['face_count']
    if len(recovered) > 20:
        for r in recovered[20:]:
            total_faces_recoverable += r['face_count']
        print(f"  ... and {len(recovered) - 20} more")
    print(f"\nTotal recoverable faces: {total_faces_recoverable}")

if still_orphan:
    print(f"\nStill orphan (no data in either DB):")
    for name in still_orphan[:10]:
        print(f"  {safe_print(name)}")
    if len(still_orphan) > 10:
        print(f"  ... and {len(still_orphan) - 10} more")

# Close connections
current_conn.close()
old_conn.close()

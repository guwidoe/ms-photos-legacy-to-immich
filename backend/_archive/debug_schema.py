"""Investigate MS Photos database schema and how people link to photos."""

from database import get_ms_photos_connection

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    
    # List all tables
    c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in c.fetchall()]
    print("=== TABLES ===")
    for t in tables:
        print(f"  {t}")
    
    print("\n=== PERSON TABLE SCHEMA ===")
    c.execute("PRAGMA table_info(Person)")
    for row in c.fetchall():
        print(f"  {row}")
    
    print("\n=== FACE TABLE SCHEMA ===")
    c.execute("PRAGMA table_info(Face)")
    for row in c.fetchall():
        print(f"  {row}")
    
    # Check for other tables that might link Person to photos
    print("\n=== LOOKING FOR PERSON REFERENCES ===")
    for table in tables:
        c.execute(f"PRAGMA table_info({table})")
        cols = [r[1] for r in c.fetchall()]
        person_cols = [col for col in cols if 'person' in col.lower()]
        if person_cols:
            print(f"  {table}: {person_cols}")
    
    # Sample an "empty" person - one without faces
    print("\n=== SAMPLE EMPTY PERSON (Ada Meran) ===")
    c.execute("SELECT * FROM Person WHERE Person_Name = 'Ada Meran'")
    person_row = c.fetchone()
    if person_row:
        c.execute("PRAGMA table_info(Person)")
        cols = [r[1] for r in c.fetchall()]
        for col, val in zip(cols, person_row):
            print(f"  {col}: {val}")
        
        person_id = person_row[0]  # Assuming first column is ID
        
        # Check Face table
        c.execute("SELECT COUNT(*) FROM Face WHERE Face_PersonId = ?", (person_id,))
        face_count = c.fetchone()[0]
        print(f"  Face records: {face_count}")
        
        # Check all tables for this person ID
        print(f"\n=== SEARCHING ALL TABLES FOR PERSON ID {person_id} ===")
        for table in tables:
            c.execute(f"PRAGMA table_info({table})")
            cols = [r[1] for r in c.fetchall()]
            for col in cols:
                if 'person' in col.lower() and 'id' in col.lower():
                    try:
                        c.execute(f"SELECT COUNT(*) FROM {table} WHERE {col} = ?", (person_id,))
                        cnt = c.fetchone()[0]
                        if cnt > 0:
                            print(f"  {table}.{col}: {cnt} records")
                    except:
                        pass

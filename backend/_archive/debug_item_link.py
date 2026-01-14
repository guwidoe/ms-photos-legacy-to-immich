"""Debug how Person_ItemCount relates to actual data."""

from database import get_ms_photos_connection

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    
    # Check all tables for item references
    print("=== LOOKING FOR ITEM REFERENCES ===")
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in c.fetchall()]
    
    for table in tables:
        c.execute(f"PRAGMA table_info({table})")
        cols = [r[1] for r in c.fetchall()]
        item_cols = [col for col in cols if 'item' in col.lower()]
        if item_cols and 'Item' not in table:  # Skip Item table itself
            print(f"  {table}: {item_cols}")
    
    # Get Ada Meran's person ID
    c.execute("SELECT Person_Id, Person_ItemCount FROM Person WHERE Person_Name = 'Ada Meran'")
    person_id, item_count = c.fetchone()
    print(f"\nAda Meran: Person_Id={person_id}, Person_ItemCount={item_count}")
    
    # Check ItemTags table
    print("\n=== ITEMTAGS TABLE ===")
    c.execute("PRAGMA table_info(ItemTags)")
    for row in c.fetchall():
        print(f"  {row[1]}")
    
    # Is there a tag for this person?
    print("\n=== TAG TABLE ===")
    c.execute("PRAGMA table_info(Tag)")
    for row in c.fetchall():
        print(f"  {row[1]}")
    
    # Check if Person_ItemCount is just stale data
    print("\n=== CHECKING PERSON_ITEMCOUNT VALUES ===")
    c.execute("""
        SELECT p.Person_Name, p.Person_ItemCount, 
               (SELECT COUNT(*) FROM Face f WHERE f.Face_PersonId = p.Person_Id) as actual_face_count
        FROM Person p
        WHERE p.Person_Name IS NOT NULL 
          AND p.Person_Name != '' 
          AND p.Person_ItemCount > 0
          AND p.Person_ItemCount != (SELECT COUNT(*) FROM Face f WHERE f.Face_PersonId = p.Person_Id)
        LIMIT 20
    """)
    
    mismatches = c.fetchall()
    print(f"People where Person_ItemCount != actual Face count:")
    for name, item_count, face_count in mismatches[:10]:
        print(f"  {name}: ItemCount={item_count}, FaceCount={face_count}")
    
    # Check if there's any ExcludedFace or ExcludedPerson relationship
    print("\n=== EXCLUDEDFACE TABLE ===")
    c.execute("PRAGMA table_info(ExcludedFace)")
    for row in c.fetchall():
        print(f"  {row[1]}")
    
    # Check excluded faces for our person
    c.execute("SELECT COUNT(*) FROM ExcludedFace")
    print(f"\nTotal ExcludedFace records: {c.fetchone()[0]}")
    
    # Check ExcludedPerson
    c.execute("SELECT COUNT(*) FROM ExcludedPerson WHERE ExcludedPerson_PersonId = ?", (person_id,))
    print(f"ExcludedPerson records for Ada Meran: {c.fetchone()[0]}")

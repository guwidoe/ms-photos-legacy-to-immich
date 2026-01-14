"""Check ExcludedFace table for deleted faces."""

from database import get_ms_photos_connection

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    
    print("=== EXCLUDEDFACE TABLE SCHEMA ===")
    c.execute("PRAGMA table_info(ExcludedFace)")
    for row in c.fetchall():
        print(f"  {row[1]}")
    
    print("\n=== EXCLUDEDFACE COUNTS ===")
    c.execute("SELECT COUNT(*) FROM ExcludedFace")
    print(f"Total ExcludedFace records: {c.fetchone()[0]}")
    
    # Sample some excluded faces
    print("\n=== SAMPLE EXCLUDEDFACE RECORDS ===")
    c.execute("SELECT * FROM ExcludedFace LIMIT 5")
    rows = c.fetchall()
    c.execute("PRAGMA table_info(ExcludedFace)")
    cols = [r[1] for r in c.fetchall()]
    for row in rows:
        print(f"  {dict(zip(cols, row))}")
    
    # Check if Xenia Trotzky has excluded faces
    c.execute("SELECT Person_Id FROM Person WHERE Person_Name LIKE '%Xenia%'")
    xenia = c.fetchone()
    if xenia:
        person_id = xenia[0]
        print(f"\nXenia Trotzky Person_Id: {person_id}")
        
        # Get her cluster
        c.execute("SELECT FaceCluster_Id FROM FaceCluster WHERE FaceCluster_PersonId = ?", (person_id,))
        cluster = c.fetchone()
        if cluster:
            print(f"FaceCluster_Id: {cluster[0]}")
    
    # Check ExcludedPerson for all "empty" people
    print("\n=== CHECKING IF 'EMPTY' PEOPLE ARE EXCLUDED ===")
    c.execute("""
        SELECT p.Person_Id, p.Person_Name, p.Person_ItemCount,
               (SELECT COUNT(*) FROM ExcludedPerson ep WHERE ep.ExcludedPerson_PersonId = p.Person_Id) as excluded
        FROM Person p
        LEFT JOIN Face f ON f.Face_PersonId = p.Person_Id
        WHERE p.Person_Name IS NOT NULL 
          AND p.Person_Name != '' 
          AND TRIM(p.Person_Name) != ''
          AND f.Face_Id IS NULL
          AND p.Person_ItemCount > 0
        LIMIT 20
    """)
    
    for row in c.fetchall():
        person_id, name, item_count, excluded = row
        # Safe print without special chars
        safe_name = name.encode('ascii', 'replace').decode()
        print(f"  {safe_name}: ItemCount={item_count}, ExcludedPerson={excluded}")

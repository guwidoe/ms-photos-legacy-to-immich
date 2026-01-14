"""Debug face counts."""

from database import get_ms_photos_connection

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    
    # All named people
    c.execute("SELECT COUNT(DISTINCT Person_Name) FROM Person WHERE Person_Name IS NOT NULL AND Person_Name != '' AND TRIM(Person_Name) != ''")
    all_named = c.fetchone()[0]
    
    # Named people WITH faces
    c.execute("SELECT COUNT(DISTINCT p.Person_Name) FROM Person p JOIN Face f ON f.Face_PersonId = p.Person_Id WHERE p.Person_Name IS NOT NULL AND p.Person_Name != '' AND TRIM(p.Person_Name) != ''")
    with_faces = c.fetchone()[0]
    
    print(f"All unique named people: {all_named}")
    print(f"Named people WITH faces: {with_faces}")
    print(f"Named people WITHOUT faces: {all_named - with_faces}")
    
    # Show some without faces
    c.execute("""
        SELECT DISTINCT p.Person_Name 
        FROM Person p 
        LEFT JOIN Face f ON f.Face_PersonId = p.Person_Id 
        WHERE p.Person_Name IS NOT NULL AND p.Person_Name != '' AND TRIM(p.Person_Name) != ''
          AND f.Face_Id IS NULL
        LIMIT 20
    """)
    without_faces = [r[0] for r in c.fetchall()]
    if without_faces:
        print(f"Sample people without faces: {without_faces[:10]}")

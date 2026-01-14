"""Investigate FaceCluster table and how it links to photos."""

from database import get_ms_photos_connection

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    
    print("=== FACECLUSTER TABLE SCHEMA ===")
    c.execute("PRAGMA table_info(FaceCluster)")
    cols = []
    for row in c.fetchall():
        cols.append(row[1])
        print(f"  {row[1]} ({row[2]})")
    
    # Get Ada Meran's person ID
    c.execute("SELECT Person_Id FROM Person WHERE Person_Name = 'Ada Meran'")
    person_id = c.fetchone()[0]
    print(f"\nAda Meran Person_Id: {person_id}")
    
    # Get her FaceCluster record
    print(f"\n=== FACECLUSTER FOR PERSON {person_id} ===")
    c.execute("SELECT * FROM FaceCluster WHERE FaceCluster_PersonId = ?", (person_id,))
    cluster_row = c.fetchone()
    if cluster_row:
        c.execute("PRAGMA table_info(FaceCluster)")
        cols = [r[1] for r in c.fetchall()]
        for col, val in zip(cols, cluster_row):
            print(f"  {col}: {val}")
        
        cluster_id = cluster_row[0]
        
        # Check if Face has a FaceCluster reference
        print(f"\n=== FACE TABLE COLUMNS ===")
        c.execute("PRAGMA table_info(Face)")
        for row in c.fetchall():
            print(f"  {row[1]}")
        
        # Check if there are faces linked to this cluster
        c.execute("SELECT COUNT(*) FROM Face WHERE Face_PersonId = ?", (person_id,))
        print(f"\nFaces with Face_PersonId = {person_id}: {c.fetchone()[0]}")
        
        # Look for cluster reference in Face
        c.execute("PRAGMA table_info(Face)")
        face_cols = [r[1] for r in c.fetchall()]
        cluster_cols = [col for col in face_cols if 'cluster' in col.lower()]
        print(f"Cluster-related columns in Face: {cluster_cols}")
        
        # Check FaceFeature table
        print(f"\n=== FACEFEATURE TABLE SCHEMA ===")
        c.execute("PRAGMA table_info(FaceFeature)")
        for row in c.fetchall():
            print(f"  {row[1]} ({row[2]})")
        
        # Check VideoFaceOccurrence - maybe faces from videos?
        print(f"\n=== VIDEOFACEOCCURRENCE TABLE SCHEMA ===")
        c.execute("PRAGMA table_info(VideoFaceOccurrence)")
        for row in c.fetchall():
            print(f"  {row[1]} ({row[2]})")
        
        # Sample some VideoFaceOccurrence for this person
        c.execute("""
            SELECT * FROM VideoFaceOccurrence 
            WHERE VideoFaceOccurrence_PersonId = ? 
            LIMIT 5
        """, (person_id,))
        rows = c.fetchall()
        if rows:
            print(f"\nVideoFaceOccurrence records for person {person_id}: {len(rows)}")
            c.execute("PRAGMA table_info(VideoFaceOccurrence)")
            cols = [r[1] for r in c.fetchall()]
            for row in rows[:2]:
                print("  Record:")
                for col, val in zip(cols, row):
                    print(f"    {col}: {val}")
        else:
            print(f"\nNo VideoFaceOccurrence records for person {person_id}")

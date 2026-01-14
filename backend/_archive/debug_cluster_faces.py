"""Check if faces are linked through FaceCluster."""

from database import get_ms_photos_connection

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    
    # Get Ada Meran's cluster ID
    c.execute("SELECT Person_Id FROM Person WHERE Person_Name = 'Ada Meran'")
    person_id = c.fetchone()[0]
    
    c.execute("SELECT FaceCluster_Id FROM FaceCluster WHERE FaceCluster_PersonId = ?", (person_id,))
    cluster_id = c.fetchone()[0]
    
    print(f"Ada Meran Person_Id: {person_id}")
    print(f"Ada Meran FaceCluster_Id: {cluster_id}")
    
    # Check faces by Face_PersonId
    c.execute("SELECT COUNT(*) FROM Face WHERE Face_PersonId = ?", (person_id,))
    print(f"Faces with Face_PersonId = {person_id}: {c.fetchone()[0]}")
    
    # Check faces by Face_FaceClusterId
    c.execute("SELECT COUNT(*) FROM Face WHERE Face_FaceClusterId = ?", (cluster_id,))
    print(f"Faces with Face_FaceClusterId = {cluster_id}: {c.fetchone()[0]}")
    
    # Get the actual faces linked to this cluster
    c.execute("""
        SELECT f.Face_Id, f.Face_ItemId, f.Face_PersonId, f.Face_FaceClusterId,
               i.Item_FileName, 
               f.Face_Rect_Top, f.Face_Rect_Left, f.Face_Rect_Width, f.Face_Rect_Height
        FROM Face f
        JOIN Item i ON f.Face_ItemId = i.Item_Id
        WHERE f.Face_FaceClusterId = ?
        LIMIT 10
    """, (cluster_id,))
    
    rows = c.fetchall()
    print(f"\n=== FACES LINKED TO CLUSTER {cluster_id} ===")
    for row in rows:
        face_id, item_id, face_person_id, face_cluster_id, filename, top, left, width, height = row
        print(f"  Face {face_id}: PersonId={face_person_id}, ClusterId={face_cluster_id}")
        print(f"    File: {filename}")
        print(f"    Rect: top={top}, left={left}, w={width}, h={height}")
    
    # Check for all "empty" people - do they have cluster-linked faces?
    print(f"\n=== CHECKING ALL 'EMPTY' PEOPLE ===")
    c.execute("""
        SELECT p.Person_Id, p.Person_Name, p.Person_ItemCount
        FROM Person p
        LEFT JOIN Face f ON f.Face_PersonId = p.Person_Id
        WHERE p.Person_Name IS NOT NULL 
          AND p.Person_Name != '' 
          AND TRIM(p.Person_Name) != ''
          AND f.Face_Id IS NULL
        LIMIT 20
    """)
    
    empty_people = c.fetchall()
    print(f"Found {len(empty_people)} 'empty' people (no Face_PersonId match)")
    
    with_cluster_faces = 0
    for person_id, name, item_count in empty_people[:10]:
        # Get cluster ID
        c.execute("SELECT FaceCluster_Id FROM FaceCluster WHERE FaceCluster_PersonId = ?", (person_id,))
        row = c.fetchone()
        if row:
            cluster_id = row[0]
            # Check for cluster-linked faces
            c.execute("SELECT COUNT(*) FROM Face WHERE Face_FaceClusterId = ?", (cluster_id,))
            cluster_face_count = c.fetchone()[0]
            if cluster_face_count > 0:
                with_cluster_faces += 1
                print(f"  {name}: ItemCount={item_count}, PersonId={person_id}, ClusterId={cluster_id}, ClusterFaces={cluster_face_count}")
        else:
            print(f"  {name}: ItemCount={item_count}, NO CLUSTER!")
    
    print(f"\nOf the first 10 'empty' people, {with_cluster_faces} have cluster-linked faces")

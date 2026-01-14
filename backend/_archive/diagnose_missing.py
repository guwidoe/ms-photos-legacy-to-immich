"""Quick diagnostic script to find missing people."""

from database import get_ms_photos_connection, get_immich_connection

def main():
    # Get Immich unique names (case-insensitive)
    with get_immich_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT LOWER(name) FROM person WHERE name IS NOT NULL AND name != ''")
        immich_names_lower = set(row[0] for row in cursor.fetchall())
        print(f"DEBUG: Immich has {len(immich_names_lower)} unique lowercase names")
        
        # Get all photos in Immich  
        cursor.execute('''
            SELECT a."originalFileName", e."fileSizeInByte", a.id 
            FROM asset a 
            LEFT JOIN asset_exif e ON a.id = e."assetId" 
            WHERE a."deletedAt" IS NULL
        ''')
        immich_photos = {}
        for row in cursor.fetchall():
            if row[0] and row[1]:
                immich_photos[(row[0].lower(), row[1])] = row[2]
        
        # Get face counts per asset
        cursor.execute('SELECT "assetId", COUNT(*) FROM asset_face WHERE "deletedAt" IS NULL GROUP BY "assetId"')
        face_counts = dict(cursor.fetchall())

    # Find MS Photos people NOT in Immich
    with get_ms_photos_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT p.Person_Id, p.Person_Name, COUNT(f.Face_Id) as face_count
            FROM Person p 
            JOIN Face f ON f.Face_PersonId = p.Person_Id 
            WHERE p.Person_Name IS NOT NULL 
              AND p.Person_Name != '' 
              AND TRIM(p.Person_Name) != '' 
            GROUP BY p.Person_Id, p.Person_Name 
            ORDER BY face_count DESC
        """)
        
        missing = []
        all_ms_names_lower = set()
        for person_id, name, face_count in cursor.fetchall():
            name_lower = name.lower()
            all_ms_names_lower.add(name_lower)
            if name_lower not in immich_names_lower:
                missing.append((person_id, name, face_count))
        
        print(f"DEBUG: MS Photos has {len(all_ms_names_lower)} unique lowercase names")
        print(f"Total missing people: {len(missing)}")
        print()
        
        # Categorize
        not_in_immich = []
        no_faces = []
        iou_issue = []
        
        for pid, name, fc in missing:
            cursor.execute("""
                SELECT i.Item_FileName, i.Item_FileSize 
                FROM Face f 
                JOIN Item i ON f.Face_ItemId = i.Item_Id 
                WHERE f.Face_PersonId = ?
            """, (pid,))
            
            in_imm = 0
            total = 0
            with_f = 0
            for fn, fs in cursor.fetchall():
                if fn and fs:
                    total += 1
                    key = (fn.lower(), fs)
                    if key in immich_photos:
                        in_imm += 1
                        aid = immich_photos[key]
                        if face_counts.get(aid, 0) > 0:
                            with_f += 1
            
            if in_imm == 0:
                not_in_immich.append((name, fc, total))
            elif with_f == 0:
                no_faces.append((name, fc, in_imm))
            else:
                iou_issue.append((name, fc, in_imm, with_f))
        
        print(f"=== CATEGORY 1: Photos NOT in Immich ({len(not_in_immich)} people) ===")
        print("These people only appear in photos that haven't been imported to Immich.")
        for name, faces, photos in not_in_immich:
            print(f"  - {name}: {faces} faces in {photos} photos")
        
        print()
        print(f"=== CATEGORY 2: No faces detected by Immich ({len(no_faces)} people) ===")
        print("Photos exist in Immich but Immich didn't detect ANY faces on them.")
        for name, faces, photos in no_faces:
            print(f"  - {name}: {faces} MS faces, {photos} photos in Immich (0 faces detected)")
        
        print()
        print(f"=== CATEGORY 3: IoU mismatch ({len(iou_issue)} people) ===")
        print("Photos exist, Immich detected faces, but rectangles don't overlap enough.")
        print("This could be: different face detected, or face rect position differs.")
        for name, faces, photos, with_faces in iou_issue:
            print(f"  - {name}: {faces} MS faces, {with_faces}/{photos} photos have Immich faces")


if __name__ == "__main__":
    main()

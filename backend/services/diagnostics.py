"""
Diagnostics service - find MS Photos people not transferred to Immich.

This helps investigate gaps in the migration process.
"""

from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import Optional, List
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_ms_photos_connection, get_immich_connection


@dataclass
class PhotoDiagnostic:
    """Diagnostic info for a single photo."""
    filename: str
    filesize: int
    ms_folder_path: Optional[str]
    exists_in_immich: bool
    immich_asset_id: Optional[str]
    immich_faces_detected: int  # How many faces Immich detected on this photo
    ms_face_rect: Optional[dict]  # The MS Photos face rect for this person


@dataclass 
class MissingPersonDiagnostic:
    """Diagnostic info for an MS Photos person not in Immich."""
    ms_person_id: int
    ms_person_name: str
    total_faces_in_ms: int
    photos_checked: int
    photos_in_immich: int
    photos_not_in_immich: int
    photos_with_immich_faces: int  # Photos where Immich detected ANY face
    sample_photos: List[PhotoDiagnostic]
    diagnosis: str  # Summary of why transfer didn't happen


def find_missing_people() -> dict:
    """
    Find MS Photos people whose names don't exist in Immich.
    
    Returns diagnostic information to understand why they weren't transferred.
    """
    # ==========================================================================
    # Step 1: Get all unique names in Immich
    # ==========================================================================
    with get_immich_connection() as immich_conn:
        cursor = immich_conn.cursor()
        
        cursor.execute("""
            SELECT DISTINCT LOWER(name) 
            FROM person 
            WHERE name IS NOT NULL AND name != ''
        """)
        immich_names = set(row[0] for row in cursor.fetchall())
        
        # Also get all Immich photos indexed by (filename, filesize)
        cursor.execute("""
            SELECT 
                a."originalFileName",
                e."fileSizeInByte",
                a.id as asset_id
            FROM asset a
            LEFT JOIN asset_exif e ON a.id = e."assetId"
            WHERE a."deletedAt" IS NULL
        """)
        immich_photos = {}
        for row in cursor.fetchall():
            filename, filesize, asset_id = row
            if filename and filesize:
                key = (filename.lower(), filesize)
                immich_photos[key] = asset_id
        
        # Get face counts per asset
        cursor.execute("""
            SELECT 
                af."assetId",
                COUNT(*) as face_count
            FROM asset_face af
            WHERE af."deletedAt" IS NULL
            GROUP BY af."assetId"
        """)
        immich_face_counts = {row[0]: row[1] for row in cursor.fetchall()}
    
    # ==========================================================================
    # Step 2: Find MS Photos people not in Immich
    # ==========================================================================
    with get_ms_photos_connection() as ms_conn:
        cursor = ms_conn.cursor()
        
        # Get all named people with their face counts
        cursor.execute("""
            SELECT 
                p.Person_Id,
                p.Person_Name,
                COUNT(f.Face_Id) as face_count
            FROM Person p
            JOIN Face f ON f.Face_PersonId = p.Person_Id
            WHERE p.Person_Name IS NOT NULL 
              AND p.Person_Name != ''
              AND TRIM(p.Person_Name) != ''
            GROUP BY p.Person_Id, p.Person_Name
            ORDER BY face_count DESC
        """)
        
        missing_people = []
        for row in cursor.fetchall():
            person_id, person_name, face_count = row
            
            # Check if this name exists in Immich (case-insensitive)
            if person_name.lower() in immich_names:
                continue  # Already transferred
            
            missing_people.append({
                "person_id": person_id,
                "person_name": person_name,
                "face_count": face_count,
            })
        
        # ==========================================================================
        # Step 3: For each missing person, get sample photos and diagnose
        # ==========================================================================
        results = []
        
        for person_info in missing_people[:50]:  # Limit to first 50 for performance
            person_id = person_info["person_id"]
            person_name = person_info["person_name"]
            
            # Get all photos for this person
            cursor.execute("""
                SELECT 
                    i.Item_FileName,
                    i.Item_FileSize,
                    fld.Folder_Path,
                    f.Face_Rect_Top,
                    f.Face_Rect_Left,
                    f.Face_Rect_Width,
                    f.Face_Rect_Height
                FROM Face f
                JOIN Item i ON f.Face_ItemId = i.Item_Id
                LEFT JOIN Folder fld ON i.Item_ParentFolderId = fld.Folder_Id
                WHERE f.Face_PersonId = ?
                LIMIT 20
            """, (person_id,))
            
            photos_checked = 0
            photos_in_immich = 0
            photos_not_in_immich = 0
            photos_with_immich_faces = 0
            sample_photos = []
            
            for photo_row in cursor.fetchall():
                filename, filesize, folder_path, top, left, width, height = photo_row
                if not filename or not filesize:
                    continue
                
                photos_checked += 1
                key = (filename.lower(), filesize)
                
                exists_in_immich = key in immich_photos
                asset_id = immich_photos.get(key)
                face_count_in_immich = immich_face_counts.get(asset_id, 0) if asset_id else 0
                
                if exists_in_immich:
                    photos_in_immich += 1
                    if face_count_in_immich > 0:
                        photos_with_immich_faces += 1
                else:
                    photos_not_in_immich += 1
                
                # Store sample (up to 5)
                if len(sample_photos) < 5:
                    sample_photos.append(PhotoDiagnostic(
                        filename=filename,
                        filesize=filesize,
                        ms_folder_path=folder_path,
                        exists_in_immich=exists_in_immich,
                        immich_asset_id=asset_id,
                        immich_faces_detected=face_count_in_immich,
                        ms_face_rect={
                            "top": top,
                            "left": left,
                            "width": width,
                            "height": height,
                        } if top is not None else None,
                    ))
            
            # Diagnose the issue
            if photos_checked == 0:
                diagnosis = "No photos found for this person in MS Photos"
            elif photos_in_immich == 0:
                diagnosis = "None of the photos exist in Immich - photos not imported"
            elif photos_with_immich_faces == 0:
                diagnosis = "Photos exist in Immich but NO faces were detected by Immich"
            elif photos_with_immich_faces < photos_in_immich:
                diagnosis = f"Immich only detected faces in {photos_with_immich_faces}/{photos_in_immich} photos - partial face detection"
            else:
                diagnosis = "Photos exist and have Immich faces - likely IoU mismatch or threshold issue"
            
            results.append(MissingPersonDiagnostic(
                ms_person_id=person_id,
                ms_person_name=person_name,
                total_faces_in_ms=person_info["face_count"],
                photos_checked=photos_checked,
                photos_in_immich=photos_in_immich,
                photos_not_in_immich=photos_not_in_immich,
                photos_with_immich_faces=photos_with_immich_faces,
                sample_photos=sample_photos,
                diagnosis=diagnosis,
            ))
    
    # Categorize results
    not_in_immich = [r for r in results if r.photos_in_immich == 0]
    no_face_detection = [r for r in results if r.photos_in_immich > 0 and r.photos_with_immich_faces == 0]
    partial_detection = [r for r in results if r.photos_with_immich_faces > 0 and r.photos_with_immich_faces < r.photos_in_immich]
    iou_mismatch = [r for r in results if r.photos_with_immich_faces > 0 and r.photos_with_immich_faces >= r.photos_in_immich]
    
    return {
        "total_missing": len(missing_people),
        "analyzed": len(results),
        "summary": {
            "photos_not_in_immich": len(not_in_immich),
            "no_face_detection": len(no_face_detection),
            "partial_detection": len(partial_detection),
            "iou_mismatch": len(iou_mismatch),
        },
        "people": [asdict(r) for r in results],
    }


def get_detailed_face_comparison(ms_person_id: int, immich_asset_id: str) -> dict:
    """
    Get detailed face rectangle comparison between MS Photos and Immich for a specific photo.
    
    This helps diagnose why faces didn't match (IoU too low, etc.)
    """
    from services.matching import ms_rect_to_normalized, immich_rect_to_normalized, calculate_iou, calculate_center_distance
    
    # Get MS Photos face rect
    with get_ms_photos_connection() as ms_conn:
        cursor = ms_conn.cursor()
        cursor.execute("""
            SELECT 
                i.Item_FileName,
                f.Face_Rect_Top,
                f.Face_Rect_Left,
                f.Face_Rect_Width,
                f.Face_Rect_Height,
                p.Person_Name
            FROM Face f
            JOIN Item i ON f.Face_ItemId = i.Item_Id
            JOIN Person p ON f.Face_PersonId = p.Person_Id
            JOIN asset_exif e ON i.Item_FileName = (
                SELECT a."originalFileName" FROM asset a WHERE a.id = ?
            )
            WHERE f.Face_PersonId = ?
            LIMIT 1
        """, (immich_asset_id, ms_person_id))
        
        # This query won't work as-is (cross-database), let's do it differently
        cursor.execute("""
            SELECT 
                p.Person_Name,
                f.Face_Rect_Top,
                f.Face_Rect_Left,
                f.Face_Rect_Width,
                f.Face_Rect_Height
            FROM Face f
            JOIN Person p ON f.Face_PersonId = p.Person_Id
            WHERE f.Face_PersonId = ?
        """, (ms_person_id,))
        
        ms_faces = []
        for row in cursor.fetchall():
            name, top, left, width, height = row
            if top is not None:
                ms_faces.append({
                    "name": name,
                    "rect_normalized": ms_rect_to_normalized(top, left, width, height),
                })
    
    # Get Immich faces for this asset
    with get_immich_connection() as immich_conn:
        cursor = immich_conn.cursor()
        cursor.execute("""
            SELECT 
                af.id as face_id,
                p.id as person_id,
                p.name as person_name,
                af."boundingBoxX1",
                af."boundingBoxY1",
                af."boundingBoxX2",
                af."boundingBoxY2",
                af."imageWidth",
                af."imageHeight"
            FROM asset_face af
            LEFT JOIN person p ON af."personId" = p.id
            WHERE af."assetId" = ?
              AND af."deletedAt" IS NULL
        """, (immich_asset_id,))
        
        immich_faces = []
        for row in cursor.fetchall():
            face_id, person_id, person_name, x1, y1, x2, y2, img_w, img_h = row
            rect = immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h)
            if rect:
                immich_faces.append({
                    "face_id": str(face_id),
                    "person_id": str(person_id) if person_id else None,
                    "person_name": person_name,
                    "rect_normalized": rect,
                })
    
    # Calculate IoU between all pairs
    comparisons = []
    for ms_face in ms_faces:
        for imm_face in immich_faces:
            iou = calculate_iou(ms_face["rect_normalized"], imm_face["rect_normalized"])
            center_dist = calculate_center_distance(ms_face["rect_normalized"], imm_face["rect_normalized"])
            comparisons.append({
                "ms_name": ms_face["name"],
                "ms_rect": ms_face["rect_normalized"],
                "immich_name": imm_face["person_name"],
                "immich_rect": imm_face["rect_normalized"],
                "iou": iou,
                "center_dist": center_dist,
            })
    
    return {
        "ms_faces_count": len(ms_faces),
        "immich_faces_count": len(immich_faces),
        "comparisons": comparisons,
    }

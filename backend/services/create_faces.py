"""
Create Faces service.

Finds MS Photos faces that Immich has not detected at all and provides
functionality to create them via the Immich API.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_ms_photos_connection, get_immich_connection
from services.matching import (
    calculate_iou, 
    calculate_center_distance, 
    ms_rect_to_normalized,
    immich_rect_to_normalized
)


@dataclass
class UnrecognizedFace:
    """An MS Photos face that has no matching Immich face detection."""
    # MS Photos data
    ms_person_id: int
    ms_person_name: str
    ms_rect: tuple  # Normalized (x1, y1, x2, y2)
    
    # Immich asset info
    immich_asset_id: str
    
    # Photo info
    filename: str
    file_size: int
    
    # Image dimensions (needed to convert back to pixels for API)
    image_width: int
    image_height: int


@dataclass
class UnrecognizedPersonPreview:
    """Preview of unrecognized faces for one MS Photos person."""
    ms_person_id: int
    ms_person_name: str
    
    # Existing Immich person (if any)
    existing_immich_person_id: Optional[str] = None
    existing_immich_person_name: Optional[str] = None
    
    # Faces to create
    faces_to_create: list[UnrecognizedFace] = field(default_factory=list)
    
    # Stats
    total_faces_in_ms_photos: int = 0
    
    @property
    def face_count(self) -> int:
        return len(self.faces_to_create)
    
    @property
    def needs_person_creation(self) -> bool:
        return self.existing_immich_person_id is None


def find_unrecognized_faces(min_iou: float = 0.3) -> dict:
    """
    Find MS Photos faces that Immich has not detected at all.
    
    This finds faces where:
    - MS Photos has a labeled face on a photo
    - The photo exists in Immich
    - But Immich has NO face detected at that position (not even unclustered)
    
    We use a lenient IoU threshold to determine if there's any overlapping face.
    
    Returns:
        Dictionary with preview data for creating faces
    """
    # ==========================================================================
    # Step 1: Load MS Photos faces with positions
    # ==========================================================================
    with get_ms_photos_connection() as ms_conn:
        ms_cursor = ms_conn.cursor()
        
        ms_cursor.execute("""
            SELECT 
                i.Item_FileName,
                i.Item_FileSize,
                p.Person_Id,
                p.Person_Name,
                f.Face_Rect_Top,
                f.Face_Rect_Left,
                f.Face_Rect_Width,
                f.Face_Rect_Height
            FROM Face f
            JOIN Item i ON f.Face_ItemId = i.Item_Id
            JOIN Person p ON f.Face_PersonId = p.Person_Id
            WHERE p.Person_Name IS NOT NULL 
              AND p.Person_Name != ''
              AND TRIM(p.Person_Name) != ''
              AND f.Face_Rect_Top IS NOT NULL
        """)
        
        # Index by (filename, filesize) for photo matching
        ms_faces_by_photo = defaultdict(list)
        ms_people = {}
        ms_face_counts = defaultdict(int)
        
        for row in ms_cursor.fetchall():
            filename, filesize, person_id, person_name, top, left, width, height = row
            if not filename or not filesize:
                continue
            
            key = (filename.lower(), filesize)
            rect = ms_rect_to_normalized(top, left, width, height)
            ms_faces_by_photo[key].append({
                "person_id": person_id,
                "person_name": person_name,
                "rect": rect,
            })
            ms_people[person_id] = person_name
            ms_face_counts[person_id] += 1
    
    # ==========================================================================
    # Step 2: Load ALL Immich faces (both clustered and unclustered)
    # ==========================================================================
    with get_immich_connection() as immich_conn:
        immich_cursor = immich_conn.cursor()
        
        immich_cursor.execute("""
            SELECT 
                a."originalFileName",
                e."fileSizeInByte",
                a.id as asset_id,
                af."boundingBoxX1",
                af."boundingBoxY1",
                af."boundingBoxX2",
                af."boundingBoxY2",
                af."imageWidth",
                af."imageHeight"
            FROM asset_face af
            JOIN asset a ON af."assetId" = a.id
            LEFT JOIN asset_exif e ON a.id = e."assetId"
            WHERE af."deletedAt" IS NULL
              AND a."deletedAt" IS NULL
              AND af."boundingBoxX1" IS NOT NULL
        """)
        
        # Index by (filename, filesize)
        all_immich_faces_by_photo = defaultdict(list)
        asset_dimensions = {}  # asset_id -> (width, height)
        
        for row in immich_cursor.fetchall():
            filename, filesize, asset_id, x1, y1, x2, y2, img_w, img_h = row
            if not filename or not filesize or not img_w or not img_h:
                continue
            
            key = (filename.lower(), filesize)
            rect = immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h)
            if not rect:
                continue
            
            all_immich_faces_by_photo[key].append({
                "asset_id": str(asset_id),
                "rect": rect,
            })
            asset_dimensions[str(asset_id)] = (img_w, img_h)
        
        # Also get asset info for photos that have NO faces at all
        immich_cursor.execute("""
            SELECT 
                a."originalFileName",
                e."fileSizeInByte",
                a.id as asset_id,
                COALESCE(e."exifImageWidth", 1920) as img_w,
                COALESCE(e."exifImageHeight", 1080) as img_h
            FROM asset a
            LEFT JOIN asset_exif e ON a.id = e."assetId"
            WHERE a."deletedAt" IS NULL
              AND a.type = 'IMAGE'
        """)
        
        assets_by_photo = {}
        
        for row in immich_cursor.fetchall():
            filename, filesize, asset_id, img_w, img_h = row
            if not filename or not filesize:
                continue
            
            key = (filename.lower(), filesize)
            asset_id_str = str(asset_id)
            assets_by_photo[key] = asset_id_str
            if asset_id_str not in asset_dimensions:
                asset_dimensions[asset_id_str] = (img_w or 1920, img_h or 1080)
        
        # Get existing Immich people to check for name matches
        immich_cursor.execute("""
            SELECT id, name FROM person WHERE name IS NOT NULL AND name != ''
        """)
        existing_immich_people = {row[1]: str(row[0]) for row in immich_cursor.fetchall()}
    
    # ==========================================================================
    # Step 3: Find MS Photos faces with no matching Immich face
    # ==========================================================================
    # We check photos that are in both systems
    common_photos = set(ms_faces_by_photo.keys()) & set(assets_by_photo.keys())
    
    # Group unrecognized faces by MS Photos person
    unrecognized_by_person: dict[int, list[UnrecognizedFace]] = defaultdict(list)
    
    for photo_key in common_photos:
        filename, file_size = photo_key
        ms_faces = ms_faces_by_photo[photo_key]
        immich_faces = all_immich_faces_by_photo.get(photo_key, [])
        asset_id = assets_by_photo[photo_key]
        
        # For each MS Photos face, check if there's any overlapping Immich face
        for ms_face in ms_faces:
            has_matching_immich_face = False
            
            for imm_face in immich_faces:
                iou = calculate_iou(ms_face["rect"], imm_face["rect"])
                
                # Use the threshold to determine if this is "the same face"
                if iou >= min_iou:
                    has_matching_immich_face = True
                    break
            
            if not has_matching_immich_face:
                # This MS Photos face has no corresponding Immich face
                dims = asset_dimensions.get(asset_id, (1920, 1080))
                
                unrecognized = UnrecognizedFace(
                    ms_person_id=ms_face["person_id"],
                    ms_person_name=ms_face["person_name"],
                    ms_rect=ms_face["rect"],
                    immich_asset_id=asset_id,
                    filename=filename,
                    file_size=file_size,
                    image_width=dims[0],
                    image_height=dims[1],
                )
                unrecognized_by_person[ms_face["person_id"]].append(unrecognized)
    
    # ==========================================================================
    # Step 4: Build preview for each person
    # ==========================================================================
    previews: list[UnrecognizedPersonPreview] = []
    
    for person_id, faces in unrecognized_by_person.items():
        person_name = ms_people[person_id]
        
        # Check if person already exists in Immich
        existing_person_id = existing_immich_people.get(person_name)
        
        preview = UnrecognizedPersonPreview(
            ms_person_id=person_id,
            ms_person_name=person_name,
            existing_immich_person_id=existing_person_id,
            existing_immich_person_name=person_name if existing_person_id else None,
            faces_to_create=faces,
            total_faces_in_ms_photos=ms_face_counts[person_id],
        )
        previews.append(preview)
    
    # Sort by number of faces (descending)
    previews.sort(key=lambda p: p.face_count, reverse=True)
    
    # Compute stats
    total_unrecognized_faces = sum(p.face_count for p in previews)
    total_photos_with_unrecognized = len(set(
        (f.filename, f.file_size) 
        for p in previews 
        for f in p.faces_to_create
    ))
    people_needing_creation = sum(1 for p in previews if p.needs_person_creation)
    people_existing = sum(1 for p in previews if not p.needs_person_creation)
    
    return {
        "previews": previews,
        "stats": {
            "total_people_with_unrecognized": len(previews),
            "total_faces_to_create": total_unrecognized_faces,
            "total_photos_with_unrecognized": total_photos_with_unrecognized,
            "common_photos_checked": len(common_photos),
            "people_needing_creation": people_needing_creation,
            "people_already_exist": people_existing,
        }
    }


def preview_to_dict(preview: UnrecognizedPersonPreview) -> dict:
    """Convert a preview to a JSON-serializable dict."""
    return {
        "ms_person_id": preview.ms_person_id,
        "ms_person_name": preview.ms_person_name,
        "existing_immich_person_id": preview.existing_immich_person_id,
        "existing_immich_person_name": preview.existing_immich_person_name,
        "needs_person_creation": preview.needs_person_creation,
        "face_count": preview.face_count,
        "total_faces_in_ms_photos": preview.total_faces_in_ms_photos,
        "faces": [
            {
                "immich_asset_id": f.immich_asset_id,
                "filename": f.filename,
                "ms_rect_x1": f.ms_rect[0],
                "ms_rect_y1": f.ms_rect[1],
                "ms_rect_x2": f.ms_rect[2],
                "ms_rect_y2": f.ms_rect[3],
                "image_width": f.image_width,
                "image_height": f.image_height,
            }
            for f in preview.faces_to_create
        ],
        "sample_filenames": list(set(f.filename for f in preview.faces_to_create))[:5],
    }


@dataclass
class UnrecognizedFaceDetail:
    """Detailed info for one unrecognized face, for the photo viewer."""
    filename: str
    immich_asset_id: str
    file_size: int
    
    # MS Photos face rectangle (normalized 0-1)
    ms_person_id: int
    ms_person_name: str
    ms_rect_x1: float
    ms_rect_y1: float
    ms_rect_x2: float
    ms_rect_y2: float
    
    # Image dimensions
    image_width: int
    image_height: int


def get_unrecognized_face_details(ms_person_id: int, min_iou: float = 0.3) -> dict:
    """
    Get detailed face data for an MS Photos person's unrecognized faces.
    
    Returns detailed rectangle info for displaying in a photo viewer.
    """
    # Run the full unrecognized matching
    result = find_unrecognized_faces(min_iou)
    
    # Find the specific person
    person_preview = None
    for preview in result["previews"]:
        if preview.ms_person_id == ms_person_id:
            person_preview = preview
            break
    
    if person_preview is None:
        return {
            "ms_person_id": ms_person_id,
            "ms_person_name": None,
            "total_faces": 0,
            "faces": [],
        }
    
    # Convert to detailed format
    details = []
    for face in person_preview.faces_to_create:
        detail = UnrecognizedFaceDetail(
            filename=face.filename,
            immich_asset_id=face.immich_asset_id,
            file_size=face.file_size,
            ms_person_id=face.ms_person_id,
            ms_person_name=face.ms_person_name,
            ms_rect_x1=face.ms_rect[0],
            ms_rect_y1=face.ms_rect[1],
            ms_rect_x2=face.ms_rect[2],
            ms_rect_y2=face.ms_rect[3],
            image_width=face.image_width,
            image_height=face.image_height,
        )
        details.append(detail)
    
    return {
        "ms_person_id": ms_person_id,
        "ms_person_name": person_preview.ms_person_name,
        "total_faces": len(details),
        "faces": details,
    }

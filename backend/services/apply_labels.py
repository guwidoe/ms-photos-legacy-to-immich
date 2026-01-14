"""
Apply Labels service.

Finds unclustered Immich faces that match MS Photos faces and provides
functionality to assign them to people via the Immich API.
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
class UnclusteredFaceMatch:
    """A match between an MS Photos face and an unclustered Immich face."""
    # MS Photos data
    ms_person_id: int
    ms_person_name: str
    ms_rect: tuple  # Normalized (x1, y1, x2, y2)
    
    # Immich data
    immich_face_id: str
    immich_asset_id: str
    immich_rect: tuple  # Normalized (x1, y1, x2, y2)
    
    # Photo info
    filename: str
    file_size: int
    
    # Match quality
    iou: float
    center_dist: float


@dataclass
class PersonApplyPreview:
    """Preview of what would be applied for one MS Photos person."""
    ms_person_id: int
    ms_person_name: str
    
    # Existing Immich person (if any)
    existing_immich_person_id: Optional[str] = None
    existing_immich_person_name: Optional[str] = None
    
    # Faces to assign
    faces_to_assign: list[UnclusteredFaceMatch] = field(default_factory=list)
    
    # Stats
    total_faces_in_ms_photos: int = 0
    
    @property
    def face_count(self) -> int:
        return len(self.faces_to_assign)
    
    @property
    def needs_person_creation(self) -> bool:
        return self.existing_immich_person_id is None
    
    @property
    def avg_iou(self) -> float:
        if not self.faces_to_assign:
            return 0.0
        return sum(f.iou for f in self.faces_to_assign) / len(self.faces_to_assign)


def find_unclustered_matches(min_iou: float = 0.3, max_center_dist: float = 0.4) -> dict:
    """
    Find unclustered Immich faces that match MS Photos faces.
    
    This finds faces where:
    - MS Photos has a labeled face on a photo
    - Immich detected a face at the same position
    - But the Immich face is NOT assigned to any person (unclustered)
    
    Returns:
        Dictionary with preview data for applying labels
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
    # Step 2: Load UNCLUSTERED Immich faces (personId IS NULL)
    # ==========================================================================
    with get_immich_connection() as immich_conn:
        immich_cursor = immich_conn.cursor()
        
        immich_cursor.execute("""
            SELECT 
                a."originalFileName",
                e."fileSizeInByte",
                af.id as face_id,
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
            WHERE af."personId" IS NULL
              AND af."deletedAt" IS NULL
              AND a."deletedAt" IS NULL
              AND af."boundingBoxX1" IS NOT NULL
        """)
        
        # Index by (filename, filesize)
        unclustered_faces_by_photo = defaultdict(list)
        
        for row in immich_cursor.fetchall():
            filename, filesize, face_id, asset_id, x1, y1, x2, y2, img_w, img_h = row
            if not filename or not filesize or not img_w or not img_h:
                continue
            
            key = (filename.lower(), filesize)
            rect = immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h)
            if not rect:
                continue
            
            unclustered_faces_by_photo[key].append({
                "face_id": str(face_id),
                "asset_id": str(asset_id),
                "rect": rect,
            })
        
        # Also get existing Immich people to check for name matches
        immich_cursor.execute("""
            SELECT id, name FROM person WHERE name IS NOT NULL AND name != ''
        """)
        existing_immich_people = {row[1]: str(row[0]) for row in immich_cursor.fetchall()}
    
    # ==========================================================================
    # Step 3: Match MS Photos faces to unclustered Immich faces
    # ==========================================================================
    common_photos = set(ms_faces_by_photo.keys()) & set(unclustered_faces_by_photo.keys())
    
    # Group matches by MS Photos person
    matches_by_person: dict[int, list[UnclusteredFaceMatch]] = defaultdict(list)
    
    for photo_key in common_photos:
        filename, file_size = photo_key
        ms_faces = ms_faces_by_photo[photo_key]
        unclustered_faces = unclustered_faces_by_photo[photo_key]
        
        # For each MS Photos face, find the best matching unclustered Immich face
        # Use greedy matching to ensure 1-to-1
        potential_matches = []
        
        for ms_idx, ms_face in enumerate(ms_faces):
            for imm_idx, imm_face in enumerate(unclustered_faces):
                iou = calculate_iou(ms_face["rect"], imm_face["rect"])
                center_dist = calculate_center_distance(ms_face["rect"], imm_face["rect"])
                
                if iou >= min_iou and center_dist <= max_center_dist:
                    potential_matches.append((
                        iou, center_dist, ms_idx, imm_idx, ms_face, imm_face
                    ))
        
        # Sort by IoU descending and do greedy matching
        potential_matches.sort(key=lambda x: x[0], reverse=True)
        used_ms = set()
        used_imm = set()
        
        for iou, center_dist, ms_idx, imm_idx, ms_face, imm_face in potential_matches:
            if ms_idx in used_ms or imm_idx in used_imm:
                continue
            
            used_ms.add(ms_idx)
            used_imm.add(imm_idx)
            
            match = UnclusteredFaceMatch(
                ms_person_id=ms_face["person_id"],
                ms_person_name=ms_face["person_name"],
                ms_rect=ms_face["rect"],
                immich_face_id=imm_face["face_id"],
                immich_asset_id=imm_face["asset_id"],
                immich_rect=imm_face["rect"],
                filename=filename,
                file_size=file_size,
                iou=iou,
                center_dist=center_dist,
            )
            matches_by_person[ms_face["person_id"]].append(match)
    
    # ==========================================================================
    # Step 4: Build preview for each person
    # ==========================================================================
    previews: list[PersonApplyPreview] = []
    
    for person_id, matches in matches_by_person.items():
        person_name = ms_people[person_id]
        
        # Check if person already exists in Immich
        existing_person_id = existing_immich_people.get(person_name)
        
        preview = PersonApplyPreview(
            ms_person_id=person_id,
            ms_person_name=person_name,
            existing_immich_person_id=existing_person_id,
            existing_immich_person_name=person_name if existing_person_id else None,
            faces_to_assign=matches,
            total_faces_in_ms_photos=ms_face_counts[person_id],
        )
        previews.append(preview)
    
    # Sort by number of faces to assign (descending)
    previews.sort(key=lambda p: p.face_count, reverse=True)
    
    # Compute stats
    total_unclustered_faces = sum(len(faces) for faces in unclustered_faces_by_photo.values())
    total_matchable_faces = sum(p.face_count for p in previews)
    people_needing_creation = sum(1 for p in previews if p.needs_person_creation)
    people_existing = sum(1 for p in previews if not p.needs_person_creation)
    
    return {
        "previews": previews,
        "stats": {
            "total_ms_people_with_matches": len(previews),
            "total_faces_to_assign": total_matchable_faces,
            "total_unclustered_faces_in_immich": total_unclustered_faces,
            "common_photos_with_unclustered": len(common_photos),
            "people_needing_creation": people_needing_creation,
            "people_already_exist": people_existing,
        }
    }


def preview_to_dict(preview: PersonApplyPreview) -> dict:
    """Convert a preview to a JSON-serializable dict."""
    return {
        "ms_person_id": preview.ms_person_id,
        "ms_person_name": preview.ms_person_name,
        "existing_immich_person_id": preview.existing_immich_person_id,
        "existing_immich_person_name": preview.existing_immich_person_name,
        "needs_person_creation": preview.needs_person_creation,
        "face_count": preview.face_count,
        "total_faces_in_ms_photos": preview.total_faces_in_ms_photos,
        "avg_iou": preview.avg_iou,
        "faces": [
            {
                "immich_face_id": f.immich_face_id,
                "immich_asset_id": f.immich_asset_id,
                "filename": f.filename,
                "iou": f.iou,
                "center_dist": f.center_dist,
                # Include rectangle data for drawing boxes on thumbnails
                "ms_rect_x1": f.ms_rect[0],
                "ms_rect_y1": f.ms_rect[1],
                "ms_rect_x2": f.ms_rect[2],
                "ms_rect_y2": f.ms_rect[3],
                "immich_rect_x1": f.immich_rect[0],
                "immich_rect_y1": f.immich_rect[1],
                "immich_rect_x2": f.immich_rect[2],
                "immich_rect_y2": f.immich_rect[3],
            }
            for f in preview.faces_to_assign
        ],
        "sample_filenames": list(set(f.filename for f in preview.faces_to_assign))[:5],
    }


@dataclass
class UnclusteredFaceDetail:
    """Detailed info for one unclustered face match, for the photo viewer."""
    filename: str
    immich_asset_id: str
    immich_face_id: str
    file_size: int
    
    # MS Photos face rectangle (normalized 0-1)
    ms_person_id: int
    ms_person_name: str
    ms_rect_x1: float
    ms_rect_y1: float
    ms_rect_x2: float
    ms_rect_y2: float
    
    # Immich face rectangle (normalized 0-1)
    immich_rect_x1: float
    immich_rect_y1: float
    immich_rect_x2: float
    immich_rect_y2: float
    
    # Match quality
    iou: float
    center_dist: float


def get_unclustered_face_details(ms_person_id: int, min_iou: float = 0.3, max_center_dist: float = 0.4) -> dict:
    """
    Get detailed face match data for an MS Photos person's unclustered matches.
    
    Returns detailed rectangle info for displaying in a photo viewer.
    """
    # Run the full unclustered matching
    result = find_unclustered_matches(min_iou, max_center_dist)
    
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
            "total_matches": 0,
            "matches": [],
        }
    
    # Convert matches to detailed format
    details = []
    for match in person_preview.faces_to_assign:
        detail = UnclusteredFaceDetail(
            filename=match.filename,
            immich_asset_id=match.immich_asset_id,
            immich_face_id=match.immich_face_id,
            file_size=match.file_size,
            ms_person_id=match.ms_person_id,
            ms_person_name=match.ms_person_name,
            ms_rect_x1=match.ms_rect[0],
            ms_rect_y1=match.ms_rect[1],
            ms_rect_x2=match.ms_rect[2],
            ms_rect_y2=match.ms_rect[3],
            immich_rect_x1=match.immich_rect[0],
            immich_rect_y1=match.immich_rect[1],
            immich_rect_x2=match.immich_rect[2],
            immich_rect_y2=match.immich_rect[3],
            iou=match.iou,
            center_dist=match.center_dist,
        )
        details.append(detail)
    
    return {
        "ms_person_id": ms_person_id,
        "ms_person_name": person_preview.ms_person_name,
        "total_matches": len(details),
        "matches": details,
    }

"""
Detailed face match service - provides individual photo-level match data
for debugging and review.
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_ms_photos_connection, get_immich_connection
# Import shared matching utilities - single source of truth
from services.matching import (
    calculate_iou, 
    calculate_center_distance, 
    ms_rect_to_normalized,
    immich_rect_to_normalized
)


@dataclass
class PhotoFaceMatch:
    """A single face match on a specific photo."""
    filename: str
    immich_asset_id: str
    immich_original_path: str
    ms_item_path: str
    
    # MS Photos face data
    ms_person_id: int
    ms_person_name: str
    ms_rect_x1: float
    ms_rect_y1: float
    ms_rect_x2: float
    ms_rect_y2: float
    
    # Immich face data
    immich_cluster_id: str
    immich_cluster_name: Optional[str]
    immich_rect_x1: float
    immich_rect_y1: float
    immich_rect_x2: float
    immich_rect_y2: float
    
    # Match quality
    iou: float
    center_dist: float  # Normalized center distance
    
    # Photo metadata
    image_width: int
    image_height: int
    file_size: int  # File size in bytes


def get_detailed_face_matches(
    ms_person_id: int, 
    immich_cluster_id: str, 
    min_iou: float = 0.3,
    max_center_dist: float = 0.4
) -> list[PhotoFaceMatch]:
    """
    Get all individual face matches between an MS Photos person and Immich cluster.
    
    Returns detailed information for each photo where faces match, including
    rect coordinates for drawing overlays.
    """
    # Load MS Photos faces for this person
    with get_ms_photos_connection() as ms_conn:
        ms_cursor = ms_conn.cursor()
        
        ms_cursor.execute("""
            SELECT 
                i.Item_FileName,
                i.Item_FileSize,
                f.Face_Rect_Top,
                f.Face_Rect_Left,
                f.Face_Rect_Width,
                f.Face_Rect_Height,
                p.Person_Name,
                fld.Folder_Path
            FROM Face f
            JOIN Item i ON f.Face_ItemId = i.Item_Id
            JOIN Person p ON f.Face_PersonId = p.Person_Id
            LEFT JOIN Folder fld ON i.Item_ParentFolderId = fld.Folder_Id
            WHERE p.Person_Id = ?
              AND f.Face_Rect_Top IS NOT NULL
        """, (ms_person_id,))
        
        # Build: (filename_lower, filesize) -> list of (person_name, rect, folder_path)
        ms_faces_by_photo = defaultdict(list)
        
        for row in ms_cursor.fetchall():
            filename, filesize, top, left, width, height, person_name, folder_path = row
            if not filename:
                continue
            # Use (filename, filesize) tuple as key for unique identification
            key = (filename.lower(), filesize)
            rect = ms_rect_to_normalized(top, left, width, height)
            ms_faces_by_photo[key].append({
                "person_name": person_name,
                "rect": rect,
                "folder_path": folder_path or "",
            })
    
    # Load Immich faces for this cluster
    with get_immich_connection() as immich_conn:
        immich_cursor = immich_conn.cursor()
        
        immich_cursor.execute("""
            SELECT 
                a."originalFileName",
                e."fileSizeInByte",
                a.id as asset_id,
                a."originalPath",
                af."boundingBoxX1",
                af."boundingBoxY1",
                af."boundingBoxX2",
                af."boundingBoxY2",
                af."imageWidth",
                af."imageHeight",
                p.name as cluster_name
            FROM asset_face af
            JOIN asset a ON af."assetId" = a.id
            LEFT JOIN asset_exif e ON a.id = e."assetId"
            LEFT JOIN person p ON af."personId" = p.id
            WHERE af."personId" = %s
              AND af."deletedAt" IS NULL
              AND a."deletedAt" IS NULL
              AND af."boundingBoxX1" IS NOT NULL
        """, (immich_cluster_id,))
        
        # Build: (filename_lower, filesize) -> list of face data
        immich_faces_by_photo = defaultdict(list)
        
        for row in immich_cursor.fetchall():
            (filename, filesize, asset_id, original_path, x1, y1, x2, y2, 
             img_w, img_h, cluster_name) = row
            if not filename or not img_w or not img_h or not filesize:
                continue
            
            # Use (filename, filesize) tuple as key for unique identification
            key = (filename.lower(), filesize)
            # Convert to normalized coords
            rect = (x1 / img_w, y1 / img_h, x2 / img_w, y2 / img_h)
            
            immich_faces_by_photo[key].append({
                "asset_id": str(asset_id),
                "original_path": original_path or "",
                "rect": rect,
                "cluster_name": cluster_name,
                "image_width": img_w,
                "image_height": img_h,
                "file_size": filesize,
            })
    
    # Find common photos and match faces using GREEDY matching
    # This ensures consistency with the main matching algorithm
    common_photos = set(ms_faces_by_photo.keys()) & set(immich_faces_by_photo.keys())
    
    matches = []
    for photo_key in common_photos:
        filename, filesize = photo_key  # Unpack the (filename, filesize) tuple
        ms_faces = ms_faces_by_photo[photo_key]
        immich_faces = immich_faces_by_photo[photo_key]
        
        # Greedy matching: collect all potential matches, sort by IoU, pick best non-conflicting
        potential_matches = []
        for ms_idx, ms_face in enumerate(ms_faces):
            for imm_idx, imm_face in enumerate(immich_faces):
                iou = calculate_iou(ms_face["rect"], imm_face["rect"])
                center_dist = calculate_center_distance(ms_face["rect"], imm_face["rect"])
                # Both criteria must be satisfied (AND logic)
                if iou >= min_iou and center_dist <= max_center_dist:
                    potential_matches.append((iou, center_dist, ms_idx, imm_idx, ms_face, imm_face))
        
        # Sort by IoU descending (best matches first)
        potential_matches.sort(key=lambda x: x[0], reverse=True)
        
        # Greedily select matches, ensuring each face is used at most once
        used_ms_faces = set()
        used_imm_faces = set()
        
        for iou, center_dist, ms_idx, imm_idx, ms_face, imm_face in potential_matches:
            if ms_idx in used_ms_faces or imm_idx in used_imm_faces:
                continue  # This face already matched with a better candidate
            
            used_ms_faces.add(ms_idx)
            used_imm_faces.add(imm_idx)
            
            ms_rect = ms_face["rect"]
            imm_rect = imm_face["rect"]
            
            matches.append(PhotoFaceMatch(
                filename=filename,
                immich_asset_id=imm_face["asset_id"],
                immich_original_path=imm_face["original_path"],
                ms_item_path=ms_face["folder_path"],
                
                ms_person_id=ms_person_id,
                ms_person_name=ms_face["person_name"],
                ms_rect_x1=ms_rect[0],
                ms_rect_y1=ms_rect[1],
                ms_rect_x2=ms_rect[2],
                ms_rect_y2=ms_rect[3],
                
                immich_cluster_id=immich_cluster_id,
                immich_cluster_name=imm_face["cluster_name"],
                immich_rect_x1=imm_rect[0],
                immich_rect_y1=imm_rect[1],
                immich_rect_x2=imm_rect[2],
                immich_rect_y2=imm_rect[3],
                
                iou=iou,
                center_dist=center_dist,
                image_width=imm_face["image_width"],
                image_height=imm_face["image_height"],
                file_size=imm_face["file_size"],
            ))
    
    # Sort by IoU descending (best matches first)
    matches.sort(key=lambda m: m.iou, reverse=True)
    
    return matches

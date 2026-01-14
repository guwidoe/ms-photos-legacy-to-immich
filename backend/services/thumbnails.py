"""
Thumbnail service for generating face crops.
"""

from pathlib import Path
from io import BytesIO
from typing import Optional
import base64
import sys
import os

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import get_settings
from database import get_ms_photos_connection, get_immich_connection


def convert_immich_path_to_windows(immich_path: str) -> str:
    """Convert Immich container path to Windows path."""
    settings = get_settings()
    
    for container_path, windows_path in settings.path_mappings.items():
        if immich_path.startswith(container_path):
            return immich_path.replace(container_path, windows_path, 1)
    
    return immich_path


def get_immich_photo_paths() -> dict[str, str]:
    """Get filename -> full path mapping from Immich."""
    with get_immich_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT LOWER("originalFileName"), "originalPath"
            FROM asset
            WHERE "deletedAt" IS NULL AND "originalPath" IS NOT NULL
        ''')
        
        return {row[0]: row[1] for row in cursor.fetchall() if row[0] and row[1]}


def get_ms_face_data() -> dict:
    """Get face rectangles and photo info for MS Photos people."""
    with get_ms_photos_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                p.Person_Id,
                p.Person_Name,
                i.Item_FileName,
                f.Face_Rect_Top, 
                f.Face_Rect_Left, 
                f.Face_Rect_Width, 
                f.Face_Rect_Height
            FROM Person p
            LEFT JOIN Face f ON p.Person_BestFaceId = f.Face_Id
            LEFT JOIN Item i ON f.Face_ItemId = i.Item_Id
            WHERE p.Person_Name IS NOT NULL AND p.Person_Name != ''
        """)
        
        result = {}
        for row in cursor.fetchall():
            person_id, name, filename, top, left, width, height = row
            result[person_id] = {
                'name': name,
                'filename': filename.lower() if filename else None,
                'rect': (top, left, width, height) if top is not None else None
            }
        
        return result


def crop_face_from_image(image_path: str, rect: tuple, padding: float = 0.3) -> Optional[bytes]:
    """
    Crop face from image using normalized rectangle coordinates.
    
    Args:
        image_path: Path to the image file
        rect: (top, left, width, height) normalized 0-1
        padding: Extra padding around face (0.3 = 30%)
    
    Returns:
        JPEG bytes of cropped face, or None if failed
    """
    if not HAS_PIL:
        return None
    
    try:
        windows_path = convert_immich_path_to_windows(image_path)
        
        if not Path(windows_path).exists():
            return None
        
        with Image.open(windows_path) as img:
            img_width, img_height = img.size
            
            top_val, left, width, height = rect
            
            # MS Photos 'top' is the bottom of the face rectangle
            actual_top = top_val - height
            
            # Convert normalized coords to pixels
            x1 = int(left * img_width)
            y1 = int(actual_top * img_height)
            x2 = int((left + width) * img_width)
            y2 = int(top_val * img_height)
            
            # Add padding
            pad_w = int(width * img_width * padding)
            pad_h = int(height * img_height * padding)
            
            x1 = max(0, x1 - pad_w)
            y1 = max(0, y1 - pad_h)
            x2 = min(img_width, x2 + pad_w)
            y2 = min(img_height, y2 + pad_h)
            
            if x2 <= x1 or y2 <= y1:
                return None
            
            face_img = img.crop((x1, y1, x2, y2))
            face_img.thumbnail((200, 200), Image.Resampling.LANCZOS)
            
            buffer = BytesIO()
            face_img.convert('RGB').save(buffer, format='JPEG', quality=85)
            return buffer.getvalue()
            
    except Exception:
        return None


def get_ms_person_thumbnail(person_id: int) -> Optional[str]:
    """
    Get base64-encoded thumbnail for an MS Photos person.
    
    Returns the "best face" image cropped from the original photo.
    """
    face_data = get_ms_face_data()
    person_info = face_data.get(person_id)
    
    if not person_info:
        return None
    
    filename = person_info.get('filename')
    rect = person_info.get('rect')
    
    if not filename or not rect:
        return None
    
    # Find the image path in Immich
    photo_paths = get_immich_photo_paths()
    image_path = photo_paths.get(filename)
    
    if not image_path:
        return None
    
    thumb_bytes = crop_face_from_image(image_path, rect)
    
    if thumb_bytes:
        return base64.b64encode(thumb_bytes).decode()
    
    return None

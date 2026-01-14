"""
Face matching service - matches MS Photos people to Immich clusters.

Algorithm (from match_v3.py):
1. Find photos in both databases by filename
2. For each common photo, match faces by position (IoU overlap)
3. If faces overlap sufficiently, they're the same face -> match the person to cluster

This is foolproof: same filename + same face position = same person.
"""

from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_ms_photos_connection, get_immich_connection


@dataclass
class PersonMatch:
    """A match between MS Photos person and Immich cluster."""
    ms_person_id: int
    ms_person_name: str
    immich_cluster_id: str
    immich_cluster_name: Optional[str]
    face_matches: int  # Number of face matches across photos
    avg_iou: float
    avg_center_dist: float  # Average normalized center distance
    confidence: str  # high, medium, low
    sample_photos: list[str]


def calculate_iou(rect1: tuple, rect2: tuple) -> float:
    """
    Calculate Intersection over Union (IoU) between two rectangles.
    Both rects should be in (x1, y1, x2, y2) normalized format.
    """
    x1_1, y1_1, x2_1, y2_1 = rect1
    x1_2, y1_2, x2_2, y2_2 = rect2
    
    # Calculate intersection
    x1_i = max(x1_1, x1_2)
    y1_i = max(y1_1, y1_2)
    x2_i = min(x2_1, x2_2)
    y2_i = min(y2_1, y2_2)
    
    if x2_i <= x1_i or y2_i <= y1_i:
        return 0.0
    
    intersection = (x2_i - x1_i) * (y2_i - y1_i)
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    union = area1 + area2 - intersection
    
    return intersection / union if union > 0 else 0.0


def calculate_center_distance(rect1: tuple, rect2: tuple) -> float:
    """
    Calculate normalized distance between rectangle centers.
    
    Returns a value between 0 (same center) and ~1.4 (opposite corners).
    A value <= 0.3 means centers are quite close (concentric).
    
    Both rects should be in (x1, y1, x2, y2) normalized format.
    """
    x1_1, y1_1, x2_1, y2_1 = rect1
    x1_2, y1_2, x2_2, y2_2 = rect2
    
    # Calculate centers
    cx1 = (x1_1 + x2_1) / 2
    cy1 = (y1_1 + y2_1) / 2
    cx2 = (x1_2 + x2_2) / 2
    cy2 = (y1_2 + y2_2) / 2
    
    # Euclidean distance between centers
    dist = ((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2) ** 0.5
    
    # Normalize by diagonal of union bounding box
    union_x1 = min(x1_1, x1_2)
    union_y1 = min(y1_1, y1_2)
    union_x2 = max(x2_1, x2_2)
    union_y2 = max(y2_1, y2_2)
    union_diag = ((union_x2 - union_x1) ** 2 + (union_y2 - union_y1) ** 2) ** 0.5
    
    return dist / union_diag if union_diag > 0 else 1.0


def ms_rect_to_normalized(top_val, left, width, height) -> tuple:
    """
    Convert MS Photos rect to normalized (x1, y1, x2, y2) format.
    MS Photos 'top' is actually the bottom of the face rectangle.
    """
    actual_top = top_val - height
    return (left, actual_top, left + width, top_val)


def immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h) -> Optional[tuple]:
    """Convert Immich pixel rect to normalized (x1, y1, x2, y2)."""
    if not img_w or not img_h:
        return None
    return (x1 / img_w, y1 / img_h, x2 / img_w, y2 / img_h)


def find_matches(min_iou: float = 0.3, max_center_dist: float = 0.4) -> dict:
    """
    Find matches between MS Photos people and Immich clusters.
    
    Uses filename + filesize to identify common photos, then matches faces by 
    position (IoU overlap AND center distance) on those photos.
    
    Args:
        min_iou: Minimum IoU to consider faces as matching (0.3 = 30% overlap)
        max_center_dist: Maximum normalized center distance (0.4 = centers within 40% of diagonal)
    
    Returns:
        Dictionary with all_matches, applicable, and stats
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
        
        # Index by (filename_lowercase, filesize) for unique photo identification
        ms_faces_by_photo = defaultdict(list)
        ms_people = {}
        
        for row in ms_cursor.fetchall():
            filename, filesize, person_id, person_name, top, left, width, height = row
            if not filename:
                continue
            
            # Use (filename, filesize) tuple as key for unique identification
            key = (filename.lower(), filesize)
            rect = ms_rect_to_normalized(top, left, width, height)
            ms_faces_by_photo[key].append((person_id, person_name, rect))
            ms_people[person_id] = person_name
    
    # ==========================================================================
    # Step 2: Load Immich faces with positions
    # ==========================================================================
    with get_immich_connection() as immich_conn:
        immich_cursor = immich_conn.cursor()
        
        immich_cursor.execute("""
            SELECT 
                a."originalFileName",
                e."fileSizeInByte",
                af."personId",
                p.name,
                af."boundingBoxX1",
                af."boundingBoxY1",
                af."boundingBoxX2",
                af."boundingBoxY2",
                af."imageWidth",
                af."imageHeight"
            FROM asset_face af
            JOIN asset a ON af."assetId" = a.id
            LEFT JOIN asset_exif e ON a.id = e."assetId"
            LEFT JOIN person p ON af."personId" = p.id
            WHERE af."personId" IS NOT NULL
              AND af."deletedAt" IS NULL
              AND a."deletedAt" IS NULL
              AND af."boundingBoxX1" IS NOT NULL
        """)
        
        immich_faces_by_photo = defaultdict(list)
        immich_clusters = {}
        
        for row in immich_cursor.fetchall():
            filename, filesize, cluster_id, cluster_name, x1, y1, x2, y2, img_w, img_h = row
            if not filename or not filesize:
                continue
            
            # Use (filename, filesize) tuple as key for unique identification
            key = (filename.lower(), filesize)
            rect = immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h)
            if not rect:
                continue
            
            cluster_id_str = str(cluster_id)
            immich_faces_by_photo[key].append((cluster_id_str, cluster_name, rect))
            immich_clusters[cluster_id_str] = cluster_name
    
    # ==========================================================================
    # Step 3: Find common photos and match faces by position (GREEDY MATCHING)
    # ==========================================================================
    common_photos = set(ms_faces_by_photo.keys()) & set(immich_faces_by_photo.keys())
    
    # Collect face-level matches: (ms_person_id, immich_cluster_id) -> [(iou, filename), ...]
    face_matches = defaultdict(list)
    
    for photo in common_photos:
        ms_faces = ms_faces_by_photo[photo]
        immich_faces = immich_faces_by_photo[photo]
        
        # Greedy matching: find the best 1-to-1 match for faces on this photo
        # This prevents one MS face from matching multiple Immich faces (or vice versa)
        
        # Step 3a: Collect all potential matches with IoU scores
        potential_matches = []
        for ms_idx, (ms_person_id, ms_name, ms_rect) in enumerate(ms_faces):
            for imm_idx, (imm_cluster_id, imm_name, imm_rect) in enumerate(immich_faces):
                iou = calculate_iou(ms_rect, imm_rect)
                center_dist = calculate_center_distance(ms_rect, imm_rect)
                # Both criteria must be satisfied (AND logic)
                if iou >= min_iou and center_dist <= max_center_dist:
                    potential_matches.append((iou, center_dist, ms_idx, imm_idx, ms_person_id, imm_cluster_id))
        
        # Step 3b: Sort by IoU descending (best matches first)
        potential_matches.sort(key=lambda x: x[0], reverse=True)
        
        # Step 3c: Greedily assign matches, ensuring each face is used at most once
        used_ms_faces = set()
        used_imm_faces = set()
        
        for iou, center_dist, ms_idx, imm_idx, ms_person_id, imm_cluster_id in potential_matches:
            if ms_idx in used_ms_faces or imm_idx in used_imm_faces:
                continue  # This face already matched with someone else
            
            # Accept this match
            used_ms_faces.add(ms_idx)
            used_imm_faces.add(imm_idx)
            face_matches[(ms_person_id, imm_cluster_id)].append((iou, center_dist, photo))
    
    # ==========================================================================
    # Step 4: Aggregate face matches to person-cluster matches
    # ==========================================================================
    results = []
    for (ms_person_id, imm_cluster_id), matches in face_matches.items():
        iou_scores = [m[0] for m in matches]
        center_dists = [m[1] for m in matches]
        # m[2] is (filename, filesize) tuple, extract just the filename
        sample_photos = list(set(m[2][0] for m in matches))[:5]  # Unique filenames
        avg_iou = sum(iou_scores) / len(iou_scores)
        avg_center_dist = sum(center_dists) / len(center_dists)
        num_matches = len(matches)
        
        # Confidence based on number of face matches and average IoU
        if num_matches >= 5 and avg_iou >= 0.4:
            confidence = "high"
        elif num_matches >= 2 and avg_iou >= 0.35:
            confidence = "medium"
        else:
            confidence = "low"
        
        results.append(PersonMatch(
            ms_person_id=ms_person_id,
            ms_person_name=ms_people[ms_person_id],
            immich_cluster_id=imm_cluster_id,
            immich_cluster_name=immich_clusters.get(imm_cluster_id),
            face_matches=num_matches,
            avg_iou=avg_iou,
            avg_center_dist=avg_center_dist,
            confidence=confidence,
            sample_photos=sample_photos,
        ))
    
    # Sort by number of face matches (descending)
    results.sort(key=lambda x: (x.face_matches, x.avg_iou), reverse=True)
    
    # Separate applicable matches (unnamed clusters only)
    applicable = [r for r in results if not r.immich_cluster_name]
    
    return {
        "all_matches": results,
        "applicable": applicable,
        "stats": {
            "ms_people_count": len(ms_people),
            "immich_clusters_count": len(immich_clusters),
            "ms_photos_with_faces": len(ms_faces_by_photo),
            "immich_photos_with_faces": len(immich_faces_by_photo),
            "common_photos": len(common_photos),
            "total_matches": len(results),
            "applicable_matches": len(applicable),
            "high_confidence": sum(1 for r in applicable if r.confidence == "high"),
            "medium_confidence": sum(1 for r in applicable if r.confidence == "medium"),
            "low_confidence": sum(1 for r in applicable if r.confidence == "low"),
        }
    }


# Keep old function names for compatibility
def find_face_position_matches(min_iou: float = 0.3, max_center_dist: float = 0.4) -> dict:
    """Alias for find_matches."""
    return find_matches(min_iou=min_iou, max_center_dist=max_center_dist)


def find_definitive_matches(min_evidence: int = 1) -> dict:
    """Alias for find_matches (uses same algorithm now)."""
    return find_matches(min_iou=0.3, max_center_dist=0.4)


@dataclass
class UnmatchedPerson:
    """An MS Photos person with no matching Immich cluster."""
    ms_person_id: int
    ms_person_name: str
    face_count: int  # Number of faces in MS Photos
    sample_files: list[str]  # Sample filenames where this person appears


def find_unmatched_people(min_iou: float = 0.3, max_center_dist: float = 0.4) -> dict:
    """
    Find MS Photos people who have no matching Immich cluster.
    
    Returns:
        Dictionary with unmatched people and stats
    """
    # First, get all matches
    match_result = find_matches(min_iou=min_iou, max_center_dist=max_center_dist)
    matched_ms_person_ids = set(m.ms_person_id for m in match_result["all_matches"])
    
    # Load all MS Photos people with their face counts and sample files
    with get_ms_photos_connection() as ms_conn:
        ms_cursor = ms_conn.cursor()
        
        # Get all named people with face counts
        ms_cursor.execute("""
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
        
        all_people = {}
        for row in ms_cursor.fetchall():
            person_id, person_name, face_count = row
            all_people[person_id] = {
                "name": person_name,
                "face_count": face_count,
            }
        
        # Get sample files for each person
        ms_cursor.execute("""
            SELECT 
                p.Person_Id,
                i.Item_FileName,
                fld.Folder_Path
            FROM Person p
            JOIN Face f ON f.Face_PersonId = p.Person_Id
            JOIN Item i ON f.Face_ItemId = i.Item_Id
            LEFT JOIN Folder fld ON i.Item_ParentFolderId = fld.Folder_Id
            WHERE p.Person_Name IS NOT NULL 
              AND p.Person_Name != ''
              AND TRIM(p.Person_Name) != ''
        """)
        
        files_by_person = defaultdict(list)
        for row in ms_cursor.fetchall():
            person_id, filename, folder_path = row
            if filename:
                full_path = f"{folder_path}/{filename}" if folder_path else filename
                files_by_person[person_id].append(full_path)
    
    # Find unmatched people
    unmatched = []
    for person_id, info in all_people.items():
        if person_id not in matched_ms_person_ids:
            # Get up to 10 sample files for this person
            sample_files = list(set(files_by_person.get(person_id, [])))[:10]
            unmatched.append(UnmatchedPerson(
                ms_person_id=person_id,
                ms_person_name=info["name"],
                face_count=info["face_count"],
                sample_files=sample_files,
            ))
    
    # Sort by face count descending (people with more faces are more important)
    unmatched.sort(key=lambda x: x.face_count, reverse=True)
    
    return {
        "unmatched": unmatched,
        "stats": {
            "total_ms_people": len(all_people),
            "matched_people": len(matched_ms_person_ids),
            "unmatched_people": len(unmatched),
            "match_rate": len(matched_ms_person_ids) / len(all_people) * 100 if all_people else 0,
        }
    }


@dataclass
class RawFaceMatch:
    """A single potential face match with all metrics for analysis."""
    ms_person_id: int
    ms_person_name: str
    immich_cluster_id: str
    immich_cluster_name: Optional[str]
    iou: float
    center_dist: float
    filename: str


def get_match_analytics() -> dict:
    """
    Get raw matching data for analytics - ALL potential matches without filtering.
    
    This returns every face pair that shares a photo, along with their IoU and center 
    distance values, so we can analyze the distribution and find optimal thresholds.
    
    Returns:
        Dictionary with raw_matches, histograms, and statistics
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
        
        ms_faces_by_photo = defaultdict(list)
        ms_people = {}
        
        for row in ms_cursor.fetchall():
            filename, filesize, person_id, person_name, top, left, width, height = row
            if not filename:
                continue
            key = (filename.lower(), filesize)
            rect = ms_rect_to_normalized(top, left, width, height)
            ms_faces_by_photo[key].append((person_id, person_name, rect))
            ms_people[person_id] = person_name
    
    # ==========================================================================
    # Step 2: Load Immich faces with positions
    # ==========================================================================
    with get_immich_connection() as immich_conn:
        immich_cursor = immich_conn.cursor()
        
        immich_cursor.execute("""
            SELECT 
                a."originalFileName",
                e."fileSizeInByte",
                af."personId",
                p.name,
                af."boundingBoxX1",
                af."boundingBoxY1",
                af."boundingBoxX2",
                af."boundingBoxY2",
                af."imageWidth",
                af."imageHeight"
            FROM asset_face af
            JOIN asset a ON af."assetId" = a.id
            LEFT JOIN asset_exif e ON a.id = e."assetId"
            LEFT JOIN person p ON af."personId" = p.id
            WHERE af."personId" IS NOT NULL
              AND af."deletedAt" IS NULL
              AND a."deletedAt" IS NULL
              AND af."boundingBoxX1" IS NOT NULL
        """)
        
        immich_faces_by_photo = defaultdict(list)
        immich_clusters = {}
        
        for row in immich_cursor.fetchall():
            filename, filesize, cluster_id, cluster_name, x1, y1, x2, y2, img_w, img_h = row
            if not filename or not filesize:
                continue
            
            key = (filename.lower(), filesize)
            rect = immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h)
            if not rect:
                continue
            
            cluster_id_str = str(cluster_id)
            immich_faces_by_photo[key].append((cluster_id_str, cluster_name, rect))
            if cluster_id_str not in immich_clusters:
                immich_clusters[cluster_id_str] = cluster_name
    
    # ==========================================================================
    # Step 3: Find ALL face pairs on common photos and compute metrics
    # ==========================================================================
    common_photos = set(ms_faces_by_photo.keys()) & set(immich_faces_by_photo.keys())
    
    # Collect ALL raw matches (no filtering)
    raw_matches: list[RawFaceMatch] = []
    iou_values = []
    center_dist_values = []
    
    for photo_key in common_photos:
        filename = photo_key[0]
        ms_faces = ms_faces_by_photo[photo_key]
        immich_faces = immich_faces_by_photo[photo_key]
        
        for ms_person_id, ms_name, ms_rect in ms_faces:
            for imm_cluster_id, imm_name, imm_rect in immich_faces:
                iou = calculate_iou(ms_rect, imm_rect)
                center_dist = calculate_center_distance(ms_rect, imm_rect)
                
                # Only include if there's ANY overlap (IoU > 0)
                if iou > 0:
                    raw_matches.append(RawFaceMatch(
                        ms_person_id=ms_person_id,
                        ms_person_name=ms_name,
                        immich_cluster_id=imm_cluster_id,
                        immich_cluster_name=imm_name,
                        iou=iou,
                        center_dist=center_dist,
                        filename=filename,
                    ))
                    iou_values.append(iou)
                    center_dist_values.append(center_dist)
    
    # ==========================================================================
    # Step 4: Compute histograms and statistics
    # ==========================================================================
    def compute_histogram(values: list, bins: int = 20) -> dict:
        """Compute histogram data for visualization."""
        if not values:
            return {"bins": [], "counts": [], "edges": []}
        
        min_val = min(values)
        max_val = max(values)
        bin_width = (max_val - min_val) / bins if max_val > min_val else 1
        
        edges = [min_val + i * bin_width for i in range(bins + 1)]
        counts = [0] * bins
        
        for v in values:
            bin_idx = min(int((v - min_val) / bin_width), bins - 1) if bin_width > 0 else 0
            counts[bin_idx] += 1
        
        # Compute bin centers for display
        bin_centers = [(edges[i] + edges[i + 1]) / 2 for i in range(bins)]
        
        return {
            "bins": bin_centers,
            "counts": counts,
            "edges": edges,
        }
    
    def compute_percentiles(values: list) -> dict:
        """Compute key percentiles."""
        if not values:
            return {}
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        return {
            "p5": sorted_vals[int(n * 0.05)],
            "p25": sorted_vals[int(n * 0.25)],
            "p50": sorted_vals[int(n * 0.50)],
            "p75": sorted_vals[int(n * 0.75)],
            "p95": sorted_vals[int(n * 0.95)],
            "min": sorted_vals[0],
            "max": sorted_vals[-1],
            "mean": sum(sorted_vals) / n,
        }
    
    def find_optimal_threshold_otsu(values: list, bins: int = 100) -> float:
        """
        Find optimal threshold using Otsu's method.
        Finds the threshold that minimizes intra-class variance.
        """
        if not values or len(values) < 10:
            return 0.3  # Default
        
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        
        best_threshold = sorted_vals[n // 2]
        best_variance = float('inf')
        
        # Try different thresholds
        for i in range(1, min(bins, n - 1)):
            threshold = sorted_vals[int(n * i / bins)]
            
            # Split into two classes
            class1 = [v for v in sorted_vals if v <= threshold]
            class2 = [v for v in sorted_vals if v > threshold]
            
            if not class1 or not class2:
                continue
            
            # Compute weighted variance
            w1 = len(class1) / n
            w2 = len(class2) / n
            mean1 = sum(class1) / len(class1)
            mean2 = sum(class2) / len(class2)
            var1 = sum((v - mean1) ** 2 for v in class1) / len(class1)
            var2 = sum((v - mean2) ** 2 for v in class2) / len(class2)
            
            within_class_var = w1 * var1 + w2 * var2
            
            if within_class_var < best_variance:
                best_variance = within_class_var
                best_threshold = threshold
        
        return best_threshold
    
    # Compute stats
    iou_histogram = compute_histogram(iou_values, bins=20)
    center_dist_histogram = compute_histogram(center_dist_values, bins=20)
    
    iou_percentiles = compute_percentiles(iou_values)
    center_dist_percentiles = compute_percentiles(center_dist_values)
    
    # Find suggested thresholds
    suggested_iou_threshold = find_optimal_threshold_otsu(iou_values)
    suggested_center_dist_threshold = find_optimal_threshold_otsu(center_dist_values)
    
    # Count matches at various thresholds for CDF-like analysis
    def count_at_thresholds(values: list, thresholds: list) -> list:
        return [sum(1 for v in values if v >= t) / len(values) * 100 if values else 0 
                for t in thresholds]
    
    iou_thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    center_dist_thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    
    return {
        "raw_matches": [
            {
                "ms_person_id": m.ms_person_id,
                "ms_person_name": m.ms_person_name,
                "immich_cluster_id": m.immich_cluster_id,
                "immich_cluster_name": m.immich_cluster_name,
                "iou": m.iou,
                "center_dist": m.center_dist,
                "filename": m.filename,
            }
            for m in raw_matches
        ],
        "histograms": {
            "iou": iou_histogram,
            "center_dist": center_dist_histogram,
        },
        "percentiles": {
            "iou": iou_percentiles,
            "center_dist": center_dist_percentiles,
        },
        "suggested_thresholds": {
            "iou": round(suggested_iou_threshold, 3),
            "center_dist": round(suggested_center_dist_threshold, 3),
        },
        "cumulative": {
            "iou": {
                "thresholds": iou_thresholds,
                "percent_above": count_at_thresholds(iou_values, iou_thresholds),
            },
            "center_dist": {
                "thresholds": center_dist_thresholds,
                "percent_below": [100 - p for p in count_at_thresholds(
                    [1 - v for v in center_dist_values],  # Invert for "below" semantics
                    [1 - t for t in center_dist_thresholds]
                )],
            },
        },
        "stats": {
            "total_raw_matches": len(raw_matches),
            "common_photos": len(common_photos),
            "ms_people_count": len(ms_people),
            "ms_unique_people_count": len(set(ms_people.values())),
            "immich_clusters_count": len(immich_clusters),
            "immich_unique_people_count": len(set(c for c in immich_clusters.values() if c)),
        }
    }


def run_full_analysis(min_iou: float = 0.3, max_center_dist: float = 0.4) -> dict:
    """
    Run the complete matching analysis in one call.
    
    This is the main entry point for the refactored UI - it computes everything
    needed for all tabs in a single call to avoid redundant database queries.
    
    Returns:
        Dictionary with analytics, matches, and stats for all tabs
    """
    # Import here to avoid circular imports
    from services.cluster_validation import validate_clusters, find_mergeable_clusters
    from services.apply_labels import find_unclustered_matches, preview_to_dict
    
    # Get analytics data (raw matches + histograms)
    analytics = get_match_analytics()
    
    # Get filtered matches using thresholds
    matches_result = find_matches(min_iou=min_iou, max_center_dist=max_center_dist)
    
    # Get validation issues
    validation_result = validate_clusters(
        min_iou=min_iou, 
        max_center_dist=max_center_dist, 
        min_faces=3
    )
    
    # Get merge candidates
    merge_result = find_mergeable_clusters(
        min_iou=min_iou, 
        max_center_dist=max_center_dist, 
        min_matches=2
    )
    
    # Get unclustered face matches
    unclustered_result = find_unclustered_matches(
        min_iou=min_iou, 
        max_center_dist=max_center_dist
    )
    
    return {
        # Analytics data (for histograms)
        "analytics": {
            "raw_matches": analytics["raw_matches"],
            "histograms": analytics["histograms"],
            "percentiles": analytics["percentiles"],
            "suggested_thresholds": analytics["suggested_thresholds"],
            "cumulative": analytics["cumulative"],
        },
        
        # Transfer Names tab data
        "matches": {
            "all_matches": [asdict(m) for m in matches_result["all_matches"]],
            "applicable": [asdict(m) for m in matches_result["applicable"]],
        },
        
        # Assign Faces tab data
        "unclustered": {
            "previews": [preview_to_dict(p) for p in unclustered_result["previews"]],
            "stats": unclustered_result["stats"],
        },
        
        # Merge Clusters tab data
        "merge": {
            "candidates": [asdict(m) for m in merge_result.merge_candidates],
            "summary": merge_result.summary,
        },
        
        # Fix Issues tab data
        "validation": {
            "issues": [asdict(i) for i in validation_result.issues],
            "summary": validation_result.summary,
            "total_clusters_checked": validation_result.total_clusters_checked,
            "clusters_with_issues": validation_result.clusters_with_issues,
            "clusters_ok": validation_result.clusters_ok,
        },
        
        # Combined stats
        "stats": {
            # Raw analytics stats
            "total_raw_matches": analytics["stats"]["total_raw_matches"],
            "common_photos": analytics["stats"]["common_photos"],
            "ms_people_count": analytics["stats"]["ms_people_count"],
            "ms_unique_people_count": analytics["stats"]["ms_unique_people_count"],
            "immich_clusters_count": analytics["stats"]["immich_clusters_count"],
            "immich_unique_people_count": analytics["stats"]["immich_unique_people_count"],
            
            # Match stats
            "total_matches": matches_result["stats"]["total_matches"],
            "applicable_matches": matches_result["stats"]["applicable_matches"],
            "high_confidence": matches_result["stats"].get("high_confidence", 0),
            "medium_confidence": matches_result["stats"].get("medium_confidence", 0),
            "low_confidence": matches_result["stats"].get("low_confidence", 0),
            
            # Unclustered stats
            "total_unclustered_faces": unclustered_result["stats"].get("total_faces_to_assign", 0),
            "people_with_unclustered_matches": unclustered_result["stats"].get("total_ms_people_with_matches", 0),
            
            # Merge stats
            "people_with_split_clusters": merge_result.summary.get("people_with_split_clusters", 0),
            "total_clusters_to_merge": merge_result.summary.get("total_clusters_to_merge", 0),
            
            # Validation stats
            "clusters_with_issues": validation_result.clusters_with_issues,
            "validation_errors": validation_result.summary.get("errors", 0),
            "validation_warnings": validation_result.summary.get("warnings", 0),
        },
        
        # Thresholds used
        "thresholds": {
            "min_iou": min_iou,
            "max_center_dist": max_center_dist,
        }
    }

"""
Cluster validation service.

Detects potential clustering errors by finding Immich clusters 
that contain faces matching different people in MS Photos.
"""

from collections import defaultdict
from dataclasses import dataclass, field
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
class ClusterIssue:
    """A potential clustering issue in Immich."""
    immich_cluster_id: str
    immich_cluster_name: Optional[str]
    total_faces_in_cluster: int
    matched_faces: int  # Faces that could be matched to MS Photos
    ms_people_matched: list[dict]  # List of {person_id, person_name, face_count}
    severity: str  # "error" (multiple people), "warning" (some unmatched), "ok"
    sample_photos: list[str] = field(default_factory=list)


@dataclass
class ValidationResult:
    """Result of cluster validation."""
    total_clusters_checked: int
    clusters_with_issues: int
    clusters_ok: int
    issues: list[ClusterIssue]
    summary: dict


def validate_clusters(min_iou: float = 0.3, max_center_dist: float = 0.4, min_faces: int = 3) -> ValidationResult:
    """
    Validate Immich clusters by checking if faces match different people in MS Photos.
    
    For each Immich cluster:
    1. Get all faces in the cluster
    2. For each face, find matching face in MS Photos (by filename + position)
    3. Collect the MS Photos person IDs
    4. If multiple different people → flag as error
    
    Args:
        min_iou: Minimum IoU to consider faces as matching
        min_faces: Minimum faces in cluster to analyze
    
    Returns:
        ValidationResult with issues found
    """
    # Load MS Photos faces indexed by (filename, face_position)
    with get_ms_photos_connection() as ms_conn:
        ms_cursor = ms_conn.cursor()
        
        ms_cursor.execute("""
            SELECT 
                i.Item_FileName,
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
        
        # Build: filename -> list of (person_id, person_name, rect)
        ms_faces_by_photo = defaultdict(list)
        for row in ms_cursor.fetchall():
            filename, person_id, person_name, top, left, width, height = row
            key = filename.lower()
            rect = ms_rect_to_normalized(top, left, width, height)
            ms_faces_by_photo[key].append((person_id, person_name, rect))
    
    # Load Immich faces grouped by cluster
    with get_immich_connection() as immich_conn:
        immich_cursor = immich_conn.cursor()
        
        # Get all clusters with their face counts
        immich_cursor.execute("""
            SELECT 
                p.id,
                p.name,
                COUNT(af.id) as face_count
            FROM person p
            LEFT JOIN asset_face af ON p.id = af."personId" AND af."deletedAt" IS NULL
            WHERE p."isHidden" = false
            GROUP BY p.id, p.name
            HAVING COUNT(af.id) >= %s
            ORDER BY face_count DESC
        """, (min_faces,))
        
        clusters = [(str(row[0]), row[1], row[2]) for row in immich_cursor.fetchall()]
        
        # For each cluster, get all its faces
        issues = []
        clusters_ok = 0
        
        for cluster_id, cluster_name, face_count in clusters:
            immich_cursor.execute("""
                SELECT 
                    a."originalFileName",
                    af."boundingBoxX1",
                    af."boundingBoxY1",
                    af."boundingBoxX2",
                    af."boundingBoxY2",
                    af."imageWidth",
                    af."imageHeight"
                FROM asset_face af
                JOIN asset a ON af."assetId" = a.id
                WHERE af."personId" = %s
                  AND af."deletedAt" IS NULL
                  AND a."deletedAt" IS NULL
                  AND af."boundingBoxX1" IS NOT NULL
            """, (cluster_id,))
            
            cluster_faces = immich_cursor.fetchall()
            
            # Match each face to MS Photos
            ms_people_found = defaultdict(list)  # person_id -> [(person_name, filename), ...]
            matched_faces = 0
            sample_photos = []
            
            for row in cluster_faces:
                filename, x1, y1, x2, y2, img_w, img_h = row
                if not filename:
                    continue
                
                key = filename.lower()
                immich_rect = immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h)
                if not immich_rect:
                    continue
                
                # Find matching MS Photos face
                if key in ms_faces_by_photo:
                    for ms_person_id, ms_person_name, ms_rect in ms_faces_by_photo[key]:
                        iou = calculate_iou(ms_rect, immich_rect)
                        center_dist = calculate_center_distance(ms_rect, immich_rect)
                        if iou >= min_iou and center_dist <= max_center_dist:
                            ms_people_found[ms_person_id].append((ms_person_name, filename))
                            matched_faces += 1
                            if len(sample_photos) < 5:
                                sample_photos.append(filename)
                            break  # Only count one match per face
            
            # Analyze results
            unique_people = len(ms_people_found)
            
            if unique_people > 1:
                # Multiple different people - this is a clustering error!
                severity = "error"
            elif unique_people == 1 and matched_faces < face_count * 0.5:
                # Only matched some faces - might be ok, might be mixed with unknowns
                severity = "warning"
            elif unique_people == 0 and face_count >= min_faces:
                # No matches - person not in MS Photos (not an error)
                clusters_ok += 1
                continue
            else:
                clusters_ok += 1
                continue
            
            # Build people list
            people_list = []
            for pid, matches in ms_people_found.items():
                people_list.append({
                    "person_id": pid,
                    "person_name": matches[0][0],  # Name from first match
                    "face_count": len(matches),
                })
            people_list.sort(key=lambda x: x["face_count"], reverse=True)
            
            issues.append(ClusterIssue(
                immich_cluster_id=cluster_id,
                immich_cluster_name=cluster_name,
                total_faces_in_cluster=face_count,
                matched_faces=matched_faces,
                ms_people_matched=people_list,
                severity=severity,
                sample_photos=sample_photos,
            ))
    
    # Sort issues: errors first, then by number of different people
    issues.sort(key=lambda x: (0 if x.severity == "error" else 1, -len(x.ms_people_matched)))
    
    return ValidationResult(
        total_clusters_checked=len(clusters),
        clusters_with_issues=len(issues),
        clusters_ok=clusters_ok,
        issues=issues,
        summary={
            "errors": sum(1 for i in issues if i.severity == "error"),
            "warnings": sum(1 for i in issues if i.severity == "warning"),
            "total_checked": len(clusters),
        }
    )


@dataclass
class MergeCandidate:
    """A set of Immich clusters that could be merged (same person in MS Photos)."""
    ms_person_id: int
    ms_person_name: str
    total_ms_faces: int
    immich_clusters: list[dict]  # List of {cluster_id, cluster_name, matched_faces, total_faces}
    confidence: float  # Based on how many faces matched


@dataclass
class MergeAnalysisResult:
    """Result of cluster merge analysis."""
    total_ms_people_analyzed: int
    merge_candidates: list[MergeCandidate]
    potential_faces_to_merge: int
    summary: dict


def find_mergeable_clusters(min_iou: float = 0.3, max_center_dist: float = 0.4, min_matches: int = 2) -> MergeAnalysisResult:
    """
    Find Immich clusters that could be merged because they represent the same person.
    
    This works by:
    1. For each MS Photos person, find all Immich clusters with matching faces
    2. If multiple Immich clusters match the same MS Photos person, they could be merged
    
    Args:
        min_iou: Minimum IoU to consider faces as matching
        max_center_dist: Maximum normalized center distance
        min_matches: Minimum matched faces to consider a cluster as representing the person
    
    Returns:
        MergeAnalysisResult with merge candidates
    """
    # Load all MS Photos faces with person info
    with get_ms_photos_connection() as ms_conn:
        ms_cursor = ms_conn.cursor()
        
        ms_cursor.execute("""
            SELECT 
                i.Item_FileName,
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
        
        # Build: filename -> list of (person_id, person_name, rect)
        ms_faces_by_photo = defaultdict(list)
        ms_person_face_counts = defaultdict(lambda: {"name": "", "count": 0})
        
        for row in ms_cursor.fetchall():
            filename, person_id, person_name, top, left, width, height = row
            key = filename.lower()
            rect = ms_rect_to_normalized(top, left, width, height)
            ms_faces_by_photo[key].append((person_id, person_name, rect))
            ms_person_face_counts[person_id]["name"] = person_name
            ms_person_face_counts[person_id]["count"] += 1
    
    # Load all Immich faces with their cluster info
    with get_immich_connection() as immich_conn:
        immich_cursor = immich_conn.cursor()
        
        immich_cursor.execute("""
            SELECT 
                af."personId",
                p.name as person_name,
                a."originalFileName",
                af."boundingBoxX1",
                af."boundingBoxY1",
                af."boundingBoxX2",
                af."boundingBoxY2",
                af."imageWidth",
                af."imageHeight"
            FROM asset_face af
            JOIN person p ON af."personId" = p.id
            JOIN asset a ON af."assetId" = a.id
            WHERE af."deletedAt" IS NULL
              AND a."deletedAt" IS NULL
              AND p."isHidden" = false
              AND af."boundingBoxX1" IS NOT NULL
        """)
        
        # Track: ms_person_id -> {immich_cluster_id -> match_count}
        ms_to_immich_mapping = defaultdict(lambda: defaultdict(int))
        immich_cluster_info = {}  # cluster_id -> {name, total_faces}
        
        for row in immich_cursor.fetchall():
            cluster_id, cluster_name, filename, x1, y1, x2, y2, img_w, img_h = row
            cluster_id = str(cluster_id)
            
            if cluster_id not in immich_cluster_info:
                immich_cluster_info[cluster_id] = {"name": cluster_name, "total_faces": 0}
            immich_cluster_info[cluster_id]["total_faces"] += 1
            
            if not filename:
                continue
            
            key = filename.lower()
            immich_rect = immich_rect_to_normalized(x1, y1, x2, y2, img_w, img_h)
            if not immich_rect:
                continue
            
            # Match to MS Photos faces
            if key in ms_faces_by_photo:
                for ms_person_id, ms_person_name, ms_rect in ms_faces_by_photo[key]:
                    iou = calculate_iou(ms_rect, immich_rect)
                    center_dist = calculate_center_distance(ms_rect, immich_rect)
                    if iou >= min_iou and center_dist <= max_center_dist:
                        ms_to_immich_mapping[ms_person_id][cluster_id] += 1
                        break
    
    # Find merge candidates (MS people who map to multiple Immich clusters)
    merge_candidates = []
    total_mergeable_faces = 0
    
    for ms_person_id, immich_clusters in ms_to_immich_mapping.items():
        # Filter clusters with sufficient matches
        valid_clusters = {cid: count for cid, count in immich_clusters.items() 
                         if count >= min_matches}
        
        if len(valid_clusters) > 1:
            # This person is split across multiple Immich clusters!
            person_info = ms_person_face_counts[ms_person_id]
            
            cluster_list = []
            for cid, match_count in valid_clusters.items():
                info = immich_cluster_info.get(cid, {"name": None, "total_faces": 0})
                cluster_list.append({
                    "cluster_id": cid,
                    "cluster_name": info["name"],
                    "matched_faces": match_count,
                    "total_faces": info["total_faces"],
                })
                total_mergeable_faces += info["total_faces"]
            
            # Sort by matched faces descending
            cluster_list.sort(key=lambda x: x["matched_faces"], reverse=True)
            
            # Calculate confidence (what % of total faces were matched)
            total_matches = sum(c["matched_faces"] for c in cluster_list)
            confidence = total_matches / person_info["count"] if person_info["count"] > 0 else 0
            
            merge_candidates.append(MergeCandidate(
                ms_person_id=ms_person_id,
                ms_person_name=person_info["name"],
                total_ms_faces=person_info["count"],
                immich_clusters=cluster_list,
                confidence=min(confidence, 1.0),
            ))
    
    # Sort by number of clusters (most fragmented first), then by confidence
    merge_candidates.sort(key=lambda x: (-len(x.immich_clusters), -x.confidence))
    
    return MergeAnalysisResult(
        total_ms_people_analyzed=len(ms_person_face_counts),
        merge_candidates=merge_candidates,
        potential_faces_to_merge=total_mergeable_faces,
        summary={
            "people_with_split_clusters": len(merge_candidates),
            "total_clusters_to_merge": sum(len(m.immich_clusters) for m in merge_candidates),
            "potential_faces_affected": total_mergeable_faces,
        }
    )

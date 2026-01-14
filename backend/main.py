"""
Face Label Migration Tool - Web API

FastAPI backend for the migration tool web interface.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import asyncio
from dataclasses import asdict

from config import (
    get_settings,
    get_current_config,
    update_ms_photos_db,
    update_immich_api,
    update_immich_db,
)
from database import test_ms_photos_connection, test_immich_connection
from immich_client import get_immich_client
from services.matching import find_face_position_matches, find_definitive_matches, find_unmatched_people, get_match_analytics, run_full_analysis, PersonMatch, UnmatchedPerson
from services.cluster_validation import validate_clusters, find_mergeable_clusters, ClusterIssue
from services.thumbnails import get_ms_person_thumbnail
from services.match_details import get_detailed_face_matches, PhotoFaceMatch
from services.apply_labels import find_unclustered_matches, preview_to_dict, get_unclustered_face_details, UnclusteredFaceDetail
from services.create_faces import (
    find_unrecognized_faces, 
    preview_to_dict as unrecognized_preview_to_dict, 
    get_unrecognized_face_details,
    UnrecognizedFaceDetail
)

app = FastAPI(
    title="Face Label Migration Tool",
    description="Migrate face labels from Windows Photos Legacy to Immich",
    version="1.0.0",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.get("/api/health")
async def health_check():
    """Check API health."""
    return {"status": "ok", "service": "face-migration-tool"}


@app.get("/api/status")
async def get_status():
    """Get connection status for all data sources."""
    ms_status = test_ms_photos_connection()
    immich_db_status = test_immich_connection()
    
    client = get_immich_client()
    immich_api_status = await client.test_connection()
    
    return {
        "ms_photos": ms_status,
        "immich_db": immich_db_status,
        "immich_api": immich_api_status,
    }


@app.get("/api/stats")
async def get_stats():
    """Get detailed statistics from both databases."""
    ms_stats = test_ms_photos_connection()
    immich_stats = test_immich_connection()

    return {
        "ms_photos": ms_stats if ms_stats.get("connected") else None,
        "immich": immich_stats if immich_stats.get("connected") else None,
    }


# ============================================================================
# Configuration Endpoints
# ============================================================================

@app.get("/api/config")
async def get_config():
    """Get current configuration (with sensitive values masked)."""
    return get_current_config()


class MSPhotosDbConfig(BaseModel):
    path: str


@app.post("/api/config/ms-photos-db")
async def update_ms_photos_db_config(config: MSPhotosDbConfig):
    """Update MS Photos database path at runtime."""
    update_ms_photos_db(config.path)
    # Test the new connection
    status = test_ms_photos_connection()
    return {
        "success": status.get("connected", False),
        "status": status,
        "config": get_current_config(),
    }


class ImmichApiConfig(BaseModel):
    url: Optional[str] = None
    api_key: Optional[str] = None


@app.post("/api/config/immich-api")
async def update_immich_api_config(config: ImmichApiConfig):
    """Update Immich API settings at runtime."""
    update_immich_api(url=config.url, api_key=config.api_key)
    # Test the new connection
    client = get_immich_client()
    status = await client.test_connection()
    return {
        "success": status.get("connected", False),
        "status": status,
        "config": get_current_config(),
    }


class ImmichDbConfig(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    name: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None


@app.post("/api/config/immich-db")
async def update_immich_db_config(config: ImmichDbConfig):
    """Update Immich database settings at runtime."""
    update_immich_db(
        host=config.host,
        port=config.port,
        name=config.name,
        user=config.user,
        password=config.password,
    )
    # Test the new connection
    status = test_immich_connection()
    return {
        "success": status.get("connected", False),
        "status": status,
        "config": get_current_config(),
    }


# ============================================================================
# Matching Endpoints
# ============================================================================

class MatchingParams(BaseModel):
    algorithm: str = "face_position"  # "face_position" or "definitive"
    min_iou: float = 0.3
    max_center_dist: float = 0.4  # Max normalized center distance (0.4 = 40% of diagonal)
    min_evidence: int = 1


@app.post("/api/matches/run")
async def run_matching(params: MatchingParams):
    """Run the matching algorithm."""
    try:
        if params.algorithm == "face_position":
            result = find_face_position_matches(min_iou=params.min_iou, max_center_dist=params.max_center_dist)
        else:
            result = find_definitive_matches(min_evidence=params.min_evidence)
        
        # Convert dataclass instances to dicts
        return {
            "all_matches": [asdict(m) for m in result["all_matches"]],
            "applicable": [asdict(m) for m in result["applicable"]],
            "stats": result["stats"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/matches/preview")
async def preview_matches():
    """Get a quick preview of matches without full computation."""
    try:
        # Run with face position matching (fastest for preview)
        result = find_face_position_matches(min_iou=0.3, max_center_dist=0.4)
        
        return {
            "total_matches": len(result["all_matches"]),
            "applicable_matches": len(result["applicable"]),
            "top_matches": [asdict(m) for m in result["applicable"][:10]],
            "stats": result["stats"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/matches/details/{ms_person_id}/{immich_cluster_id}")
async def get_match_details(ms_person_id: int, immich_cluster_id: str, min_iou: float = 0.3, max_center_dist: float = 0.4):
    """
    Get detailed face match data for a specific MS person + Immich cluster pair.
    
    Returns individual photo-level matches with face rect coordinates for
    drawing overlays and debugging.
    """
    try:
        matches = get_detailed_face_matches(ms_person_id, immich_cluster_id, min_iou, max_center_dist)
        
        return {
            "ms_person_id": ms_person_id,
            "immich_cluster_id": immich_cluster_id,
            "total_matches": len(matches),
            "matches": [asdict(m) for m in matches],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/matches/unmatched")
async def get_unmatched_people(min_iou: float = 0.3, max_center_dist: float = 0.4):
    """
    Get MS Photos people who have no matching Immich cluster.
    
    Returns people sorted by face count (most faces first), with sample
    file paths where they appear.
    """
    try:
        result = find_unmatched_people(min_iou=min_iou, max_center_dist=max_center_dist)
        
        return {
            "unmatched": [asdict(p) for p in result["unmatched"]],
            "stats": result["stats"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/matches/analytics")
async def get_analytics():
    """
    Get raw matching analytics data for visualization.
    
    Returns all potential matches (IoU > 0) with their scores,
    plus histograms and suggested optimal thresholds.
    """
    try:
        result = get_match_analytics()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FullAnalysisParams(BaseModel):
    min_iou: float = 0.3
    max_center_dist: float = 0.4


@app.post("/api/algorithm/run")
async def run_algorithm(params: FullAnalysisParams):
    """
    Run the complete matching analysis in one call.
    
    This is the main entry point for the UI - it computes everything
    needed for all tabs in a single call to avoid redundant database queries.
    
    Returns analytics, matches, validation issues, merge candidates, and
    unclustered face previews all at once.
    """
    try:
        result = run_full_analysis(
            min_iou=params.min_iou,
            max_center_dist=params.max_center_dist
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/photos/immich/{asset_id}")
async def get_immich_photo(asset_id: str, size: str = "preview"):
    """
    Proxy an Immich photo for display.
    
    Args:
        asset_id: The Immich asset ID
        size: "preview" (smaller), "thumbnail" (small), or "fullsize"
    """
    client = get_immich_client()
    
    try:
        photo_bytes = await client.get_asset_thumbnail(asset_id, size)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch photo: {str(e)}")
    
    if photo_bytes:
        return Response(content=photo_bytes, media_type="image/jpeg")
    
    raise HTTPException(status_code=404, detail="Photo not found")


# ============================================================================
# Cluster Validation Endpoints
# ============================================================================

class ValidationParams(BaseModel):
    min_iou: float = 0.3
    max_center_dist: float = 0.4
    min_faces: int = 3


@app.post("/api/validation/run")
async def run_validation(params: ValidationParams):
    """Run cluster validation to find potential errors."""
    try:
        result = validate_clusters(min_iou=params.min_iou, max_center_dist=params.max_center_dist, min_faces=params.min_faces)
        
        return {
            "total_clusters_checked": result.total_clusters_checked,
            "clusters_with_issues": result.clusters_with_issues,
            "clusters_ok": result.clusters_ok,
            "issues": [asdict(i) for i in result.issues],
            "summary": result.summary,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MergeAnalysisParams(BaseModel):
    min_iou: float = 0.3
    max_center_dist: float = 0.4
    min_matches: int = 2


@app.post("/api/validation/merge-analysis")
async def run_merge_analysis(params: MergeAnalysisParams):
    """Find Immich clusters that could be merged (same person split across clusters)."""
    try:
        result = find_mergeable_clusters(min_iou=params.min_iou, max_center_dist=params.max_center_dist, min_matches=params.min_matches)
        
        return {
            "total_ms_people_analyzed": result.total_ms_people_analyzed,
            "potential_faces_to_merge": result.potential_faces_to_merge,
            "merge_candidates": [asdict(m) for m in result.merge_candidates],
            "summary": result.summary,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Thumbnail Endpoints
# ============================================================================

@app.get("/api/thumbnails/ms/{person_id}")
async def get_ms_thumbnail(person_id: int):
    """Get MS Photos person thumbnail (base64)."""
    thumb = get_ms_person_thumbnail(person_id)
    if thumb:
        return {"thumbnail": thumb}
    raise HTTPException(status_code=404, detail="Thumbnail not found")


@app.get("/api/thumbnails/immich/{person_id}")
async def get_immich_thumbnail(person_id: str):
    """Get Immich cluster thumbnail."""
    client = get_immich_client()
    thumb_bytes = await client.get_person_thumbnail(person_id)
    
    if thumb_bytes:
        return Response(content=thumb_bytes, media_type="image/jpeg")
    
    raise HTTPException(status_code=404, detail="Thumbnail not found")


# ============================================================================
# Apply Matches Endpoints
# ============================================================================

class ApplyMatch(BaseModel):
    ms_person_id: int
    ms_person_name: str
    immich_cluster_id: str


class ApplyParams(BaseModel):
    matches: list[ApplyMatch]
    dry_run: bool = True


@app.post("/api/apply")
async def apply_matches(params: ApplyParams):
    """Apply approved matches to Immich."""
    client = get_immich_client()
    
    results = {
        "success": [],
        "failed": [],
        "skipped": [],
    }
    
    for match in params.matches:
        if params.dry_run:
            results["success"].append({
                "person_id": match.immich_cluster_id,
                "name": match.ms_person_name,
                "status": "would_apply",
            })
        else:
            result = await client.update_person_name(
                match.immich_cluster_id, 
                match.ms_person_name
            )
            
            if result["success"]:
                results["success"].append({
                    "person_id": match.immich_cluster_id,
                    "name": match.ms_person_name,
                    "status": "applied",
                })
            else:
                results["failed"].append({
                    "person_id": match.immich_cluster_id,
                    "name": match.ms_person_name,
                    "error": result.get("error", "Unknown error"),
                })
    
    return {
        "dry_run": params.dry_run,
        "total": len(params.matches),
        "success_count": len(results["success"]),
        "failed_count": len(results["failed"]),
        "results": results,
    }


# ============================================================================
# Apply Unclustered Faces Endpoints
# ============================================================================

class UnclusteredMatchParams(BaseModel):
    min_iou: float = 0.3
    max_center_dist: float = 0.4


@app.post("/api/apply/unclustered/preview")
async def preview_unclustered_matches(params: UnclusteredMatchParams):
    """
    Preview unclustered Immich faces that match MS Photos faces.
    
    Returns a list of MS Photos people with their matchable unclustered faces,
    showing what would be applied.
    """
    try:
        result = find_unclustered_matches(
            min_iou=params.min_iou, 
            max_center_dist=params.max_center_dist
        )
        
        return {
            "previews": [preview_to_dict(p) for p in result["previews"]],
            "stats": result["stats"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/apply/unclustered/details/{ms_person_id}")
async def get_unclustered_details(ms_person_id: int, min_iou: float = 0.3, max_center_dist: float = 0.4):
    """
    Get detailed face match data for unclustered faces matching an MS Photos person.
    
    Returns rectangle coordinates and match quality for photo viewer display.
    """
    try:
        result = get_unclustered_face_details(
            ms_person_id=ms_person_id,
            min_iou=min_iou,
            max_center_dist=max_center_dist
        )
        
        return {
            "ms_person_id": result["ms_person_id"],
            "ms_person_name": result["ms_person_name"],
            "total_matches": result["total_matches"],
            "matches": [asdict(m) for m in result["matches"]],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ApplyUnclusteredItem(BaseModel):
    ms_person_id: int
    ms_person_name: str
    face_ids: list[str]  # List of Immich face IDs to assign


class ApplyUnclusteredParams(BaseModel):
    items: list[ApplyUnclusteredItem]
    dry_run: bool = True


@app.post("/api/apply/unclustered")
async def apply_unclustered_faces(params: ApplyUnclusteredParams):
    """
    Apply unclustered face assignments.
    
    For each MS Photos person:
    1. Create person in Immich if doesn't exist (with that name)
    2. Assign the specified faces to that person
    """
    client = get_immich_client()
    
    results = {
        "people_created": [],
        "faces_assigned": [],
        "failed": [],
    }
    
    for item in params.items:
        person_id = None
        
        # Step 1: Find or create person
        if params.dry_run:
            # In dry run, just pretend we'd create/find the person
            existing = await client.find_person_by_name(item.ms_person_name)
            if existing:
                results["people_created"].append({
                    "name": item.ms_person_name,
                    "status": "already_exists",
                    "person_id": existing,
                })
                person_id = existing
            else:
                results["people_created"].append({
                    "name": item.ms_person_name,
                    "status": "would_create",
                    "person_id": None,
                })
        else:
            # Actually find or create the person
            existing = await client.find_person_by_name(item.ms_person_name)
            if existing:
                person_id = existing
                results["people_created"].append({
                    "name": item.ms_person_name,
                    "status": "already_exists",
                    "person_id": person_id,
                })
            else:
                create_result = await client.create_person(item.ms_person_name)
                if create_result["success"]:
                    person_id = create_result["person_id"]
                    results["people_created"].append({
                        "name": item.ms_person_name,
                        "status": "created",
                        "person_id": person_id,
                    })
                else:
                    results["failed"].append({
                        "name": item.ms_person_name,
                        "error": f"Failed to create person: {create_result.get('error')}",
                    })
                    continue  # Skip face assignment if person creation failed
        
        # Step 2: Assign faces to person
        for face_id in item.face_ids:
            if params.dry_run:
                results["faces_assigned"].append({
                    "face_id": face_id,
                    "person_name": item.ms_person_name,
                    "status": "would_assign",
                })
            else:
                if not person_id:
                    results["failed"].append({
                        "face_id": face_id,
                        "error": "No person ID available",
                    })
                    continue
                    
                assign_result = await client.reassign_face(face_id, person_id)
                if assign_result["success"]:
                    results["faces_assigned"].append({
                        "face_id": face_id,
                        "person_name": item.ms_person_name,
                        "person_id": person_id,
                        "status": "assigned",
                    })
                else:
                    results["failed"].append({
                        "face_id": face_id,
                        "person_name": item.ms_person_name,
                        "error": assign_result.get("error"),
                    })
    
    return {
        "dry_run": params.dry_run,
        "total_items": len(params.items),
        "total_faces": sum(len(item.face_ids) for item in params.items),
        "people_created_count": len([r for r in results["people_created"] if r["status"] in ("created", "would_create")]),
        "faces_assigned_count": len([r for r in results["faces_assigned"] if r["status"] in ("assigned", "would_assign")]),
        "failed_count": len(results["failed"]),
        "results": results,
    }


# ============================================================================
# Create Faces Endpoints (for unrecognized faces)
# ============================================================================

class UnrecognizedFacesParams(BaseModel):
    min_iou: float = 0.3  # Threshold for determining if a face "already exists"


@app.post("/api/create-faces/preview")
async def preview_unrecognized_faces(params: UnrecognizedFacesParams):
    """
    Preview MS Photos faces that Immich hasn't detected at all.
    
    Returns a list of MS Photos people with faces that need to be created
    in Immich from scratch (not just assigned).
    """
    try:
        result = find_unrecognized_faces(min_iou=params.min_iou)
        
        return {
            "previews": [unrecognized_preview_to_dict(p) for p in result["previews"]],
            "stats": result["stats"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/create-faces/details/{ms_person_id}")
async def get_unrecognized_details(ms_person_id: int, min_iou: float = 0.3):
    """
    Get detailed face data for unrecognized faces for an MS Photos person.
    
    Returns rectangle coordinates for photo viewer display.
    """
    try:
        result = get_unrecognized_face_details(
            ms_person_id=ms_person_id,
            min_iou=min_iou
        )
        
        return {
            "ms_person_id": result["ms_person_id"],
            "ms_person_name": result["ms_person_name"],
            "total_faces": result["total_faces"],
            "faces": [asdict(f) for f in result["faces"]],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CreateFaceItem(BaseModel):
    """Data for creating a single face in Immich."""
    asset_id: str
    x: int  # Bounding box X (pixels)
    y: int  # Bounding box Y (pixels)
    width: int  # Bounding box width (pixels)
    height: int  # Bounding box height (pixels)
    image_width: int
    image_height: int


class CreateFacesRequest(BaseModel):
    ms_person_id: int
    ms_person_name: str
    faces: list[CreateFaceItem]
    dry_run: bool = True


@app.post("/api/create-faces/apply")
async def apply_create_faces(params: CreateFacesRequest):
    """
    Create faces in Immich for unrecognized MS Photos faces.
    
    For each face:
    1. Create/find person in Immich with the MS Photos name
    2. Call Immich's create face API with the bounding box from MS Photos
    """
    client = get_immich_client()
    
    results = {
        "person_created": None,
        "faces_created": [],
        "failed": [],
    }
    
    person_id = None
    
    # Step 1: Find or create person
    existing = await client.find_person_by_name(params.ms_person_name)
    
    if params.dry_run:
        if existing:
            results["person_created"] = {
                "name": params.ms_person_name,
                "status": "already_exists",
                "person_id": existing,
            }
            person_id = existing
        else:
            results["person_created"] = {
                "name": params.ms_person_name,
                "status": "would_create",
                "person_id": None,
            }
    else:
        if existing:
            person_id = existing
            results["person_created"] = {
                "name": params.ms_person_name,
                "status": "already_exists",
                "person_id": person_id,
            }
        else:
            create_result = await client.create_person(params.ms_person_name)
            if create_result["success"]:
                person_id = create_result["person_id"]
                results["person_created"] = {
                    "name": params.ms_person_name,
                    "status": "created",
                    "person_id": person_id,
                }
            else:
                return {
                    "dry_run": params.dry_run,
                    "success": False,
                    "error": f"Failed to create person: {create_result.get('error')}",
                    "results": results,
                }
    
    # Step 2: Create each face
    for face in params.faces:
        if params.dry_run:
            results["faces_created"].append({
                "asset_id": face.asset_id,
                "status": "would_create",
            })
        else:
            if not person_id:
                results["failed"].append({
                    "asset_id": face.asset_id,
                    "error": "No person ID available",
                })
                continue
            
            create_result = await client.create_face(
                asset_id=face.asset_id,
                person_id=person_id,
                x=face.x,
                y=face.y,
                width=face.width,
                height=face.height,
                image_width=face.image_width,
                image_height=face.image_height,
            )
            
            if create_result["success"]:
                results["faces_created"].append({
                    "asset_id": face.asset_id,
                    "status": "created",
                })
            else:
                results["failed"].append({
                    "asset_id": face.asset_id,
                    "error": create_result.get("error"),
                })
    
    return {
        "dry_run": params.dry_run,
        "success": len(results["failed"]) == 0,
        "total_faces": len(params.faces),
        "faces_created_count": len(results["faces_created"]),
        "failed_count": len(results["failed"]),
        "results": results,
    }


# ============================================================================
# Diagnostics Endpoints
# ============================================================================

@app.get("/api/diagnostics/missing-people")
async def get_missing_people():
    """
    Find MS Photos people whose names don't exist in Immich yet.
    
    Returns diagnostic information to understand why they weren't transferred
    through Transfer Names, Assign Faces, or Create Faces.
    """
    from services.diagnostics import find_missing_people
    
    try:
        result = find_missing_people()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/diagnostics/orphan-people")
async def get_orphan_people():
    """
    Find MS Photos people who have names but NO face data.
    
    These are people whose Person_ItemCount > 0 (indicating they once had faces)
    but have 0 records in the Face table (data was deleted).
    """
    from database import get_ms_photos_connection
    
    try:
        with get_ms_photos_connection() as conn:
            cursor = conn.cursor()
            
            # Find named people with no face records
            cursor.execute("""
                SELECT 
                    p.Person_Id,
                    p.Person_Name,
                    p.Person_ItemCount,
                    (SELECT COUNT(*) FROM Face f WHERE f.Face_PersonId = p.Person_Id) as actual_faces,
                    (SELECT COUNT(*) FROM FaceCluster fc WHERE fc.FaceCluster_PersonId = p.Person_Id) as has_cluster
                FROM Person p
                WHERE p.Person_Name IS NOT NULL 
                  AND p.Person_Name != '' 
                  AND TRIM(p.Person_Name) != ''
                ORDER BY p.Person_ItemCount DESC
            """)
            
            orphans = []
            with_faces = []
            
            for row in cursor.fetchall():
                person_id, name, item_count, actual_faces, has_cluster = row
                
                if actual_faces == 0:
                    orphans.append({
                        "ms_person_id": person_id,
                        "ms_person_name": name,
                        "historical_item_count": item_count or 0,
                        "current_face_count": 0,
                        "has_cluster": has_cluster > 0,
                    })
                else:
                    with_faces.append({
                        "ms_person_id": person_id,
                        "ms_person_name": name,
                        "item_count": item_count or 0,
                        "face_count": actual_faces,
                    })
            
            return {
                "orphan_people": orphans,
                "people_with_faces": len(with_faces),
                "total_named_people": len(orphans) + len(with_faces),
                "stats": {
                    "orphan_count": len(orphans),
                    "with_faces_count": len(with_faces),
                    "total_historical_items_lost": sum(o["historical_item_count"] for o in orphans),
                }
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

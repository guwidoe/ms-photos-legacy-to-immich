"""
Immich API client for thumbnails and person updates.
"""

import httpx
from typing import Optional
from config import get_effective_immich_api_url, get_effective_immich_api_key


class ImmichClient:
    """Client for Immich REST API."""

    @property
    def base_url(self) -> str:
        """Get the current Immich API URL (dynamically from config)."""
        return get_effective_immich_api_url().rstrip('/')

    @property
    def api_key(self) -> str:
        """Get the current Immich API key (dynamically from config)."""
        return get_effective_immich_api_key()

    def _get_headers(self) -> dict:
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }
    
    async def test_connection(self) -> dict:
        """Test API connection."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/api/server/ping",
                    headers=self._get_headers()
                )
                if response.status_code == 200:
                    return {"connected": True}
                return {"connected": False, "error": f"Status {response.status_code}"}
        except Exception as e:
            return {"connected": False, "error": str(e)}
    
    async def get_person_thumbnail(self, person_id: str) -> Optional[bytes]:
        """Get face thumbnail for a person/cluster."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(
                    f"{self.base_url}/api/people/{person_id}/thumbnail",
                    headers=self._get_headers()
                )
                if response.status_code == 200:
                    return response.content
        except Exception:
            pass
        return None
    
    async def get_asset_thumbnail(self, asset_id: str, size: str = "preview") -> Optional[bytes]:
        """
        Get asset thumbnail/preview.
        
        Args:
            asset_id: The asset ID
            size: "preview" (medium size), "thumbnail" (small), or "fullsize"
        """
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                # Use the /assets/{id}/thumbnail endpoint with size as query param
                response = await client.get(
                    f"{self.base_url}/api/assets/{asset_id}/thumbnail",
                    params={"size": size},
                    headers=self._get_headers(),
                    follow_redirects=True
                )
                if response.status_code == 200:
                    return response.content
        except Exception as e:
            print(f"Error fetching asset thumbnail: {e}")
        return None
    
    async def get_all_people(self) -> list:
        """Get all people from Immich."""
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(
                    f"{self.base_url}/api/people",
                    headers=self._get_headers()
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("people", [])
        except Exception:
            pass
        return []
    
    async def update_person_name(self, person_id: str, name: str) -> dict:
        """Update a person's name."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.put(
                    f"{self.base_url}/api/people/{person_id}",
                    headers=self._get_headers(),
                    json={"name": name}
                )
                if response.status_code == 200:
                    return {"success": True, "person_id": person_id, "name": name}
                return {
                    "success": False, 
                    "error": f"Status {response.status_code}: {response.text[:100]}"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def create_person(self, name: str) -> dict:
        """Create a new person in Immich."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.base_url}/api/people",
                    headers=self._get_headers(),
                    json={"name": name}
                )
                if response.status_code == 201:
                    data = response.json()
                    return {"success": True, "person_id": data.get("id"), "name": name}
                return {
                    "success": False,
                    "error": f"Status {response.status_code}: {response.text[:200]}"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def reassign_face(self, face_id: str, person_id: str) -> dict:
        """Reassign a face to a different person."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.put(
                    f"{self.base_url}/api/faces/{person_id}",
                    headers=self._get_headers(),
                    json={"id": face_id}
                )
                if response.status_code == 200:
                    return {"success": True, "face_id": face_id, "person_id": person_id}
                return {
                    "success": False,
                    "error": f"Status {response.status_code}: {response.text[:200]}"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_faces_for_asset(self, asset_id: str) -> list:
        """Get all faces detected on an asset."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(
                    f"{self.base_url}/api/faces",
                    params={"id": asset_id},
                    headers=self._get_headers()
                )
                if response.status_code == 200:
                    return response.json()
                return []
        except Exception:
            return []
    
    async def create_face(
        self, 
        asset_id: str, 
        person_id: str,
        x: int, 
        y: int, 
        width: int, 
        height: int,
        image_width: int,
        image_height: int
    ) -> dict:
        """
        Create a new face on an asset.
        
        This is used when Immich didn't detect a face that MS Photos found.
        """
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.base_url}/api/faces",
                    headers=self._get_headers(),
                    json={
                        "assetId": asset_id,
                        "personId": person_id,
                        "x": x,
                        "y": y,
                        "width": width,
                        "height": height,
                        "imageWidth": image_width,
                        "imageHeight": image_height,
                    }
                )
                if response.status_code == 201:
                    return {"success": True, "asset_id": asset_id}
                return {
                    "success": False,
                    "error": f"Status {response.status_code}: {response.text[:200]}"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def find_person_by_name(self, name: str) -> Optional[str]:
        """Find a person by name and return their ID, or None if not found."""
        people = await self.get_all_people()
        for person in people:
            if person.get("name") == name:
                return person.get("id")
        return None


def get_immich_client() -> ImmichClient:
    """Get Immich client instance."""
    return ImmichClient()

/**
 * ClusteredFaceGrid - A wrapper for FaceThumbnailGrid that loads clustered match data.
 * Used in Transfer Names tab for viewing matched faces between MS Photos and Immich clusters.
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getMatchDetails } from '../api';
import FaceThumbnailGrid, { 
  type FaceData, 
  type FaceSortBy,
  photoMatchToFaceData 
} from './FaceThumbnailGrid';

interface ClusteredFaceGridProps {
  msPersonId: number;
  immichClusterId: string;
  minIou: number;
  maxCenterDist: number;
  onViewPhoto?: (index: number, sortBy: FaceSortBy) => void;
  onViewAll?: () => void;
}

export default function ClusteredFaceGrid({
  msPersonId,
  immichClusterId,
  minIou,
  maxCenterDist,
  onViewPhoto,
  onViewAll,
}: ClusteredFaceGridProps) {
  const [loading, setLoading] = useState(true);
  const [faces, setFaces] = useState<FaceData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch match details on mount
  useEffect(() => {
    async function loadMatches() {
      setLoading(true);
      setError(null);
      try {
        const data = await getMatchDetails(msPersonId, immichClusterId, minIou, maxCenterDist);
        // Convert to FaceData format
        setFaces(data.matches.map((m, i) => photoMatchToFaceData(m, i)));
      } catch (err) {
        console.error('Failed to load match details:', err);
        setError('Failed to load face matches');
      } finally {
        setLoading(false);
      }
    }
    loadMatches();
  }, [msPersonId, immichClusterId, minIou, maxCenterDist]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-4">
        <Loader2 className="w-5 h-5 animate-spin text-neon-purple" />
        <span className="text-white/50 text-sm">Loading face matches...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 text-sm py-2">{error}</div>
    );
  }

  return (
    <FaceThumbnailGrid
      faces={faces}
      title="Sample Matched Faces"
      selectable={false}
      showIoU={true}
      showCenterDist={true}
      showFaceRects={false}
      defaultSortBy="iou_asc"
      onViewPhoto={onViewPhoto}
      onViewAll={onViewAll}
    />
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  List, 
  Image as ImageIcon,
  Loader2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { getMatchDetails, getUnclusteredDetails, getUnrecognizedDetails, getImmichPhotoUrl } from '../api';

// ============================================================================
// Types
// ============================================================================

export type ViewerMode = 'clustered' | 'unclustered' | 'unrecognized';
export type SortBy = 'iou_desc' | 'iou_asc' | 'center_dist_asc' | 'center_dist_desc' | 'filename';
type ViewMode = 'photo' | 'list';
type ImageQuality = 'thumbnail' | 'preview';

// Unified face data for the viewer
interface ViewerFaceData {
  filename: string;
  immichAssetId: string;
  fileSize: number;
  imageWidth: number;
  imageHeight: number;
  immichPath?: string;
  msPath?: string;
  
  // Metrics (optional for unrecognized)
  iou?: number;
  centerDist?: number;
  
  // Rectangles (normalized 0-1)
  msRect: { x1: number; y1: number; x2: number; y2: number };
  immichRect?: { x1: number; y1: number; x2: number; y2: number }; // Not present for unrecognized
  
  // Labels
  msPersonName: string;
  immichLabel?: string; // Cluster name or "Unnamed" or "unclustered"
}

interface FacePhotoViewerProps {
  mode: ViewerMode;
  msPersonId: number;
  msPersonName: string;
  // For clustered mode
  immichClusterId?: string;
  immichClusterName?: string;
  // Thresholds
  minIou: number;
  maxCenterDist?: number;
  // Callbacks
  onClose: () => void;
  // Initial state
  startIndex?: number;
  initialSortBy?: SortBy;
  // Optional confidence badge
  confidence?: 'high' | 'medium' | 'low';
}

// Image preload cache
const imageCache = new Map<string, HTMLImageElement>();

function preloadImage(url: string): Promise<HTMLImageElement> {
  if (imageCache.has(url)) {
    return Promise.resolve(imageCache.get(url)!);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ============================================================================
// Main Component
// ============================================================================

export default function FacePhotoViewer({ 
  mode,
  msPersonId, 
  msPersonName,
  immichClusterId,
  immichClusterName,
  minIou, 
  maxCenterDist = 0.25, 
  onClose, 
  startIndex = 0, 
  initialSortBy = 'iou_asc',
  confidence
}: FacePhotoViewerProps) {
  const [loading, setLoading] = useState(true);
  const [faces, setFaces] = useState<ViewerFaceData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [viewMode, setViewMode] = useState<ViewMode>('photo');
  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showRects, setShowRects] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [imageQuality, setImageQuality] = useState<ImageQuality>('thumbnail');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Load face data based on mode
  useEffect(() => {
    async function loadDetails() {
      setLoading(true);
      try {
        let data: ViewerFaceData[] = [];
        
        if (mode === 'clustered' && immichClusterId) {
          const result = await getMatchDetails(msPersonId, immichClusterId, minIou, maxCenterDist);
          data = result.matches.map(m => ({
            filename: m.filename,
            immichAssetId: m.immich_asset_id,
            fileSize: m.file_size,
            imageWidth: m.image_width,
            imageHeight: m.image_height,
            immichPath: m.immich_original_path,
            msPath: m.ms_item_path,
            iou: m.iou,
            centerDist: m.center_dist,
            msRect: { x1: m.ms_rect_x1, y1: m.ms_rect_y1, x2: m.ms_rect_x2, y2: m.ms_rect_y2 },
            immichRect: { x1: m.immich_rect_x1, y1: m.immich_rect_y1, x2: m.immich_rect_x2, y2: m.immich_rect_y2 },
            msPersonName: m.ms_person_name,
            immichLabel: m.immich_cluster_name || 'Unnamed',
          }));
        } else if (mode === 'unclustered') {
          const result = await getUnclusteredDetails(msPersonId, minIou, maxCenterDist);
          data = result.matches.map(m => ({
            filename: m.filename,
            immichAssetId: m.immich_asset_id,
            fileSize: m.file_size,
            imageWidth: 0, // Not in unclustered response
            imageHeight: 0,
            iou: m.iou,
            centerDist: m.center_dist,
            msRect: { x1: m.ms_rect_x1, y1: m.ms_rect_y1, x2: m.ms_rect_x2, y2: m.ms_rect_y2 },
            immichRect: { x1: m.immich_rect_x1, y1: m.immich_rect_y1, x2: m.immich_rect_x2, y2: m.immich_rect_y2 },
            msPersonName: m.ms_person_name,
            immichLabel: 'unclustered',
          }));
        } else if (mode === 'unrecognized') {
          const result = await getUnrecognizedDetails(msPersonId, minIou);
          data = result.faces.map(f => ({
            filename: f.filename,
            immichAssetId: f.immich_asset_id,
            fileSize: f.file_size,
            imageWidth: f.image_width,
            imageHeight: f.image_height,
            msRect: { x1: f.ms_rect_x1, y1: f.ms_rect_y1, x2: f.ms_rect_x2, y2: f.ms_rect_y2 },
            msPersonName: f.ms_person_name,
            // No immichRect or iou/centerDist for unrecognized
          }));
        }
        
        setFaces(data);
      } catch (err) {
        console.error('Failed to load face details:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDetails();
  }, [mode, msPersonId, immichClusterId, minIou, maxCenterDist]);

  // Sort faces
  const sortedFaces = [...faces].sort((a, b) => {
    switch (sortBy) {
      case 'iou_desc': return (b.iou ?? 0) - (a.iou ?? 0);
      case 'iou_asc': return (a.iou ?? 0) - (b.iou ?? 0);
      case 'center_dist_asc': return (a.centerDist ?? 0) - (b.centerDist ?? 0);
      case 'center_dist_desc': return (b.centerDist ?? 0) - (a.centerDist ?? 0);
      case 'filename': return a.filename.localeCompare(b.filename);
      default: return 0;
    }
  });

  const currentFace = sortedFaces[currentIndex];

  // Draw face rectangles on canvas
  const drawRects = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !currentFace || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match displayed image size
    const rect = img.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showRects) return;

    const scaleX = canvas.width;
    const scaleY = canvas.height;

    // Draw MS Photos rect (green solid)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    const msX1 = currentFace.msRect.x1 * scaleX;
    const msY1 = currentFace.msRect.y1 * scaleY;
    const msW = (currentFace.msRect.x2 - currentFace.msRect.x1) * scaleX;
    const msH = (currentFace.msRect.y2 - currentFace.msRect.y1) * scaleY;
    ctx.strokeRect(msX1, msY1, msW, msH);

    // Draw MS label
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px Outfit, sans-serif';
    const msLabel = `MS: ${currentFace.msPersonName}`;
    const msTextWidth = ctx.measureText(msLabel).width;
    ctx.fillRect(msX1, msY1 - 18, msTextWidth + 8, 18);
    ctx.fillStyle = '#000';
    ctx.fillText(msLabel, msX1 + 4, msY1 - 5);

    // Draw Immich rect (blue dashed) if available
    if (currentFace.immichRect) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      const immX1 = currentFace.immichRect.x1 * scaleX;
      const immY1 = currentFace.immichRect.y1 * scaleY;
      const immW = (currentFace.immichRect.x2 - currentFace.immichRect.x1) * scaleX;
      const immH = (currentFace.immichRect.y2 - currentFace.immichRect.y1) * scaleY;
      ctx.strokeRect(immX1, immY1, immW, immH);

      // Draw Immich label
      ctx.setLineDash([]);
      ctx.fillStyle = '#3b82f6';
      const immLabel = `Immich: ${currentFace.immichLabel || 'Unknown'}`;
      const immTextWidth = ctx.measureText(immLabel).width;
      // Position below the rect
      const labelY = Math.max(msY1 + msH, immY1 + immH) + 4;
      ctx.fillRect(immX1, labelY, immTextWidth + 8, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(immLabel, immX1 + 4, labelY + 13);
    }
  }, [currentFace, imageLoaded, showRects]);

  // Redraw when relevant state changes
  useEffect(() => {
    drawRects();
  }, [drawRects]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setCurrentIndex(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min(sortedFaces.length - 1, i + 1));
      else if (e.key === 'r' || e.key === 'R') setShowRects(s => !s);
      else if (e.key === 'l' || e.key === 'L') setViewMode(m => m === 'photo' ? 'list' : 'photo');
      else if (e.key === 'q' || e.key === 'Q') setImageQuality(q => q === 'thumbnail' ? 'preview' : 'thumbnail');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, sortedFaces.length]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Reset image loaded state when changing photos
  useEffect(() => {
    setImageLoaded(false);
    setImageLoading(true);
    setZoom(1);
    
    // Clear canvas immediately
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [currentIndex, sortBy, imageQuality]);

  // Preload adjacent images
  useEffect(() => {
    if (sortedFaces.length === 0 || imageQuality !== 'thumbnail') return;
    
    const indicesToPreload = [
      currentIndex - 2, currentIndex - 1,
      currentIndex + 1, currentIndex + 2, currentIndex + 3,
    ].filter(i => i >= 0 && i < sortedFaces.length && i !== currentIndex);
    
    indicesToPreload.forEach(i => {
      const url = getImmichPhotoUrl(sortedFaces[i].immichAssetId, 'thumbnail');
      preloadImage(url).catch(() => {});
    });
  }, [currentIndex, sortedFaces, imageQuality]);

  // Determine title and subtitle
  const title = msPersonName;
  const subtitle = mode === 'clustered' 
    ? `→ ${immichClusterName || 'Unnamed cluster'}`
    : mode === 'unclustered' 
      ? '(unclustered faces)'
      : '(unrecognized by Immich)';

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neon-purple mx-auto mb-4" />
          <p className="text-white/70">Loading face details...</p>
        </div>
      </div>
    );
  }

  if (sortedFaces.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
        <div className="glass rounded-xl p-8 border border-white/10 text-center">
          <p className="text-white/70 mb-4">No matching photos found.</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-void-700 hover:bg-void-600 text-white"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-void-900">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-medium text-white">{title}</h2>
          <span className="text-white/50 text-sm">{subtitle}</span>
          <span className="text-white/50 text-sm">
            {sortedFaces.length} face matches
          </span>
          {confidence && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              confidence === 'high' ? 'bg-neon-green/20 text-neon-green' :
              confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {confidence}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Sort dropdown - only show if we have metrics */}
          {mode !== 'unrecognized' && (
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as SortBy); setCurrentIndex(0); }}
              className="bg-void-700 text-white text-sm rounded px-2 py-1 border border-white/10"
            >
              <option value="iou_desc">IoU: High → Low</option>
              <option value="iou_asc">IoU: Low → High</option>
              <option value="center_dist_asc">Distance: Best → Worst</option>
              <option value="center_dist_desc">Distance: Worst → Best</option>
              <option value="filename">Filename</option>
            </select>
          )}

          {/* View mode toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'photo' ? 'list' : 'photo')}
            className={`p-2 rounded ${viewMode === 'photo' ? 'bg-neon-purple/20 text-neon-purple' : 'bg-void-700 text-white/70'}`}
            title="Toggle view (L)"
          >
            {viewMode === 'photo' ? <List className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-white/10 text-white/70 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      {viewMode === 'photo' ? (
        <div className="flex-1 flex min-h-0">
          {/* Photo viewer */}
          <div className="flex-1 flex items-center justify-center relative overflow-auto">
            {currentFace && (
              <>
                {/* Navigation buttons */}
                <button
                  onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="absolute left-4 p-3 rounded-full bg-black/50 text-white disabled:opacity-30 hover:bg-black/70 z-10"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setCurrentIndex(i => Math.min(sortedFaces.length - 1, i + 1))}
                  disabled={currentIndex === sortedFaces.length - 1}
                  className="absolute right-4 p-3 rounded-full bg-black/50 text-white disabled:opacity-30 hover:bg-black/70 z-10"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>

                {/* Image with overlay */}
                <div className="relative" style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s' }}>
                  {imageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-void-900/50 z-10 rounded-lg">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-neon-purple" />
                        <span className="text-white/50 text-sm">Loading image...</span>
                      </div>
                    </div>
                  )}
                  <img
                    ref={imageRef}
                    src={getImmichPhotoUrl(currentFace.immichAssetId, imageQuality)}
                    alt={currentFace.filename}
                    className={`max-h-[calc(100vh-200px)] max-w-[calc(100vw-400px)] object-contain transition-opacity duration-200 ${
                      imageLoaded ? 'opacity-100' : 'opacity-30'
                    }`}
                    onLoad={() => {
                      setImageLoading(false);
                      setImageLoaded(true);
                      requestAnimationFrame(() => {
                        requestAnimationFrame(drawRects);
                      });
                    }}
                    onError={() => {
                      setImageLoading(false);
                    }}
                  />
                  <canvas
                    ref={canvasRef}
                    className={`absolute top-0 left-0 pointer-events-none transition-opacity duration-200 ${
                      imageLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </div>
              </>
            )}
          </div>

          {/* Info panel */}
          <div className="w-80 border-l border-white/10 bg-void-900 overflow-y-auto flex-shrink-0">
            {currentFace && (
              <div className="p-4 space-y-4">
                {/* Photo counter */}
                <div className="text-center py-2 bg-void-800 rounded-lg">
                  <span className="text-2xl font-bold text-white">{currentIndex + 1}</span>
                  <span className="text-white/50 mx-2">/</span>
                  <span className="text-white/50">{sortedFaces.length}</span>
                </div>

                {/* IoU score - only for clustered/unclustered */}
                {currentFace.iou !== undefined && (
                  <div className="p-4 bg-void-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/60 text-sm">Face Overlap (IoU)</span>
                      <span className={`text-lg font-bold ${
                        currentFace.iou >= 0.5 ? 'text-neon-green' :
                        currentFace.iou >= 0.35 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {(currentFace.iou * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-void-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          currentFace.iou >= 0.5 ? 'bg-neon-green' :
                          currentFace.iou >= 0.35 ? 'bg-yellow-400' :
                          'bg-red-400'
                        }`}
                        style={{ width: `${currentFace.iou * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Center Distance score - only for clustered/unclustered */}
                {currentFace.centerDist !== undefined && (
                  <div className="p-4 bg-void-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/60 text-sm">Center Distance</span>
                      <span className={`text-lg font-bold ${
                        currentFace.centerDist <= 0.15 ? 'text-neon-green' :
                        currentFace.centerDist <= 0.3 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {(currentFace.centerDist * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-void-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          currentFace.centerDist <= 0.15 ? 'bg-neon-green' :
                          currentFace.centerDist <= 0.3 ? 'bg-yellow-400' :
                          'bg-red-400'
                        }`}
                        style={{ width: `${Math.min(currentFace.centerDist * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-white/40 mt-1">Lower is better</p>
                  </div>
                )}

                {/* File info */}
                <div className="p-4 bg-void-800 rounded-lg space-y-2">
                  <h4 className="text-white/60 text-xs uppercase tracking-wide mb-3">Photo Info</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Filename</span>
                    <span className="text-white font-mono text-xs truncate max-w-[180px]" title={currentFace.filename}>
                      {currentFace.filename}
                    </span>
                  </div>
                  {currentFace.imageWidth > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Dimensions</span>
                      <span className="text-white">{currentFace.imageWidth}×{currentFace.imageHeight}</span>
                    </div>
                  )}
                  {currentFace.fileSize > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">File Size</span>
                      <span className="text-white">{(currentFace.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  )}
                  {currentFace.immichPath && (
                    <div className="text-sm mt-2">
                      <span className="text-white/50 block mb-1">Immich Path</span>
                      <span className="text-white/70 font-mono text-xs break-all">
                        {currentFace.immichPath}
                      </span>
                    </div>
                  )}
                </div>

                {/* Legend */}
                <div className="p-4 bg-void-800 rounded-lg">
                  <h4 className="text-white/60 text-xs uppercase tracking-wide mb-3">Legend</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-3 border-2 border-neon-green rounded"></div>
                      <span className="text-white/70 text-sm">MS Photos ({currentFace.msPersonName})</span>
                    </div>
                    {currentFace.immichRect && (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-3 border-2 border-dashed border-neon-blue rounded"></div>
                        <span className="text-white/70 text-sm">Immich ({currentFace.immichLabel || 'Unknown'})</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="p-4 bg-void-800 rounded-lg space-y-3">
                  <h4 className="text-white/60 text-xs uppercase tracking-wide mb-3">Controls</h4>
                  
                  {/* Image Quality Toggle */}
                  <div>
                    <span className="text-white/50 text-xs block mb-2">Image Quality (Q)</span>
                    <div className="flex rounded-lg overflow-hidden bg-void-700">
                      <button
                        onClick={() => setImageQuality('thumbnail')}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                          imageQuality === 'thumbnail'
                            ? 'bg-neon-cyan text-black'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Fast
                      </button>
                      <button
                        onClick={() => setImageQuality('preview')}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                          imageQuality === 'preview'
                            ? 'bg-neon-purple text-white'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        HD
                      </button>
                    </div>
                  </div>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showRects}
                      onChange={(e) => setShowRects(e.target.checked)}
                      className="w-4 h-4 accent-neon-purple"
                    />
                    <span className="text-white/70 text-sm">Show face rectangles (R)</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                      className="p-1.5 rounded bg-void-700 text-white/70 hover:text-white"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-white/50 text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
                    <button
                      onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                      className="p-1.5 rounded bg-void-700 text-white/70 hover:text-white"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Keyboard shortcuts */}
                <div className="text-xs text-white/40 space-y-1">
                  <p>← → Navigate photos</p>
                  <p>Q Toggle quality</p>
                  <p>R Toggle rectangles</p>
                  <p>L Toggle list view</p>
                  <p>Esc Close</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* List view */
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full">
            <thead className="sticky top-0 bg-void-900 z-10">
              <tr className="text-left text-xs text-white/50 uppercase tracking-wide">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Filename</th>
                {mode !== 'unrecognized' && <th className="py-3 px-4">IoU</th>}
                {mode !== 'unrecognized' && <th className="py-3 px-4">Center Dist</th>}
                {currentFace?.imageWidth > 0 && <th className="py-3 px-4">Dimensions</th>}
                {currentFace?.immichPath && <th className="py-3 px-4">Immich Path</th>}
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedFaces.map((f, i) => (
                <tr 
                  key={`${f.immichAssetId}-${i}`}
                  className={`border-b border-white/5 hover:bg-white/5 ${
                    i === currentIndex ? 'bg-neon-purple/10' : ''
                  }`}
                >
                  <td className="py-3 px-4 text-white/50">{i + 1}</td>
                  <td className="py-3 px-4">
                    <span className="text-white font-mono text-sm">{f.filename}</span>
                  </td>
                  {mode !== 'unrecognized' && (
                    <td className="py-3 px-4">
                      <span className={`font-bold ${
                        (f.iou ?? 0) >= 0.5 ? 'text-neon-green' :
                        (f.iou ?? 0) >= 0.35 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {f.iou !== undefined ? `${(f.iou * 100).toFixed(1)}%` : '—'}
                      </span>
                    </td>
                  )}
                  {mode !== 'unrecognized' && (
                    <td className="py-3 px-4">
                      <span className={`font-bold ${
                        (f.centerDist ?? 1) <= 0.15 ? 'text-neon-green' :
                        (f.centerDist ?? 1) <= 0.3 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {f.centerDist !== undefined ? `${(f.centerDist * 100).toFixed(1)}%` : '—'}
                      </span>
                    </td>
                  )}
                  {f.imageWidth > 0 && (
                    <td className="py-3 px-4 text-white/70 text-sm">
                      {f.imageWidth}×{f.imageHeight}
                    </td>
                  )}
                  {f.immichPath && (
                    <td className="py-3 px-4">
                      <span className="text-white/50 font-mono text-xs max-w-xs truncate block" title={f.immichPath}>
                        {f.immichPath}
                      </span>
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <button
                      onClick={() => { setCurrentIndex(i); setViewMode('photo'); }}
                      className="px-3 py-1 rounded bg-neon-purple/20 text-neon-purple text-sm hover:bg-neon-purple/30"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer with navigation */}
      {viewMode === 'photo' && (
        <div className="px-4 py-3 border-t border-white/10 bg-void-900 flex items-center justify-center gap-2">
          {sortedFaces.slice(Math.max(0, currentIndex - 5), currentIndex + 6).map((f, i) => {
            const actualIndex = Math.max(0, currentIndex - 5) + i;
            return (
              <button
                key={`${f.immichAssetId}-thumb-${actualIndex}`}
                onClick={() => setCurrentIndex(actualIndex)}
                className={`w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                  actualIndex === currentIndex 
                    ? 'border-neon-purple scale-110' 
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img
                  src={getImmichPhotoUrl(f.immichAssetId, 'thumbnail')}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

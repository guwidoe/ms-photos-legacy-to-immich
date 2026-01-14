import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ArrowUpDown, 
  ChevronDown, 
  Eye, 
  CheckSquare, 
  Square,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { getImmichPhotoUrl } from '../api';

// ============================================================================
// Types
// ============================================================================

export type FaceSortBy = 'iou_desc' | 'iou_asc' | 'center_dist_asc' | 'center_dist_desc' | 'filename';

// Normalized face data structure that works for all three use cases
export interface FaceData {
  id: string; // unique identifier (immich_face_id or generated)
  assetId: string; // immich_asset_id
  filename: string;
  iou?: number; // optional for unrecognized faces
  centerDist?: number; // optional for unrecognized faces
  // Face rectangle (normalized 0-1 coordinates)
  msRect?: { x1: number; y1: number; x2: number; y2: number };
  immichRect?: { x1: number; y1: number; x2: number; y2: number };
  // Image dimensions for drawing
  imageWidth?: number;
  imageHeight?: number;
}

interface FaceThumbnailGridProps {
  faces: FaceData[];
  title?: string;
  initialShowCount?: number;
  loadMoreIncrement?: number;
  
  // Selection mode
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (id: string, selected: boolean) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  
  // View callbacks
  onViewPhoto?: (index: number, sortBy: FaceSortBy) => void;
  onViewAll?: () => void;
  
  // Display options
  showIoU?: boolean; // Show IoU stats (false for unrecognized faces)
  showCenterDist?: boolean;
  showFaceRects?: boolean; // Draw rectangles on thumbnails
  defaultSortBy?: FaceSortBy;
}

// ============================================================================
// Thumbnail with Face Rectangles
// ============================================================================

interface ThumbnailWithRectsProps {
  face: FaceData;
  size: 'small' | 'large';
  showRects: boolean;
  onClick?: () => void;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: () => void;
}

function ThumbnailWithRects({ 
  face, 
  size, 
  showRects, 
  onClick, 
  selected,
  selectable,
  onToggleSelect 
}: ThumbnailWithRectsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  
  // Small thumbnails are square, large preserve aspect ratio
  const isLarge = size === 'large';
  const quality = 'thumbnail';
  
  // Draw rectangles on canvas when image loads
  useEffect(() => {
    if (!loaded || !showRects || !canvasRef.current || !imgRef.current) return;
    
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Match canvas size to displayed image element
    const rect = img.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Get natural image dimensions
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    
    if (natW === 0 || natH === 0) return;
    
    // Calculate how object-cover/object-contain scales and positions the image
    const displayW = rect.width;
    const displayH = rect.height;
    const imgAspect = natW / natH;
    const containerAspect = displayW / displayH;
    
    let scale: number, offsetX: number, offsetY: number;
    
    if (isLarge) {
      // object-contain: image fits within container
      if (imgAspect > containerAspect) {
        // Image is wider - fits by width
        scale = displayW / natW;
        offsetX = 0;
        offsetY = (displayH - natH * scale) / 2;
      } else {
        // Image is taller - fits by height
        scale = displayH / natH;
        offsetX = (displayW - natW * scale) / 2;
        offsetY = 0;
      }
    } else {
      // object-cover: image fills container, cropping excess
      if (imgAspect > containerAspect) {
        // Image is wider - scale by height, crop width
        scale = displayH / natH;
        offsetX = (displayW - natW * scale) / 2; // Negative = cropped
        offsetY = 0;
      } else {
        // Image is taller - scale by width, crop height
        scale = displayW / natW;
        offsetX = 0;
        offsetY = (displayH - natH * scale) / 2; // Negative = cropped
      }
    }
    
    // Helper to transform normalized coords to canvas coords
    const transformCoord = (nx: number, ny: number) => ({
      x: nx * natW * scale + offsetX,
      y: ny * natH * scale + offsetY,
    });
    
    // Draw MS Photos rectangle (green solid)
    if (face.msRect) {
      const tl = transformCoord(face.msRect.x1, face.msRect.y1);
      const br = transformCoord(face.msRect.x2, face.msRect.y2);
      
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    
    // Draw Immich rectangle (blue dashed)
    if (face.immichRect) {
      const tl = transformCoord(face.immichRect.x1, face.immichRect.y1);
      const br = transformCoord(face.immichRect.x2, face.immichRect.y2);
      
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
  }, [loaded, showRects, face.msRect, face.immichRect, size, isLarge]);
  
  return (
    <div className={`group relative ${selectable && !selected ? 'opacity-50' : ''}`}>
      {/* Selection checkbox */}
      {selectable && onToggleSelect && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className="absolute top-1 left-1 z-20 p-0.5 rounded bg-black/60 hover:bg-black/80 transition-colors"
        >
          {selected ? (
            <CheckSquare className="w-4 h-4 text-neon-green" />
          ) : (
            <Square className="w-4 h-4 text-white/60" />
          )}
        </button>
      )}
      
      {/* Thumbnail container - square for small, auto-height for large */}
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`rounded-lg overflow-hidden bg-void-700 relative ${
          isLarge ? 'w-48' : 'w-24 h-24'
        } ${
          onClick ? 'cursor-pointer hover:ring-2 hover:ring-neon-purple/50 transition-all' : ''
        } ${selectable && !selected ? 'ring-1 ring-red-500/30' : ''}`}
      >
        <img
          ref={imgRef}
          src={getImmichPhotoUrl(face.assetId, quality)}
          alt={face.filename}
          className={isLarge 
            ? 'w-48 max-h-64 object-contain' 
            : 'w-full h-full object-cover'
          }
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
        {showRects && (
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
        )}
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

const INITIAL_SHOW = 8;
const LOAD_MORE_INCREMENT = 8;

export default function FaceThumbnailGrid({
  faces,
  title = 'Sample Matched Faces',
  initialShowCount = INITIAL_SHOW,
  loadMoreIncrement = LOAD_MORE_INCREMENT,
  selectable = false,
  selectedIds,
  onSelectionChange,
  onSelectAll,
  onDeselectAll,
  onViewPhoto,
  onViewAll,
  showIoU = true,
  showCenterDist = true,
  showFaceRects = false,
  defaultSortBy = 'iou_asc',
}: FaceThumbnailGridProps) {
  const [sortBy, setSortBy] = useState<FaceSortBy>(defaultSortBy);
  const [showCount, setShowCount] = useState(initialShowCount);
  const [thumbnailSize, setThumbnailSize] = useState<'small' | 'large'>('small');
  const [showRects, setShowRects] = useState(showFaceRects);
  
  // Sort faces
  const sortedFaces = useMemo(() => {
    return [...faces].sort((a, b) => {
      switch (sortBy) {
        case 'iou_desc': 
          return (b.iou ?? 0) - (a.iou ?? 0);
        case 'iou_asc': 
          return (a.iou ?? 0) - (b.iou ?? 0);
        case 'center_dist_asc': 
          return (a.centerDist ?? 0) - (b.centerDist ?? 0);
        case 'center_dist_desc': 
          return (b.centerDist ?? 0) - (a.centerDist ?? 0);
        case 'filename':
          return a.filename.localeCompare(b.filename);
        default: 
          return 0;
      }
    });
  }, [faces, sortBy]);
  
  // Visible faces
  const visibleFaces = sortedFaces.slice(0, showCount);
  const remainingCount = sortedFaces.length - showCount;
  
  // Selection stats
  const selectedCount = selectable && selectedIds 
    ? faces.filter(f => selectedIds.has(f.id)).length 
    : faces.length;
  const allSelected = selectedCount === faces.length;
  const noneSelected = selectedCount === 0;
  
  if (faces.length === 0) {
    return (
      <div className="text-white/40 text-sm py-2">No faces found.</div>
    );
  }
  
  return (
    <div className="space-y-3">
      {/* Header with controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h4 className="text-white/70 text-sm font-medium">
            {title}
            {selectable ? (
              <span className="text-white/40 font-normal ml-2">
                ({selectedCount}/{faces.length} selected)
              </span>
            ) : (
              <span className="text-white/40 font-normal ml-2">({faces.length} total)</span>
            )}
          </h4>
          
          {/* Select all / Deselect all buttons */}
          {selectable && onSelectAll && onDeselectAll && (
            <div className="flex items-center gap-1">
              <button
                onClick={onSelectAll}
                disabled={allSelected}
                className="px-2 py-0.5 rounded text-xs text-white/50 hover:text-white hover:bg-void-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Select All
              </button>
              <span className="text-white/20">|</span>
              <button
                onClick={onDeselectAll}
                disabled={noneSelected}
                className="px-2 py-0.5 rounded text-xs text-white/50 hover:text-white hover:bg-void-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Deselect All
              </button>
            </div>
          )}
        </div>
        
        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Toggle face rectangles */}
          <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer">
            <input
              type="checkbox"
              checked={showRects}
              onChange={(e) => setShowRects(e.target.checked)}
              className="rounded border-white/30 w-3 h-3"
            />
            Boxes
          </label>
          
          {/* Thumbnail size toggle */}
          <button
            onClick={() => setThumbnailSize(s => s === 'small' ? 'large' : 'small')}
            className={`p-1.5 rounded transition-colors ${
              thumbnailSize === 'large' 
                ? 'bg-neon-cyan/20 text-neon-cyan' 
                : 'bg-void-700 text-white/50 hover:text-white'
            }`}
            title={thumbnailSize === 'small' ? 'Enlarge thumbnails' : 'Shrink thumbnails'}
          >
            {thumbnailSize === 'small' ? (
              <Maximize2 className="w-3.5 h-3.5" />
            ) : (
              <Minimize2 className="w-3.5 h-3.5" />
            )}
          </button>
          
          {/* View all photos button */}
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-void-600 hover:bg-void-500 text-white/70 hover:text-white text-xs transition-colors"
            >
              <Eye className="w-3 h-3" />
              View Photos
            </button>
          )}
          
          {/* Sort dropdown */}
          {(showIoU || showCenterDist) && (
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-white/40" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as FaceSortBy)}
                className="bg-void-700 text-white text-xs rounded px-2 py-1 border border-white/10 cursor-pointer"
              >
                {showIoU && (
                  <>
                    <option value="iou_desc">IoU: High → Low</option>
                    <option value="iou_asc">IoU: Low → High</option>
                  </>
                )}
                {showCenterDist && (
                  <>
                    <option value="center_dist_asc">Distance: Best → Worst</option>
                    <option value="center_dist_desc">Distance: Worst → Best</option>
                  </>
                )}
                <option value="filename">Filename</option>
              </select>
            </div>
          )}
        </div>
      </div>
      
      {/* Face grid */}
      <div className={`flex flex-wrap ${thumbnailSize === 'large' ? 'gap-4 items-start' : 'gap-3'}`}>
        {visibleFaces.map((face) => {
          const sortedIndex = sortedFaces.findIndex(f => f.id === face.id);
          const isSelected = selectable && selectedIds ? selectedIds.has(face.id) : true;
          
          return (
            <div key={face.id} className={`flex flex-col ${thumbnailSize === 'large' ? 'w-48' : ''}`}>
              <ThumbnailWithRects
                face={face}
                size={thumbnailSize}
                showRects={showRects}
                onClick={() => onViewPhoto?.(sortedIndex, sortBy)}
                selected={isSelected}
                selectable={selectable}
                onToggleSelect={() => onSelectionChange?.(face.id, !isSelected)}
              />
              
              {/* Filename */}
              <p 
                className={`text-white/60 text-xs mt-1.5 truncate ${
                  thumbnailSize === 'large' ? 'w-48' : 'max-w-24'
                }`} 
                title={face.filename}
              >
                {face.filename}
              </p>
              
              {/* Stats */}
              {showIoU && face.iou !== undefined && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-mono ${
                    face.iou >= 0.5 ? 'text-neon-green' :
                    face.iou >= 0.35 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    IoU: {(face.iou * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              {showCenterDist && face.centerDist !== undefined && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${
                    face.centerDist <= 0.15 ? 'text-neon-green' :
                    face.centerDist <= 0.3 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    CD: {(face.centerDist * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Load more button */}
      {remainingCount > 0 && (
        <button
          onClick={() => setShowCount(prev => prev + loadMoreIncrement)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-void-700 hover:bg-void-600 text-white/70 hover:text-white text-sm transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
          Load {Math.min(remainingCount, loadMoreIncrement)} more
          <span className="text-white/40">({remainingCount} remaining)</span>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Utility Functions for Converting Data
// ============================================================================

// Convert PhotoFaceMatch to FaceData (Transfer Names)
export function photoMatchToFaceData(match: {
  immich_asset_id: string;
  filename: string;
  iou: number;
  center_dist: number;
  ms_rect_x1: number;
  ms_rect_y1: number;
  ms_rect_x2: number;
  ms_rect_y2: number;
  immich_rect_x1: number;
  immich_rect_y1: number;
  immich_rect_x2: number;
  immich_rect_y2: number;
  image_width?: number;
  image_height?: number;
}, index: number): FaceData {
  return {
    id: `${match.immich_asset_id}-${index}`,
    assetId: match.immich_asset_id,
    filename: match.filename,
    iou: match.iou,
    centerDist: match.center_dist,
    msRect: {
      x1: match.ms_rect_x1,
      y1: match.ms_rect_y1,
      x2: match.ms_rect_x2,
      y2: match.ms_rect_y2,
    },
    immichRect: {
      x1: match.immich_rect_x1,
      y1: match.immich_rect_y1,
      x2: match.immich_rect_x2,
      y2: match.immich_rect_y2,
    },
    imageWidth: match.image_width,
    imageHeight: match.image_height,
  };
}

// Convert UnclusteredFacePreview to FaceData (Assign Faces)
export function unclusteredToFaceData(face: {
  immich_face_id: string;
  immich_asset_id: string;
  filename: string;
  iou: number;
  center_dist: number;
  ms_rect_x1?: number;
  ms_rect_y1?: number;
  ms_rect_x2?: number;
  ms_rect_y2?: number;
  immich_rect_x1?: number;
  immich_rect_y1?: number;
  immich_rect_x2?: number;
  immich_rect_y2?: number;
}): FaceData {
  return {
    id: face.immich_face_id,
    assetId: face.immich_asset_id,
    filename: face.filename,
    iou: face.iou,
    centerDist: face.center_dist,
    msRect: face.ms_rect_x1 !== undefined ? {
      x1: face.ms_rect_x1,
      y1: face.ms_rect_y1!,
      x2: face.ms_rect_x2!,
      y2: face.ms_rect_y2!,
    } : undefined,
    immichRect: face.immich_rect_x1 !== undefined ? {
      x1: face.immich_rect_x1,
      y1: face.immich_rect_y1!,
      x2: face.immich_rect_x2!,
      y2: face.immich_rect_y2!,
    } : undefined,
  };
}

// Convert UnrecognizedFacePreview to FaceData (Create Faces)
export function unrecognizedToFaceData(face: {
  immich_asset_id: string;
  filename: string;
  ms_rect_x1: number;
  ms_rect_y1: number;
  ms_rect_x2: number;
  ms_rect_y2: number;
  image_width: number;
  image_height: number;
}, index: number): FaceData {
  return {
    id: `${face.immich_asset_id}-${index}`,
    assetId: face.immich_asset_id,
    filename: face.filename,
    msRect: {
      x1: face.ms_rect_x1,
      y1: face.ms_rect_y1,
      x2: face.ms_rect_x2,
      y2: face.ms_rect_y2,
    },
    imageWidth: face.image_width,
    imageHeight: face.image_height,
  };
}

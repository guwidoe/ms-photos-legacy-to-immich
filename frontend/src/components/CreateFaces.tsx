import { useState, useMemo, Fragment, useEffect, useRef } from 'react';
import { 
  PlusSquare, 
  Loader2, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Filter,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  PlusCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Eye,
  RefreshCw
} from 'lucide-react';
import { useMatching } from '../context/MatchingContext';
import { previewUnrecognizedFaces, createFaces } from '../api';
import type { UnrecognizedPersonPreview, UnrecognizedFacePreview } from '../types';
import FaceThumbnailGrid, { type FaceSortBy, unrecognizedToFaceData } from './FaceThumbnailGrid';
import FacePhotoViewer from './FacePhotoViewer';
import ProgressModal, { type ProgressItem } from './ProgressModal';

type FilterMode = 'all' | 'needs_creation' | 'exists' | 'applied';
type SortField = 'name' | 'faces' | 'total';
type SortDirection = 'asc' | 'desc';

export default function CreateFaces() {
  const { lastRun, minIoU } = useMatching();

  // Data state
  const [previews, setPreviews] = useState<UnrecognizedPersonPreview[]>([]);
  const [stats, setStats] = useState<{
    total_people_with_unrecognized: number;
    total_faces_to_create: number;
    total_photos_with_unrecognized: number;
    common_photos_checked: number;
    people_needing_creation: number;
    people_already_exist: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortField, setSortField] = useState<SortField>('faces');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [viewingPhotos, setViewingPhotos] = useState<{
    msPersonId: number;
    msPersonName: string;
    startIndex?: number;
    sortBy?: FaceSortBy;
  } | null>(null);
  
  // Per-face selection state: maps person_id -> Set of SELECTED face IDs (by asset_id-index)
  const [faceSelections, setFaceSelections] = useState<Map<number, Set<string>>>(new Map());
  
  // Progress modal state
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [subProgress, setSubProgress] = useState<{ current: number; total: number } | null>(null);
  const cancelRef = useRef(false);

  // Get face ID for an unrecognized face (since they don't have immich_face_id)
  const getFaceId = (face: UnrecognizedFacePreview, index: number) => 
    `${face.immich_asset_id}-${index}`;
  
  // Get selected faces for a person (defaults to all faces if not explicitly set)
  const getSelectedFaces = (preview: UnrecognizedPersonPreview): Set<string> => {
    if (faceSelections.has(preview.ms_person_id)) {
      return faceSelections.get(preview.ms_person_id)!;
    }
    // Default: all faces selected
    return new Set(preview.faces.map((f, i) => getFaceId(f, i)));
  };
  
  // Count selected faces for a person
  const getSelectedFaceCount = (preview: UnrecognizedPersonPreview): number => {
    return getSelectedFaces(preview).size;
  };

  // Load data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await previewUnrecognizedFaces({ min_iou: minIoU });
      setPreviews(result.previews);
      setStats(result.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Load data when algorithm has run
  useEffect(() => {
    if (lastRun) {
      loadData();
    }
  }, [lastRun, minIoU]);

  // Filter and sort previews
  const filteredPreviews = useMemo(() => {
    let filtered = previews.filter(preview => {
      const isApplied = appliedIds.has(preview.ms_person_id);
      const needsCreation = preview.needs_person_creation;

      switch (filterMode) {
        case 'needs_creation':
          return needsCreation && !isApplied;
        case 'exists':
          return !needsCreation && !isApplied;
        case 'applied':
          return isApplied;
        case 'all':
        default:
          return !isApplied;
      }
    });

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.ms_person_name.localeCompare(b.ms_person_name);
          break;
        case 'faces':
          cmp = a.face_count - b.face_count;
          break;
        case 'total':
          cmp = a.total_faces_in_ms_photos - b.total_faces_in_ms_photos;
          break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [previews, filterMode, sortField, sortDirection, appliedIds]);

  // Stats for filter badges
  const filterStats = useMemo(() => {
    const applied = previews.filter(p => appliedIds.has(p.ms_person_id)).length;
    const remaining = previews.filter(p => !appliedIds.has(p.ms_person_id));
    const needsCreation = remaining.filter(p => p.needs_person_creation).length;
    const exists = remaining.filter(p => !p.needs_person_creation).length;
    
    return {
      all: remaining.length,
      needsCreation,
      exists,
      applied,
    };
  }, [previews, appliedIds]);

  // Toggle expanded row
  const toggleExpanded = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Get sort icon for a column
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-neon-cyan" />
      : <ArrowDown className="w-3 h-3 text-neon-cyan" />;
  };

  // Toggle selection
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all visible
  const selectAll = () => {
    const ids = filteredPreviews
      .filter(p => !appliedIds.has(p.ms_person_id))
      .map(p => p.ms_person_id);
    setSelectedIds(new Set(ids));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Convert normalized rect to pixel coordinates
  const rectToPixels = (face: UnrecognizedFacePreview) => ({
    x: Math.round(face.ms_rect_x1 * face.image_width),
    y: Math.round(face.ms_rect_y1 * face.image_height),
    width: Math.round((face.ms_rect_x2 - face.ms_rect_x1) * face.image_width),
    height: Math.round((face.ms_rect_y2 - face.ms_rect_y1) * face.image_height),
  });

  // Apply single
  const applySingle = async (preview: UnrecognizedPersonPreview) => {
    setApplyingId(preview.ms_person_id);
    setApplyError(null);
    setApplySuccess(null);
    
    try {
      const result = await createFaces({
        ms_person_id: preview.ms_person_id,
        ms_person_name: preview.ms_person_name,
        faces: preview.faces.map(f => ({
          asset_id: f.immich_asset_id,
          ...rectToPixels(f),
          image_width: f.image_width,
          image_height: f.image_height,
        })),
        dry_run: false,
      });
      
      if (result.success) {
        setAppliedIds(prev => new Set(prev).add(preview.ms_person_id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(preview.ms_person_id);
          return next;
        });
        setApplySuccess(`Created ${result.faces_created_count} faces for "${preview.ms_person_name}"`);
      } else {
        setApplyError(result.error || 'Failed to create faces');
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplyingId(null);
    }
  };

  // Apply selected with per-face progress tracking
  const applySelected = async () => {
    const previewsToApply = filteredPreviews.filter(p => 
      selectedIds.has(p.ms_person_id) && 
      !appliedIds.has(p.ms_person_id)
    );
    
    if (previewsToApply.length === 0) return;
    
    // Initialize progress with actual selected face counts
    cancelRef.current = false;
    const items: ProgressItem[] = previewsToApply.map(p => {
      const selectedFaceCount = getSelectedFaceCount(p);
      return {
        id: p.ms_person_id,
        name: `${p.ms_person_name} (${selectedFaceCount} faces)`,
        status: 'pending' as const,
      };
    });
    setProgressItems(items);
    setProgressIndex(0);
    setSubProgress(null);
    setShowProgress(true);
    setBulkApplying(true);
    setApplyError(null);
    setApplySuccess(null);
    
    // Process each person
    for (let i = 0; i < previewsToApply.length; i++) {
      if (cancelRef.current) break;
      
      const preview = previewsToApply[i];
      const selectedFaceIds = getSelectedFaces(preview);
      const facesToApply = preview.faces.filter((f, idx) => selectedFaceIds.has(getFaceId(f, idx)));
      
      if (facesToApply.length === 0) {
        // No faces selected for this person, skip
        setProgressItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'success' } : item
        ));
        continue;
      }
      
      setProgressIndex(i);
      
      // Update current item to processing
      setProgressItems(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'processing' } : item
      ));
      
      // Process faces one at a time for granular progress
      let successCount = 0;
      let lastError: string | null = null;
      
      for (let faceIdx = 0; faceIdx < facesToApply.length; faceIdx++) {
        if (cancelRef.current) break;
        
        // Update sub-progress
        setSubProgress({ current: faceIdx + 1, total: facesToApply.length });
        
        const face = facesToApply[faceIdx];
        
        try {
          const result = await createFaces({
            ms_person_id: preview.ms_person_id,
            ms_person_name: preview.ms_person_name,
            faces: [{
              asset_id: face.immich_asset_id,
              ...rectToPixels(face),
              image_width: face.image_width,
              image_height: face.image_height,
            }],
            dry_run: false,
          });
          
          if (result.success) {
            successCount++;
          } else {
            lastError = result.error || 'Failed';
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Failed';
        }
      }
      
      // Clear sub-progress
      setSubProgress(null);
      
      // Update person status based on results
      if (successCount > 0) {
        setAppliedIds(prev => new Set(prev).add(preview.ms_person_id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(preview.ms_person_id);
          return next;
        });
        // Clear face selections for this person
        setFaceSelections(prev => {
          const next = new Map(prev);
          next.delete(preview.ms_person_id);
          return next;
        });
      }
      
      if (successCount === facesToApply.length) {
        setProgressItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'success' } : item
        ));
      } else if (successCount > 0) {
        // Partial success
        setProgressItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'success', name: `${preview.ms_person_name} (${successCount}/${facesToApply.length} faces)` } : item
        ));
      } else {
        setProgressItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'error', error: lastError || 'All faces failed' } : item
        ));
      }
    }
    
    setBulkApplying(false);
    setSubProgress(null);
  };
  
  // Handle cancel
  const handleCancelProgress = () => {
    if (bulkApplying) {
      cancelRef.current = true;
    }
    setShowProgress(false);
  };

  // Show message if algorithm hasn't run
  if (!lastRun) {
    return (
      <div className="glass rounded-xl p-8 border border-white/5 text-center">
        <PlusSquare className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No Data Available</h3>
        <p className="text-white/50 text-sm">
          Please run the algorithm from the Analytics tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="glass rounded-xl p-6 border border-white/5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-neon-purple/10">
            <PlusSquare className="w-6 h-6 text-neon-purple" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white mb-1">Create Faces</h2>
            <p className="text-white/50 text-sm">
              Create faces in Immich for people that MS Photos recognized but Immich missed entirely.
              Uses the face bounding boxes from MS Photos to create new face entries.
            </p>
          </div>
          
          {/* Stats badges */}
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-purple">{stats?.total_faces_to_create || 0}</p>
              <p className="text-white/40 text-xs">Faces to Create</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-cyan">{stats?.total_people_with_unrecognized || 0}</p>
              <p className="text-white/40 text-xs">People</p>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg bg-void-700 hover:bg-void-600 text-white/60 hover:text-white disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="glass rounded-lg p-4 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
          <button onClick={loadData} className="ml-auto text-white/60 hover:text-white text-sm">
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && previews.length === 0 && (
        <div className="glass rounded-xl p-8 border border-white/5 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neon-purple mx-auto mb-4" />
          <p className="text-white/50">Analyzing unrecognized faces...</p>
        </div>
      )}

      {/* No data state */}
      {!loading && previews.length === 0 && !error && (
        <div className="glass rounded-xl p-8 border border-white/5 text-center">
          <CheckCircle2 className="w-12 h-12 text-neon-green/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Unrecognized Faces</h3>
          <p className="text-white/50 text-sm">
            All faces in MS Photos have corresponding detections in Immich.
          </p>
        </div>
      )}

      {/* Main content */}
      {previews.length > 0 && (
        <>
          {/* Filter and actions bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Filter tabs */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-void-800 rounded-lg p-1">
                {[
                  { id: 'all' as FilterMode, label: 'All Pending', count: filterStats.all },
                  { id: 'needs_creation' as FilterMode, label: 'Need Creation', count: filterStats.needsCreation },
                  { id: 'exists' as FilterMode, label: 'Person Exists', count: filterStats.exists },
                  { id: 'applied' as FilterMode, label: 'Applied', count: filterStats.applied },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterMode(tab.id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      filterMode === tab.id
                        ? 'bg-void-600 text-white'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 text-xs opacity-60">({tab.count})</span>
                  </button>
                ))}
              </div>

              {/* Expand/Collapse all */}
              <button
                onClick={() => {
                  if (expandedRows.size > 0) {
                    setExpandedRows(new Set());
                  } else {
                    setExpandedRows(new Set(filteredPreviews.map(p => p.ms_person_id)));
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-void-700 text-white/60 hover:text-white text-sm"
              >
                <ChevronsUpDown className="w-4 h-4" />
                {expandedRows.size > 0 ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            {/* Selection actions */}
            <div className="flex items-center gap-3">
              {selectedIds.size > 0 ? (
                <>
                  <span className="text-white/50 text-sm">{selectedIds.size} selected</span>
                  <button
                    onClick={clearSelection}
                    className="text-sm text-white/50 hover:text-white"
                  >
                    Clear
                  </button>
                  <button
                    onClick={applySelected}
                    disabled={bulkApplying}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-neon-purple to-neon-cyan text-white font-medium text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {bulkApplying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Create Selected
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={selectAll}
                  className="text-sm text-white/50 hover:text-white"
                >
                  Select All
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          {applyError && (
            <div className="glass rounded-lg p-3 border border-red-500/30 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400 text-sm">{applyError}</span>
              <button onClick={() => setApplyError(null)} className="ml-auto text-white/40 hover:text-white">
                ×
              </button>
            </div>
          )}
          
          {applySuccess && (
            <div className="glass rounded-lg p-3 border border-neon-green/30 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-neon-green" />
              <span className="text-neon-green text-sm">{applySuccess}</span>
              <button onClick={() => setApplySuccess(null)} className="ml-auto text-white/40 hover:text-white">
                ×
              </button>
            </div>
          )}

          {/* Previews table */}
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            {filteredPreviews.length === 0 ? (
              <div className="p-8 text-center">
                <Filter className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/50">No faces found for this filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-void-800/50">
                      <th className="w-12 p-3">
                        {(() => {
                          const applicableCount = filteredPreviews.filter(p => !appliedIds.has(p.ms_person_id)).length;
                          const allSelected = applicableCount > 0 && selectedIds.size === applicableCount;
                          return (
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => allSelected ? clearSelection() : selectAll()}
                              className="rounded border-white/30"
                            />
                          );
                        })()}
                      </th>
                      <th 
                        className="text-left text-xs text-white/50 font-medium p-3 cursor-pointer hover:text-white/80"
                        onClick={() => toggleSort('name')}
                      >
                        <span className="flex items-center gap-1">
                          MS Photos Person {getSortIcon('name')}
                        </span>
                      </th>
                      <th 
                        className="text-right text-xs text-white/50 font-medium p-3 cursor-pointer hover:text-white/80"
                        onClick={() => toggleSort('faces')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          Faces to Create {getSortIcon('faces')}
                        </span>
                      </th>
                      <th 
                        className="text-right text-xs text-white/50 font-medium p-3 cursor-pointer hover:text-white/80"
                        onClick={() => toggleSort('total')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          Total MS Faces {getSortIcon('total')}
                        </span>
                      </th>
                      <th className="text-center text-xs text-white/50 font-medium p-3">Immich Person</th>
                      <th className="text-center text-xs text-white/50 font-medium p-3">Status</th>
                      <th className="text-center text-xs text-white/50 font-medium p-3 w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreviews.map((preview) => {
                      const isExpanded = expandedRows.has(preview.ms_person_id);
                      const isApplied = appliedIds.has(preview.ms_person_id);
                      const canApply = !isApplied;

                      return (
                        <Fragment key={preview.ms_person_id}>
                          <tr 
                            className={`border-b border-white/5 hover:bg-white/5 ${isApplied ? 'opacity-50' : ''}`}
                          >
                            <td className="p-3">
                              {canApply && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(preview.ms_person_id)}
                                  onChange={() => toggleSelection(preview.ms_person_id)}
                                  className="rounded border-white/30"
                                />
                              )}
                            </td>
                            <td className="p-3">
                              <span className="text-white font-medium">{preview.ms_person_name}</span>
                            </td>
                            <td className="p-3 text-right">
                              {selectedIds.has(preview.ms_person_id) ? (
                                <span className="text-neon-purple font-mono">
                                  {getSelectedFaceCount(preview)}/{preview.face_count}
                                </span>
                              ) : (
                                <span className="text-neon-purple font-mono">{preview.face_count}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <span className="text-white/50 font-mono">{preview.total_faces_in_ms_photos}</span>
                            </td>
                            <td className="p-3 text-center">
                              {preview.needs_person_creation ? (
                                <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                                  <PlusCircle className="w-3 h-3" />
                                  Will create
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-neon-cyan">
                                  <UserCheck className="w-3 h-3" />
                                  {preview.existing_immich_person_name || 'Exists'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {isApplied ? (
                                <span className="inline-flex items-center gap-1 text-xs text-neon-green">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Created
                                </span>
                              ) : (
                                <span className="text-xs text-white/40">Pending</span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => toggleExpanded(preview.ms_person_id)}
                                  className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white"
                                  title={isExpanded ? "Collapse details" : "Expand details"}
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => setViewingPhotos({
                                    msPersonId: preview.ms_person_id,
                                    msPersonName: preview.ms_person_name,
                                  })}
                                  className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white"
                                  title="View photos"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {canApply && (
                                  <button
                                    onClick={() => applySingle(preview)}
                                    disabled={applyingId === preview.ms_person_id}
                                    className="px-2 py-1 rounded bg-neon-purple/20 text-neon-purple text-xs font-medium hover:bg-neon-purple/30 disabled:opacity-50"
                                  >
                                    {applyingId === preview.ms_person_id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      'Create'
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded row - show face grid */}
                          {isExpanded && (
                            <tr className="bg-void-800/30">
                              <td colSpan={7} className="p-4">
                                <FaceThumbnailGrid
                                  faces={preview.faces.map((f, i) => unrecognizedToFaceData(f, i))}
                                  title="Faces to Create"
                                  showIoU={false}
                                  showCenterDist={false}
                                  showFaceRects={true}
                                  defaultSortBy="filename"
                                  onViewPhoto={(index, sortBy) => setViewingPhotos({
                                    msPersonId: preview.ms_person_id,
                                    msPersonName: preview.ms_person_name,
                                    startIndex: index,
                                    sortBy,
                                  })}
                                  onViewAll={() => setViewingPhotos({
                                    msPersonId: preview.ms_person_id,
                                    msPersonName: preview.ms_person_name,
                                  })}
                                  // Enable selection when person is selected
                                  selectable={selectedIds.has(preview.ms_person_id)}
                                  selectedIds={getSelectedFaces(preview)}
                                  onSelectionChange={(faceId, selected) => {
                                    setFaceSelections(prev => {
                                      const next = new Map(prev);
                                      let faceSet = next.get(preview.ms_person_id);
                                      if (!faceSet) {
                                        // Initialize with all faces
                                        faceSet = new Set(preview.faces.map((f, i) => getFaceId(f, i)));
                                        next.set(preview.ms_person_id, faceSet);
                                      }
                                      if (selected) {
                                        faceSet.add(faceId);
                                      } else {
                                        faceSet.delete(faceId);
                                      }
                                      return next;
                                    });
                                  }}
                                  onSelectAll={() => {
                                    setFaceSelections(prev => {
                                      const next = new Map(prev);
                                      next.set(preview.ms_person_id, new Set(preview.faces.map((f, i) => getFaceId(f, i))));
                                      return next;
                                    });
                                  }}
                                  onDeselectAll={() => {
                                    setFaceSelections(prev => {
                                      const next = new Map(prev);
                                      next.set(preview.ms_person_id, new Set());
                                      return next;
                                    });
                                  }}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Photo Viewer Modal */}
      {viewingPhotos && (
        <FacePhotoViewer
          mode="unrecognized"
          msPersonId={viewingPhotos.msPersonId}
          msPersonName={viewingPhotos.msPersonName}
          minIou={minIoU}
          onClose={() => setViewingPhotos(null)}
          startIndex={viewingPhotos.startIndex}
          initialSortBy={viewingPhotos.sortBy}
        />
      )}

      {loading && previews.length > 0 && (
        <div className="fixed inset-0 bg-void-950/50 flex items-center justify-center z-40">
          <div className="glass rounded-xl p-6 border border-white/10 flex items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-neon-purple" />
            <span className="text-white">Updating...</span>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      <ProgressModal
        isOpen={showProgress}
        title="Creating Faces in Immich"
        items={progressItems}
        currentIndex={progressIndex}
        onCancel={handleCancelProgress}
        canCancel={bulkApplying}
        subProgress={subProgress ? { ...subProgress, label: 'Face' } : undefined}
      />
    </div>
  );
}

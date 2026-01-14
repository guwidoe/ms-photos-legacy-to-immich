import { useState, useMemo, Fragment, useRef } from 'react';
import { 
  UserPlus, 
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
  Eye
} from 'lucide-react';
import { useMatching } from '../context/MatchingContext';
import { applyUnclusteredFaces } from '../api';
import FaceThumbnailGrid, { type FaceSortBy, unclusteredToFaceData } from './FaceThumbnailGrid';
import FacePhotoViewer from './FacePhotoViewer';
import ProgressModal, { type ProgressItem } from './ProgressModal';
import type { PersonApplyPreview } from '../types';

type FilterMode = 'all' | 'needs_creation' | 'exists' | 'applied';
type SortField = 'name' | 'faces' | 'avg_iou';
type SortDirection = 'asc' | 'desc';

export default function AssignFaces() {
  const {
    lastRun,
    loading: contextLoading,
    unclusteredPreviews,
    stats,
    appliedChanges,
    markPersonAssigned,
    minIoU,
    maxCenterDist,
  } = useMatching();

  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortField, setSortField] = useState<SortField>('faces');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
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
  
  // Per-face selection state: maps person_id -> Set of SELECTED face IDs
  // When a person is first selected, all their faces are included by default
  const [faceSelections, setFaceSelections] = useState<Map<number, Set<string>>>(new Map());
  
  // Progress modal state
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [subProgress, setSubProgress] = useState<{ current: number; total: number } | null>(null);
  const cancelRef = useRef(false);
  
  // Get selected faces for a person (defaults to all faces if not explicitly set)
  const getSelectedFaces = (preview: PersonApplyPreview): Set<string> => {
    if (faceSelections.has(preview.ms_person_id)) {
      return faceSelections.get(preview.ms_person_id)!;
    }
    // Default: all faces selected
    return new Set(preview.faces.map(f => f.immich_face_id));
  };
  
  // Count selected faces for a person
  const getSelectedFaceCount = (preview: PersonApplyPreview): number => {
    return getSelectedFaces(preview).size;
  };

  // Filter and sort previews
  const filteredPreviews = useMemo(() => {
    if (!unclusteredPreviews) return [];
    
    let filtered = unclusteredPreviews.filter(preview => {
      const isApplied = appliedChanges.assignedPeople.has(preview.ms_person_id);
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
        case 'avg_iou':
          cmp = a.avg_iou - b.avg_iou;
          break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [unclusteredPreviews, filterMode, sortField, sortDirection, appliedChanges]);

  // Stats for filter badges
  const filterStats = useMemo(() => {
    if (!unclusteredPreviews) return { all: 0, needsCreation: 0, exists: 0, applied: 0 };
    
    const applied = unclusteredPreviews.filter(p => appliedChanges.assignedPeople.has(p.ms_person_id)).length;
    const remaining = unclusteredPreviews.filter(p => !appliedChanges.assignedPeople.has(p.ms_person_id));
    const needsCreation = remaining.filter(p => p.needs_person_creation).length;
    const exists = remaining.filter(p => !p.needs_person_creation).length;
    
    return {
      all: remaining.length,
      needsCreation,
      exists,
      applied,
    };
  }, [unclusteredPreviews, appliedChanges]);

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
      .filter(p => !appliedChanges.assignedPeople.has(p.ms_person_id))
      .map(p => p.ms_person_id);
    setSelectedIds(new Set(ids));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Apply single
  const applySingle = async (preview: PersonApplyPreview) => {
    setApplyingId(preview.ms_person_id);
    setApplyError(null);
    setApplySuccess(null);
    
    try {
      const result = await applyUnclusteredFaces({
        items: [{
          ms_person_id: preview.ms_person_id,
          ms_person_name: preview.ms_person_name,
          face_ids: preview.faces.map(f => f.immich_face_id),
        }],
        dry_run: false,
      });
      
      if (result.faces_assigned_count > 0) {
        markPersonAssigned(preview.ms_person_id);
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(preview.ms_person_id);
          return next;
        });
        setApplySuccess(`Assigned ${result.faces_assigned_count} faces to "${preview.ms_person_name}"`);
      } else if (result.failed_count > 0) {
        setApplyError(result.results.failed[0]?.error || 'Failed to apply');
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
      !appliedChanges.assignedPeople.has(p.ms_person_id)
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
      const facesToApply = preview.faces.filter(f => selectedFaceIds.has(f.immich_face_id));
      
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
          const result = await applyUnclusteredFaces({
            items: [{
              ms_person_id: preview.ms_person_id,
              ms_person_name: preview.ms_person_name,
              face_ids: [face.immich_face_id],
            }],
            dry_run: false,
          });
          
          if (result.faces_assigned_count > 0) {
            successCount++;
          } else if (result.failed_count > 0) {
            lastError = result.results.failed[0]?.error || 'Failed';
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Failed';
        }
      }
      
      // Clear sub-progress
      setSubProgress(null);
      
      // Update person status based on results
      if (successCount > 0) {
        markPersonAssigned(preview.ms_person_id);
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
        <UserPlus className="w-12 h-12 text-white/20 mx-auto mb-4" />
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
          <div className="p-3 rounded-xl bg-neon-green/10">
            <UserPlus className="w-6 h-6 text-neon-green" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white mb-1">Assign Faces</h2>
            <p className="text-white/50 text-sm">
              Assign names from MS Photos people to unclustered Immich faces. Creates new people in Immich if needed.
            </p>
          </div>
          
          {/* Stats badges */}
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-green">{stats?.totalUnclusteredFaces || 0}</p>
              <p className="text-white/40 text-xs">Total Faces</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-cyan">{stats?.peopleWithUnclusteredMatches || 0}</p>
              <p className="text-white/40 text-xs">People</p>
            </div>
          </div>
        </div>
      </div>

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
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-neon-green to-neon-cyan text-white font-medium text-sm hover:opacity-90 disabled:opacity-50"
              >
                {bulkApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Apply Selected
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
                      const applicableCount = filteredPreviews.filter(p => !appliedChanges.assignedPeople.has(p.ms_person_id)).length;
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
                      Faces to Assign {getSortIcon('faces')}
                    </span>
                  </th>
                  <th className="text-right text-xs text-white/50 font-medium p-3">Total MS Faces</th>
                  <th 
                    className="text-right text-xs text-white/50 font-medium p-3 cursor-pointer hover:text-white/80"
                    onClick={() => toggleSort('avg_iou')}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Avg IoU {getSortIcon('avg_iou')}
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
                  const isApplied = appliedChanges.assignedPeople.has(preview.ms_person_id);
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
                            <span className="text-neon-green font-mono">
                              {getSelectedFaceCount(preview)}/{preview.face_count}
                            </span>
                          ) : (
                            <span className="text-neon-green font-mono">{preview.face_count}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-white/50 font-mono">{preview.total_faces_in_ms_photos}</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-neon-purple font-mono">{(preview.avg_iou * 100).toFixed(0)}%</span>
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
                              Applied
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
                              title="View matched photos"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {canApply && (
                              <button
                                onClick={() => applySingle(preview)}
                                disabled={applyingId === preview.ms_person_id}
                                className="px-2 py-1 rounded bg-neon-green/20 text-neon-green text-xs font-medium hover:bg-neon-green/30 disabled:opacity-50"
                              >
                                {applyingId === preview.ms_person_id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Apply'
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      
                      {/* Expanded row */}
                      {isExpanded && (
                        <tr className="bg-void-800/30">
                          <td colSpan={8} className="p-4">
                            <FaceThumbnailGrid 
                              faces={preview.faces.map(unclusteredToFaceData)}
                              title="Sample Matched Faces"
                              showIoU={true}
                              showCenterDist={true}
                              showFaceRects={false}
                              defaultSortBy="iou_asc"
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
                                    faceSet = new Set(preview.faces.map(f => f.immich_face_id));
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
                                  next.set(preview.ms_person_id, new Set(preview.faces.map(f => f.immich_face_id)));
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

      {/* Photo Viewer Modal */}
      {viewingPhotos && (
        <FacePhotoViewer
          mode="unclustered"
          msPersonId={viewingPhotos.msPersonId}
          msPersonName={viewingPhotos.msPersonName}
          minIou={minIoU}
          maxCenterDist={maxCenterDist}
          onClose={() => setViewingPhotos(null)}
          startIndex={viewingPhotos.startIndex}
          initialSortBy={viewingPhotos.sortBy}
        />
      )}

      {contextLoading && (
        <div className="fixed inset-0 bg-void-950/50 flex items-center justify-center z-40">
          <div className="glass rounded-xl p-6 border border-white/10 flex items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-neon-green" />
            <span className="text-white">Updating...</span>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      <ProgressModal
        isOpen={showProgress}
        title="Assigning Faces to Immich"
        items={progressItems}
        currentIndex={progressIndex}
        onCancel={handleCancelProgress}
        canCancel={bulkApplying}
        subProgress={subProgress ? { ...subProgress, label: 'Face' } : undefined}
      />
    </div>
  );
}

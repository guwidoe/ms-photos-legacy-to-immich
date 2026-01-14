import { useState, useMemo, Fragment, useRef } from 'react';
import { 
  Users, 
  Loader2, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  ArrowRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown
} from 'lucide-react';
import { useMatching } from '../context/MatchingContext';
import { applyMatches, getImmichThumbnailUrl } from '../api';
import FacePhotoViewer from './FacePhotoViewer';
import ClusteredFaceGrid from './ClusteredFaceGrid';
import { type FaceSortBy } from './FaceThumbnailGrid';
import ProgressModal, { type ProgressItem } from './ProgressModal';
import type { PersonMatch } from '../types';

type FilterMode = 'all' | 'applicable' | 'already_named' | 'applied';
type SortField = 'name' | 'matches' | 'avg_iou' | 'confidence';
type SortDirection = 'asc' | 'desc';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';

export default function TransferNames() {
  const {
    lastRun,
    loading: contextLoading,
    clusterMatches,
    applicableMatches,
    minIoU,
    maxCenterDist,
    appliedChanges,
    markClusterRenamed,
  } = useMatching();

  const [filterMode, setFilterMode] = useState<FilterMode>('applicable');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [sortField, setSortField] = useState<SortField>('matches');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [viewingPhotos, setViewingPhotos] = useState<{match: PersonMatch; startIndex?: number; sortBy?: FaceSortBy} | null>(null);
  
  // Progress modal state
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const cancelRef = useRef(false);

  // Filter and sort matches
  const filteredMatches = useMemo(() => {
    if (!clusterMatches) return [];
    
    // Filter by mode
    let filtered = clusterMatches.filter(match => {
      const isApplied = appliedChanges.renamedClusters.has(match.immich_cluster_id);
      const isAlreadyNamed = !!match.immich_cluster_name;
      const isApplicable = !isAlreadyNamed;

      switch (filterMode) {
        case 'applicable':
          return isApplicable && !isApplied;
        case 'already_named':
          return isAlreadyNamed;
        case 'applied':
          return isApplied;
        case 'all':
        default:
          return true;
      }
    });

    // Filter by confidence
    if (confidenceFilter !== 'all') {
      filtered = filtered.filter(m => m.confidence === confidenceFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.ms_person_name.localeCompare(b.ms_person_name);
          break;
        case 'matches':
          cmp = a.face_matches - b.face_matches;
          break;
        case 'avg_iou':
          cmp = a.avg_iou - b.avg_iou;
          break;
        case 'confidence':
          const order = { high: 3, medium: 2, low: 1 };
          cmp = order[a.confidence] - order[b.confidence];
          break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [clusterMatches, filterMode, confidenceFilter, sortField, sortDirection, appliedChanges]);

  // Stats for filter badges
  const filterStats = useMemo(() => {
    if (!clusterMatches) return { all: 0, applicable: 0, alreadyNamed: 0, applied: 0 };
    
    const applied = clusterMatches.filter(m => appliedChanges.renamedClusters.has(m.immich_cluster_id)).length;
    const alreadyNamed = clusterMatches.filter(m => !!m.immich_cluster_name).length;
    const applicable = clusterMatches.filter(m => !m.immich_cluster_name && !appliedChanges.renamedClusters.has(m.immich_cluster_id)).length;
    
    return {
      all: clusterMatches.length,
      applicable,
      alreadyNamed,
      applied,
    };
  }, [clusterMatches, appliedChanges]);

  // Toggle expanded row
  const toggleExpanded = (rowKey: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
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
  const toggleSelection = (id: string) => {
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
    const ids = filteredMatches
      .filter(m => !appliedChanges.renamedClusters.has(m.immich_cluster_id) && !m.immich_cluster_name)
      .map(m => m.immich_cluster_id);
    setSelectedIds(new Set(ids));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Apply single match
  const applySingle = async (match: PersonMatch) => {
    setApplyingId(match.immich_cluster_id);
    setApplyError(null);
    
    try {
      const result = await applyMatches({
        matches: [{
          ms_person_id: match.ms_person_id,
          ms_person_name: match.ms_person_name,
          immich_cluster_id: match.immich_cluster_id,
        }],
        dry_run: false,
      });
      
      if (result.success_count > 0) {
        markClusterRenamed(match.immich_cluster_id);
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(match.immich_cluster_id);
          return next;
        });
      } else if (result.failed_count > 0) {
        setApplyError(result.results.failed[0]?.error || 'Failed to apply');
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplyingId(null);
    }
  };

  // Apply selected matches with progress tracking
  const applySelected = async () => {
    const matchesToApply = filteredMatches.filter(m => 
      selectedIds.has(m.immich_cluster_id) && 
      !appliedChanges.renamedClusters.has(m.immich_cluster_id) &&
      !m.immich_cluster_name
    );
    
    if (matchesToApply.length === 0) return;
    
    // Initialize progress
    cancelRef.current = false;
    const items: ProgressItem[] = matchesToApply.map(m => ({
      id: m.immich_cluster_id,
      name: m.ms_person_name,
      status: 'pending' as const,
    }));
    setProgressItems(items);
    setProgressIndex(0);
    setShowProgress(true);
    setBulkApplying(true);
    setApplyError(null);
    
    // Process one at a time
    for (let i = 0; i < matchesToApply.length; i++) {
      if (cancelRef.current) break;
      
      const match = matchesToApply[i];
      setProgressIndex(i);
      
      // Update current item to processing
      setProgressItems(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'processing' } : item
      ));
      
      try {
        const result = await applyMatches({
          matches: [{
            ms_person_id: match.ms_person_id,
            ms_person_name: match.ms_person_name,
            immich_cluster_id: match.immich_cluster_id,
          }],
          dry_run: false,
        });
        
        if (result.success_count > 0) {
          markClusterRenamed(match.immich_cluster_id);
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(match.immich_cluster_id);
            return next;
          });
          setProgressItems(prev => prev.map((item, idx) => 
            idx === i ? { ...item, status: 'success' } : item
          ));
        } else {
          setProgressItems(prev => prev.map((item, idx) => 
            idx === i ? { ...item, status: 'error', error: result.results.failed[0]?.error || 'Failed' } : item
          ));
        }
      } catch (err) {
        setProgressItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : item
        ));
      }
    }
    
    setBulkApplying(false);
  };
  
  // Handle cancel
  const handleCancelProgress = () => {
    if (bulkApplying) {
      cancelRef.current = true;
    }
    setShowProgress(false);
  };

  // Get row key
  const getRowKey = (match: PersonMatch) => `${match.ms_person_id}-${match.immich_cluster_id}`;

  // Show message if algorithm hasn't run
  if (!lastRun) {
    return (
      <div className="glass rounded-xl p-8 border border-white/5 text-center">
        <Users className="w-12 h-12 text-white/20 mx-auto mb-4" />
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
          <div className="p-3 rounded-xl bg-neon-cyan/10">
            <Users className="w-6 h-6 text-neon-cyan" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white mb-1">Transfer Names</h2>
            <p className="text-white/50 text-sm">
              Rename Immich clusters with names from MS Photos. Only clusters without names 
              can be renamed (applicable matches).
            </p>
          </div>
          
          {/* Stats badges */}
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-cyan">{filterStats.applicable}</p>
              <p className="text-white/40 text-xs">Applicable</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-green">{filterStats.applied}</p>
              <p className="text-white/40 text-xs">Applied</p>
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
              { id: 'applicable' as FilterMode, label: 'Applicable', count: filterStats.applicable },
              { id: 'all' as FilterMode, label: 'All', count: filterStats.all },
              { id: 'already_named' as FilterMode, label: 'Already Named', count: filterStats.alreadyNamed },
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

          {/* Confidence filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/40" />
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
              className="bg-void-700 text-white text-sm rounded px-2 py-1.5 border border-white/10"
            >
              <option value="all">All Confidence</option>
              <option value="high">High Only</option>
              <option value="medium">Medium Only</option>
              <option value="low">Low Only</option>
            </select>
          </div>

          {/* Expand/Collapse all */}
          <button
            onClick={() => {
              if (expandedRows.size > 0) {
                setExpandedRows(new Set());
              } else {
                setExpandedRows(new Set(filteredMatches.map(m => getRowKey(m))));
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
              Select All Applicable
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {applyError && (
        <div className="glass rounded-lg p-3 border border-red-500/30 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-red-400 text-sm">{applyError}</span>
          <button onClick={() => setApplyError(null)} className="ml-auto text-white/40 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Matches table */}
      <div className="glass rounded-xl border border-white/5 overflow-hidden">
        {filteredMatches.length === 0 ? (
          <div className="p-8 text-center">
            <Filter className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/50">No matches found for this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-void-800/50">
                  <th className="w-12 p-3">
                    {filterMode === 'applicable' && (() => {
                      const applicableCount = filteredMatches.filter(m => !appliedChanges.renamedClusters.has(m.immich_cluster_id) && !m.immich_cluster_name).length;
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
                  <th className="text-center text-xs text-white/50 font-medium p-3 w-12"></th>
                  <th className="text-center text-xs text-white/50 font-medium p-3 w-16">Thumbnail</th>
                  <th className="text-left text-xs text-white/50 font-medium p-3">Immich Cluster</th>
                  <th 
                    className="text-right text-xs text-white/50 font-medium p-3 cursor-pointer hover:text-white/80"
                    onClick={() => toggleSort('matches')}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Matches {getSortIcon('matches')}
                    </span>
                  </th>
                  <th 
                    className="text-right text-xs text-white/50 font-medium p-3 cursor-pointer hover:text-white/80"
                    onClick={() => toggleSort('avg_iou')}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Avg IoU {getSortIcon('avg_iou')}
                    </span>
                  </th>
                  <th 
                    className="text-right text-xs text-white/50 font-medium p-3 cursor-pointer hover:text-white/80"
                    onClick={() => toggleSort('confidence')}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Confidence {getSortIcon('confidence')}
                    </span>
                  </th>
                  <th className="text-center text-xs text-white/50 font-medium p-3">Status</th>
                  <th className="text-center text-xs text-white/50 font-medium p-3 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.map((match) => {
                  const rowKey = getRowKey(match);
                  const isExpanded = expandedRows.has(rowKey);
                  const isApplied = appliedChanges.renamedClusters.has(match.immich_cluster_id);
                  const isAlreadyNamed = !!match.immich_cluster_name;
                  const canApply = !isApplied && !isAlreadyNamed;

                  return (
                    <Fragment key={rowKey}>
                      <tr 
                        className={`border-b border-white/5 hover:bg-white/5 ${isApplied ? 'opacity-50' : ''}`}
                      >
                        <td className="p-3">
                          {canApply && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(match.immich_cluster_id)}
                              onChange={() => toggleSelection(match.immich_cluster_id)}
                              className="rounded border-white/30"
                            />
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-white font-medium">{match.ms_person_name}</span>
                        </td>
                        <td className="p-3 text-center">
                          <ArrowRight className="w-4 h-4 text-white/30 mx-auto" />
                        </td>
                        <td className="p-3">
                          <img 
                            src={getImmichThumbnailUrl(match.immich_cluster_id)}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover bg-void-700 mx-auto"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </td>
                        <td className="p-3">
                          {match.immich_cluster_name ? (
                            <span className="text-white/70">{match.immich_cluster_name}</span>
                          ) : (
                            <span className="text-white/40 italic">Unnamed cluster</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-white font-mono">{match.face_matches}</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-neon-purple font-mono">{(match.avg_iou * 100).toFixed(0)}%</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            match.confidence === 'high' ? 'bg-neon-green/20 text-neon-green' :
                            match.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {match.confidence}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {isApplied ? (
                            <span className="inline-flex items-center gap-1 text-xs text-neon-green">
                              <CheckCircle2 className="w-3 h-3" />
                              Applied
                            </span>
                          ) : isAlreadyNamed ? (
                            <span className="text-xs text-white/40">Already named</span>
                          ) : (
                            <span className="text-xs text-white/40">Pending</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => toggleExpanded(rowKey)}
                              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white"
                              title={isExpanded ? "Collapse details" : "Expand details"}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setViewingPhotos({ match })}
                              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white"
                              title="View matched photos"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {canApply && (
                              <button
                                onClick={() => applySingle(match)}
                                disabled={applyingId === match.immich_cluster_id}
                                className="px-2 py-1 rounded bg-neon-green/20 text-neon-green text-xs font-medium hover:bg-neon-green/30 disabled:opacity-50"
                              >
                                {applyingId === match.immich_cluster_id ? (
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
                          <td colSpan={10} className="p-4">
                            <div className="flex gap-6">
                              {/* Cluster thumbnail */}
                              <div className="flex-shrink-0">
                                <h4 className="text-white/60 text-xs mb-2">Immich Cluster</h4>
                                <div className="text-center">
                                  <img 
                                    src={getImmichThumbnailUrl(match.immich_cluster_id)}
                                    alt="Immich"
                                    className="w-20 h-20 rounded-lg object-cover bg-void-700"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
                                    }}
                                  />
                                </div>
                              </div>
                              
                              {/* Sample matched faces */}
                              <div className="flex-1 min-w-0">
                                <ClusteredFaceGrid
                                  msPersonId={match.ms_person_id}
                                  immichClusterId={match.immich_cluster_id}
                                  minIou={minIoU}
                                  maxCenterDist={maxCenterDist}
                                  onViewPhoto={(index, sortBy) => setViewingPhotos({ match, startIndex: index, sortBy })}
                                  onViewAll={() => setViewingPhotos({ match })}
                                />
                              </div>
                            </div>
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

      {/* Photo viewer modal */}
      {viewingPhotos && (
        <FacePhotoViewer
          mode="clustered"
          msPersonId={viewingPhotos.match.ms_person_id}
          msPersonName={viewingPhotos.match.ms_person_name}
          immichClusterId={viewingPhotos.match.immich_cluster_id}
          immichClusterName={viewingPhotos.match.immich_cluster_name || undefined}
          minIou={minIoU}
          maxCenterDist={maxCenterDist}
          startIndex={viewingPhotos.startIndex}
          initialSortBy={viewingPhotos.sortBy}
          confidence={viewingPhotos.match.confidence}
          onClose={() => setViewingPhotos(null)}
        />
      )}

      {contextLoading && (
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
        title="Transferring Names to Immich"
        items={progressItems}
        currentIndex={progressIndex}
        onCancel={handleCancelProgress}
        canCancel={bulkApplying}
      />
    </div>
  );
}

import { useState, useMemo } from 'react';
import { 
  GitMerge, 
  Loader2, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  ArrowRight,
  ChevronsUpDown
} from 'lucide-react';
import { useMatching } from '../context/MatchingContext';
import { getImmichThumbnailUrl } from '../api';
import type { MergeCandidate } from '../types';

// Note: Immich doesn't have a direct "merge clusters" API.
// This tab shows which clusters SHOULD be merged and provides guidance.
// The actual merge would need to be done in Immich UI or via face reassignment.

type FilterMode = 'all' | 'pending' | 'applied';

export default function MergeClusters() {
  const {
    lastRun,
    loading: contextLoading,
    mergeCandidates,
    stats,
    appliedChanges,
    markClustersMerged,
  } = useMatching();

  const [filterMode, setFilterMode] = useState<FilterMode>('pending');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  // Filter candidates based on current filter mode
  const filteredCandidates = useMemo(() => {
    if (!mergeCandidates) return [];
    
    return mergeCandidates.filter(candidate => {
      const isApplied = appliedChanges.mergedPeople.has(candidate.ms_person_id);

      switch (filterMode) {
        case 'pending':
          return !isApplied;
        case 'applied':
          return isApplied;
        case 'all':
        default:
          return true;
      }
    });
  }, [mergeCandidates, filterMode, appliedChanges]);

  // Stats for filter badges
  const filterStats = useMemo(() => {
    if (!mergeCandidates) return { all: 0, pending: 0, applied: 0 };
    
    const applied = mergeCandidates.filter(c => appliedChanges.mergedPeople.has(c.ms_person_id)).length;
    const pending = mergeCandidates.length - applied;
    
    return {
      all: mergeCandidates.length,
      pending,
      applied,
    };
  }, [mergeCandidates, appliedChanges]);

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

  // Mark as merged (manual acknowledgment - actual merge done in Immich)
  const markAsMerged = (personId: number) => {
    markClustersMerged(personId);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(personId);
      return next;
    });
  };

  // Mark selected as merged
  const markSelectedAsMerged = () => {
    selectedIds.forEach(id => {
      markClustersMerged(id);
    });
    setSelectedIds(new Set());
  };

  // Show message if algorithm hasn't run
  if (!lastRun) {
    return (
      <div className="glass rounded-xl p-8 border border-white/5 text-center">
        <GitMerge className="w-12 h-12 text-white/20 mx-auto mb-4" />
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
            <GitMerge className="w-6 h-6 text-neon-purple" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white mb-1">Merge Clusters</h2>
            <p className="text-white/50 text-sm">
              Identifies MS Photos people that match multiple Immich clusters. These clusters 
              should be merged in Immich. Mark them as done once you've merged them manually.
            </p>
          </div>
          
          {/* Stats badges */}
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-purple">{stats?.peopleWithSplitClusters || 0}</p>
              <p className="text-white/40 text-xs">People</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-neon-cyan">{stats?.totalClustersToMerge || 0}</p>
              <p className="text-white/40 text-xs">Clusters</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="glass rounded-xl p-4 border border-yellow-400/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <p className="text-white/80 text-sm font-medium">Manual Merge Required</p>
            <p className="text-white/50 text-sm mt-1">
              Immich doesn't have an API for merging clusters. Please use the Immich UI to merge 
              these clusters. Once done, mark them as complete here to track your progress.
            </p>
          </div>
        </div>
      </div>

      {/* Filter and actions bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Filter tabs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-void-800 rounded-lg p-1">
            {[
              { id: 'pending' as FilterMode, label: 'Pending', count: filterStats.pending },
              { id: 'all' as FilterMode, label: 'All', count: filterStats.all },
              { id: 'applied' as FilterMode, label: 'Completed', count: filterStats.applied },
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
                setExpandedRows(new Set(filteredCandidates.map(c => c.ms_person_id)));
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
          {selectedIds.size > 0 && (
            <>
              <span className="text-white/50 text-sm">{selectedIds.size} selected</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-white/50 hover:text-white"
              >
                Clear
              </button>
              <button
                onClick={markSelectedAsMerged}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neon-purple text-white font-medium text-sm hover:opacity-90"
              >
                <Check className="w-4 h-4" />
                Mark as Merged
              </button>
            </>
          )}
        </div>
      </div>

      {/* Candidates list */}
      <div className="glass rounded-xl border border-white/5 overflow-hidden">
        {filteredCandidates.length === 0 ? (
          <div className="p-8 text-center">
            <Filter className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/50">
              {filterMode === 'pending' 
                ? 'No clusters need merging!' 
                : 'No merge candidates found for this filter.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredCandidates.map((candidate) => {
              const isExpanded = expandedRows.has(candidate.ms_person_id);
              const isApplied = appliedChanges.mergedPeople.has(candidate.ms_person_id);
              const canMark = !isApplied;

              return (
                <div key={candidate.ms_person_id} className={isApplied ? 'opacity-50' : ''}>
                  {/* Main row */}
                  <div className="p-4 flex items-center gap-4 hover:bg-white/5">
                    {canMark && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(candidate.ms_person_id)}
                        onChange={() => toggleSelection(candidate.ms_person_id)}
                        className="rounded border-white/30"
                      />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-medium">{candidate.ms_person_name}</span>
                        <span className="text-white/40 text-sm">
                          {candidate.total_ms_faces} faces in MS Photos
                        </span>
                      </div>
                      
                      {/* Cluster preview */}
                      <div className="flex items-center gap-2 mt-2">
                        {candidate.immich_clusters.slice(0, 4).map((cluster, i) => (
                          <div key={cluster.cluster_id} className="flex items-center gap-1">
                            {i > 0 && <ArrowRight className="w-3 h-3 text-white/30" />}
                            <div className="flex items-center gap-2 px-2 py-1 bg-void-700 rounded text-xs">
                              <img 
                                src={getImmichThumbnailUrl(cluster.cluster_id)}
                                alt=""
                                className="w-6 h-6 rounded object-cover bg-void-600"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <span className="text-white/70">
                                {cluster.cluster_name || 'Unnamed'}
                              </span>
                              <span className="text-white/40">
                                ({cluster.matched_faces})
                              </span>
                            </div>
                          </div>
                        ))}
                        {candidate.immich_clusters.length > 4 && (
                          <span className="text-white/40 text-xs">
                            +{candidate.immich_clusters.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status & actions */}
                    <div className="flex items-center gap-3">
                      {isApplied ? (
                        <span className="inline-flex items-center gap-1 text-xs text-neon-green">
                          <CheckCircle2 className="w-3 h-3" />
                          Merged
                        </span>
                      ) : (
                        <>
                          <span className="text-xs text-neon-purple font-mono">
                            {candidate.immich_clusters.length} clusters
                          </span>
                          <button
                            onClick={() => markAsMerged(candidate.ms_person_id)}
                            className="px-2 py-1 rounded bg-neon-purple/20 text-neon-purple text-xs font-medium hover:bg-neon-purple/30"
                          >
                            Mark Done
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => toggleExpanded(candidate.ms_person_id)}
                        className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white"
                        title={isExpanded ? "Collapse details" : "Expand details"}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  
                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-void-800/30">
                      <div className="pt-4">
                        <h4 className="text-white/60 text-xs mb-3">All Clusters to Merge</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {candidate.immich_clusters.map((cluster) => (
                            <div 
                              key={cluster.cluster_id}
                              className="p-3 bg-void-700 rounded-lg"
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <img 
                                  src={getImmichThumbnailUrl(cluster.cluster_id)}
                                  alt=""
                                  className="w-12 h-12 rounded-lg object-cover bg-void-600"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <div>
                                  <p className="text-white text-sm font-medium">
                                    {cluster.cluster_name || 'Unnamed'}
                                  </p>
                                  <p className="text-white/40 text-xs">
                                    {cluster.matched_faces} matched / {cluster.total_faces} total
                                  </p>
                                </div>
                              </div>
                              <div className="text-xs text-white/30 font-mono truncate">
                                {cluster.cluster_id}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Merge instructions */}
                        <div className="mt-4 p-3 bg-void-700/50 rounded-lg">
                          <p className="text-white/60 text-sm">
                            <strong>To merge in Immich:</strong> Go to People → select one cluster → 
                            click the three-dot menu → "Merge People" → select the other clusters.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {contextLoading && (
        <div className="fixed inset-0 bg-void-950/50 flex items-center justify-center z-40">
          <div className="glass rounded-xl p-6 border border-white/10 flex items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-neon-purple" />
            <span className="text-white">Updating...</span>
          </div>
        </div>
      )}
    </div>
  );
}

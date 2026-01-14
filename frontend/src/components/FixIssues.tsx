import { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Loader2, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  ChevronsUpDown
} from 'lucide-react';
import { useMatching } from '../context/MatchingContext';
import { getImmichThumbnailUrl } from '../api';
import type { ClusterIssue } from '../types';

// Note: Fixing issues typically requires removing faces from clusters via Immich UI
// This tab identifies issues and allows tracking of resolved ones

type FilterMode = 'all' | 'errors' | 'warnings' | 'fixed';

export default function FixIssues() {
  const {
    lastRun,
    loading: contextLoading,
    validationIssues,
    stats,
    appliedChanges,
    markClusterFixed,
  } = useMatching();

  const [filterMode, setFilterMode] = useState<FilterMode>('errors');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Toggle expanded row
  const toggleExpanded = (id: string) => {
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

  // Filter issues based on current filter mode
  const filteredIssues = useMemo(() => {
    if (!validationIssues) return [];
    
    return validationIssues.filter(issue => {
      const isFixed = appliedChanges.fixedClusters.has(issue.immich_cluster_id);

      switch (filterMode) {
        case 'errors':
          return issue.severity === 'error' && !isFixed;
        case 'warnings':
          return issue.severity === 'warning' && !isFixed;
        case 'fixed':
          return isFixed;
        case 'all':
        default:
          return !isFixed;
      }
    });
  }, [validationIssues, filterMode, appliedChanges]);

  // Stats for filter badges
  const filterStats = useMemo(() => {
    if (!validationIssues) return { all: 0, errors: 0, warnings: 0, fixed: 0 };
    
    const fixed = validationIssues.filter(i => appliedChanges.fixedClusters.has(i.immich_cluster_id)).length;
    const remaining = validationIssues.filter(i => !appliedChanges.fixedClusters.has(i.immich_cluster_id));
    const errors = remaining.filter(i => i.severity === 'error').length;
    const warnings = remaining.filter(i => i.severity === 'warning').length;
    
    return {
      all: remaining.length,
      errors,
      warnings,
      fixed,
    };
  }, [validationIssues, appliedChanges]);

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

  // Mark as fixed (manual acknowledgment - actual fix done in Immich)
  const markAsFixed = (clusterId: string) => {
    markClusterFixed(clusterId);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(clusterId);
      return next;
    });
  };

  // Mark selected as fixed
  const markSelectedAsFixed = () => {
    selectedIds.forEach(id => {
      markClusterFixed(id);
    });
    setSelectedIds(new Set());
  };

  // Show message if algorithm hasn't run
  if (!lastRun) {
    return (
      <div className="glass rounded-xl p-8 border border-white/5 text-center">
        <AlertTriangle className="w-12 h-12 text-white/20 mx-auto mb-4" />
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
          <div className="p-3 rounded-xl bg-yellow-400/10">
            <AlertTriangle className="w-6 h-6 text-yellow-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white mb-1">Fix Issues</h2>
            <p className="text-white/50 text-sm">
              Clusters with potential errors detected. These clusters contain faces that match 
              different MS Photos people, suggesting possible mis-clustering.
            </p>
          </div>
          
          {/* Stats badges */}
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-2xl font-semibold text-red-400">{filterStats.errors}</p>
              <p className="text-white/40 text-xs">Errors</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-yellow-400">{filterStats.warnings}</p>
              <p className="text-white/40 text-xs">Warnings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="glass rounded-xl p-4 border border-yellow-400/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <p className="text-white/80 text-sm font-medium">Manual Fix Required</p>
            <p className="text-white/50 text-sm mt-1">
              To fix clustering errors, go to the cluster in Immich UI, identify the misplaced face(s), 
              and reassign them to the correct person. Mark issues as fixed here once resolved.
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
              { id: 'errors' as FilterMode, label: 'Errors', count: filterStats.errors, color: 'text-red-400' },
              { id: 'warnings' as FilterMode, label: 'Warnings', count: filterStats.warnings, color: 'text-yellow-400' },
              { id: 'all' as FilterMode, label: 'All Pending', count: filterStats.all, color: '' },
              { id: 'fixed' as FilterMode, label: 'Fixed', count: filterStats.fixed, color: 'text-neon-green' },
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
                <span className={`ml-1.5 text-xs opacity-60 ${tab.color}`}>({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Expand/Collapse all */}
          <button
            onClick={() => {
              if (expandedRows.size > 0) {
                setExpandedRows(new Set());
              } else {
                setExpandedRows(new Set(filteredIssues.map(i => i.immich_cluster_id)));
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
                onClick={markSelectedAsFixed}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neon-green text-white font-medium text-sm hover:opacity-90"
              >
                <Check className="w-4 h-4" />
                Mark as Fixed
              </button>
            </>
          )}
        </div>
      </div>

      {/* Issues list */}
      <div className="glass rounded-xl border border-white/5 overflow-hidden">
        {filteredIssues.length === 0 ? (
          <div className="p-8 text-center">
            {filterMode === 'errors' || filterMode === 'warnings' ? (
              <>
                <CheckCircle2 className="w-8 h-8 text-neon-green mx-auto mb-3" />
                <p className="text-white/50">No {filterMode} found!</p>
              </>
            ) : (
              <>
                <Filter className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/50">No issues found for this filter.</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredIssues.map((issue) => {
              const isExpanded = expandedRows.has(issue.immich_cluster_id);
              const isFixed = appliedChanges.fixedClusters.has(issue.immich_cluster_id);
              const canMark = !isFixed;

              return (
                <div key={issue.immich_cluster_id} className={isFixed ? 'opacity-50' : ''}>
                  {/* Main row */}
                  <div className="p-4 flex items-center gap-4 hover:bg-white/5">
                    {canMark && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(issue.immich_cluster_id)}
                        onChange={() => toggleSelection(issue.immich_cluster_id)}
                        className="rounded border-white/30"
                      />
                    )}
                    
                    {/* Severity icon */}
                    <div className={`p-1.5 rounded ${
                      issue.severity === 'error' ? 'bg-red-500/20' : 'bg-yellow-400/20'
                    }`}>
                      {issue.severity === 'error' ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      )}
                    </div>
                    
                    {/* Cluster info */}
                    <img 
                      src={getImmichThumbnailUrl(issue.immich_cluster_id)}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-void-700"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-medium">
                          {issue.immich_cluster_name || 'Unnamed Cluster'}
                        </span>
                        <span className="text-white/40 text-sm">
                          {issue.total_faces_in_cluster} faces
                        </span>
                      </div>
                      
                      {/* Matched people preview */}
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="text-white/40">Matches:</span>
                        {issue.ms_people_matched.slice(0, 3).map((person, i) => (
                          <span key={person.person_id} className="text-white/60">
                            {person.person_name} ({person.face_count})
                            {i < Math.min(issue.ms_people_matched.length, 3) - 1 && ', '}
                          </span>
                        ))}
                        {issue.ms_people_matched.length > 3 && (
                          <span className="text-white/40">
                            +{issue.ms_people_matched.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status & actions */}
                    <div className="flex items-center gap-3">
                      {isFixed ? (
                        <span className="inline-flex items-center gap-1 text-xs text-neon-green">
                          <CheckCircle2 className="w-3 h-3" />
                          Fixed
                        </span>
                      ) : (
                        <>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            issue.severity === 'error' 
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-yellow-400/20 text-yellow-400'
                          }`}>
                            {issue.severity}
                          </span>
                          <button
                            onClick={() => markAsFixed(issue.immich_cluster_id)}
                            className="px-2 py-1 rounded bg-neon-green/20 text-neon-green text-xs font-medium hover:bg-neon-green/30"
                          >
                            Mark Fixed
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => toggleExpanded(issue.immich_cluster_id)}
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
                      <div className="pt-4 space-y-4">
                        {/* Issue explanation */}
                        <div className="p-3 bg-void-700/50 rounded-lg">
                          <p className="text-white/70 text-sm">
                            <strong>Issue:</strong> This Immich cluster contains faces that match 
                            {issue.ms_people_matched.length} different MS Photos people. This suggests 
                            that Immich may have incorrectly grouped different people together.
                          </p>
                        </div>
                        
                        {/* Matched people breakdown */}
                        <div>
                          <h4 className="text-white/60 text-xs mb-3">People Found in This Cluster</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {issue.ms_people_matched.map((person) => (
                              <div 
                                key={person.person_id}
                                className="p-3 bg-void-700 rounded-lg flex items-center gap-3"
                              >
                                <div className={`w-2 h-2 rounded-full ${
                                  person.face_count > issue.matched_faces / 2 
                                    ? 'bg-neon-green' 
                                    : 'bg-yellow-400'
                                }`} />
                                <div>
                                  <p className="text-white text-sm font-medium">{person.person_name}</p>
                                  <p className="text-white/40 text-xs">{person.face_count} matched faces</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Sample photos */}
                        {issue.sample_photos.length > 0 && (
                          <div>
                            <h4 className="text-white/60 text-xs mb-2">Sample Photos</h4>
                            <div className="flex flex-wrap gap-1 text-xs text-white/50">
                              {issue.sample_photos.slice(0, 5).map((photo, i) => (
                                <span key={i} className="px-2 py-1 bg-void-700 rounded">{photo}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Fix instructions */}
                        <div className="p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-lg">
                          <p className="text-yellow-400/80 text-sm">
                            <strong>How to fix:</strong>
                          </p>
                          <ol className="mt-2 text-white/60 text-sm list-decimal list-inside space-y-1">
                            <li>Go to this cluster in Immich</li>
                            <li>Find faces that don't belong (minority group)</li>
                            <li>Click on those faces and reassign to correct person</li>
                            <li>Mark as fixed here once done</li>
                          </ol>
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
            <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
            <span className="text-white">Updating...</span>
          </div>
        </div>
      )}
    </div>
  );
}

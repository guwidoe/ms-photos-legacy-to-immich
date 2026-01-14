/**
 * MatchingContext - Shared state for the entire migration tool.
 * 
 * This context holds all matching data loaded once from the consolidated endpoint,
 * plus global threshold settings. All tabs filter from this shared state.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type {
  RawFaceMatch,
  PersonMatch,
  PersonApplyPreview,
  ClusterIssue,
  MergeCandidate,
  HistogramData,
  PercentileData,
  CumulativeData,
} from '../types';
import { runFullAnalysis } from '../api';

// ============================================================================
// Types
// ============================================================================

interface AppliedChanges {
  // Transfer Names: cluster IDs that have been renamed
  renamedClusters: Set<string>;
  // Assign Faces: MS person IDs whose unclustered faces have been assigned
  assignedPeople: Set<number>;
  // Merge Clusters: MS person IDs whose clusters have been merged
  mergedPeople: Set<number>;
  // Fix Issues: cluster IDs whose issues have been fixed
  fixedClusters: Set<string>;
}

interface MatchingState {
  // Loading states
  loading: boolean;
  algorithmRunning: boolean;
  lastRun: Date | null;
  error: string | null;

  // Raw analytics data (from single algorithm run)
  rawMatches: RawFaceMatch[];
  histograms: {
    iou: HistogramData;
    center_dist: HistogramData;
  } | null;
  percentiles: {
    iou: PercentileData;
    center_dist: PercentileData;
  } | null;
  suggestedThresholds: {
    iou: number;
    center_dist: number;
  } | null;
  cumulative: {
    iou: CumulativeData;
    center_dist: CumulativeData;
  } | null;
  
  // Processed data (computed based on thresholds)
  clusterMatches: PersonMatch[];
  applicableMatches: PersonMatch[];
  unclusteredPreviews: PersonApplyPreview[];
  validationIssues: ClusterIssue[];
  mergeCandidates: MergeCandidate[];

  // Stats
  stats: {
    totalRawMatches: number;
    commonPhotos: number;
    msPeopleCount: number;
    immichClustersCount: number;
    // Filtered stats
    totalMatches: number;
    applicableMatches: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    // Unclustered stats
    totalUnclusteredFaces: number;
    peopleWithUnclusteredMatches: number;
    // Validation stats
    clustersWithIssues: number;
    validationErrors: number;
    validationWarnings: number;
    // Merge stats
    peopleWithSplitClusters: number;
    totalClustersToMerge: number;
  } | null;

  // Active thresholds (currently applied)
  minIoU: number;
  maxCenterDist: number;

  // Pending thresholds (slider values, not yet applied)
  pendingMinIoU: number;
  pendingMaxCenterDist: number;
  thresholdsDirty: boolean;

  // Applied changes tracking (persisted to localStorage)
  appliedChanges: AppliedChanges;
}

interface MatchingContextValue extends MatchingState {
  // Actions
  runAlgorithm: () => Promise<void>;
  setPendingMinIoU: (value: number) => void;
  setPendingMaxCenterDist: (value: number) => void;
  applyThresholds: () => Promise<void>;
  markClusterRenamed: (clusterId: string) => void;
  markPersonAssigned: (personId: number) => void;
  markClustersMerged: (personId: number) => void;
  markClusterFixed: (clusterId: string) => void;
  resetAppliedChanges: () => void;
}

// ============================================================================
// Context
// ============================================================================

const MatchingContext = createContext<MatchingContextValue | null>(null);

const STORAGE_KEY = 'migration-tool-applied-changes';
const THRESHOLDS_STORAGE_KEY = 'migration-tool-thresholds';

function loadAppliedChanges(): AppliedChanges {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        renamedClusters: new Set(parsed.renamedClusters || []),
        assignedPeople: new Set(parsed.assignedPeople || []),
        mergedPeople: new Set(parsed.mergedPeople || []),
        fixedClusters: new Set(parsed.fixedClusters || []),
      };
    }
  } catch (e) {
    console.error('Failed to load applied changes from localStorage:', e);
  }
  return {
    renamedClusters: new Set(),
    assignedPeople: new Set(),
    mergedPeople: new Set(),
    fixedClusters: new Set(),
  };
}

function saveAppliedChanges(changes: AppliedChanges) {
  try {
    const toStore = {
      renamedClusters: Array.from(changes.renamedClusters),
      assignedPeople: Array.from(changes.assignedPeople),
      mergedPeople: Array.from(changes.mergedPeople),
      fixedClusters: Array.from(changes.fixedClusters),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.error('Failed to save applied changes to localStorage:', e);
  }
}

function loadThresholds(): { minIoU: number; maxCenterDist: number } {
  try {
    const stored = localStorage.getItem(THRESHOLDS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        minIoU: parsed.minIoU ?? 0.3,
        maxCenterDist: parsed.maxCenterDist ?? 0.4,
      };
    }
  } catch (e) {
    console.error('Failed to load thresholds from localStorage:', e);
  }
  return { minIoU: 0.3, maxCenterDist: 0.4 };
}

function saveThresholds(minIoU: number, maxCenterDist: number) {
  try {
    localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify({ minIoU, maxCenterDist }));
  } catch (e) {
    console.error('Failed to save thresholds to localStorage:', e);
  }
}

// ============================================================================
// Provider
// ============================================================================

export function MatchingProvider({ children }: { children: ReactNode }) {
  const storedThresholds = loadThresholds();
  
  const [state, setState] = useState<MatchingState>({
    loading: false,
    algorithmRunning: false,
    lastRun: null,
    error: null,
    rawMatches: [],
    histograms: null,
    percentiles: null,
    suggestedThresholds: null,
    cumulative: null,
    clusterMatches: [],
    applicableMatches: [],
    unclusteredPreviews: [],
    validationIssues: [],
    mergeCandidates: [],
    stats: null,
    minIoU: storedThresholds.minIoU,
    maxCenterDist: storedThresholds.maxCenterDist,
    pendingMinIoU: storedThresholds.minIoU,
    pendingMaxCenterDist: storedThresholds.maxCenterDist,
    thresholdsDirty: false,
    appliedChanges: loadAppliedChanges(),
  });

  // Fetch all data using the consolidated endpoint
  const fetchAllData = useCallback(async (minIoU: number, maxCenterDist: number, isInitialRun: boolean = false) => {
    setState(prev => ({
      ...prev,
      loading: !isInitialRun,
      algorithmRunning: isInitialRun,
      error: null,
    }));

    try {
      // Use consolidated endpoint
      const result = await runFullAnalysis({
        min_iou: minIoU,
        max_center_dist: maxCenterDist,
      });

      // Clear applied changes only on initial run
      let appliedChanges = state.appliedChanges;
      if (isInitialRun) {
        appliedChanges = {
          renamedClusters: new Set(),
          assignedPeople: new Set(),
          mergedPeople: new Set(),
          fixedClusters: new Set(),
        };
        saveAppliedChanges(appliedChanges);
      }

      setState(prev => ({
        ...prev,
        loading: false,
        algorithmRunning: false,
        lastRun: isInitialRun ? new Date() : prev.lastRun,
        rawMatches: result.analytics.raw_matches,
        histograms: result.analytics.histograms,
        percentiles: result.analytics.percentiles,
        suggestedThresholds: result.analytics.suggested_thresholds,
        cumulative: result.analytics.cumulative,
        clusterMatches: result.matches.all_matches,
        applicableMatches: result.matches.applicable,
        unclusteredPreviews: result.unclustered.previews,
        validationIssues: result.validation.issues,
        mergeCandidates: result.merge.candidates,
        stats: {
          totalRawMatches: result.stats.total_raw_matches,
          commonPhotos: result.stats.common_photos,
          msPeopleCount: result.stats.ms_people_count,
          immichClustersCount: result.stats.immich_clusters_count,
          totalMatches: result.stats.total_matches,
          applicableMatches: result.stats.applicable_matches,
          highConfidence: result.stats.high_confidence,
          mediumConfidence: result.stats.medium_confidence,
          lowConfidence: result.stats.low_confidence,
          totalUnclusteredFaces: result.stats.total_unclustered_faces,
          peopleWithUnclusteredMatches: result.stats.people_with_unclustered_matches,
          clustersWithIssues: result.stats.clusters_with_issues,
          validationErrors: result.stats.validation_errors,
          validationWarnings: result.stats.validation_warnings,
          peopleWithSplitClusters: result.stats.people_with_split_clusters,
          totalClustersToMerge: result.stats.total_clusters_to_merge,
        },
        minIoU: minIoU,
        maxCenterDist: maxCenterDist,
        pendingMinIoU: minIoU,
        pendingMaxCenterDist: maxCenterDist,
        thresholdsDirty: false,
        appliedChanges,
      }));
    } catch (e) {
      console.error('Failed to fetch data:', e);
      setState(prev => ({
        ...prev,
        loading: false,
        algorithmRunning: false,
        error: e instanceof Error ? e.message : 'Failed to run algorithm',
      }));
    }
  }, [state.appliedChanges]);

  // Run the full algorithm (initial run)
  const runAlgorithm = useCallback(async () => {
    await fetchAllData(state.pendingMinIoU, state.pendingMaxCenterDist, true);
  }, [state.pendingMinIoU, state.pendingMaxCenterDist, fetchAllData]);

  // Pending threshold setters (just update slider values, don't trigger fetch)
  const setPendingMinIoU = useCallback((value: number) => {
    setState(prev => ({ 
      ...prev, 
      pendingMinIoU: value,
      thresholdsDirty: value !== prev.minIoU || prev.pendingMaxCenterDist !== prev.maxCenterDist,
    }));
  }, []);

  const setPendingMaxCenterDist = useCallback((value: number) => {
    setState(prev => ({ 
      ...prev, 
      pendingMaxCenterDist: value,
      thresholdsDirty: prev.pendingMinIoU !== prev.minIoU || value !== prev.maxCenterDist,
    }));
  }, []);

  // Apply thresholds and fetch new filtered data
  const applyThresholds = useCallback(async () => {
    const { pendingMinIoU, pendingMaxCenterDist } = state;
    
    // Save thresholds to localStorage
    saveThresholds(pendingMinIoU, pendingMaxCenterDist);
    
    // Fetch filtered data (this also updates minIoU/maxCenterDist)
    await fetchAllData(pendingMinIoU, pendingMaxCenterDist, false);
  }, [state.pendingMinIoU, state.pendingMaxCenterDist, fetchAllData]);

  // Applied changes tracking
  const markClusterRenamed = useCallback((clusterId: string) => {
    setState(prev => {
      const newChanges = {
        ...prev.appliedChanges,
        renamedClusters: new Set([...prev.appliedChanges.renamedClusters, clusterId]),
      };
      saveAppliedChanges(newChanges);
      return { ...prev, appliedChanges: newChanges };
    });
  }, []);

  const markPersonAssigned = useCallback((personId: number) => {
    setState(prev => {
      const newChanges = {
        ...prev.appliedChanges,
        assignedPeople: new Set([...prev.appliedChanges.assignedPeople, personId]),
      };
      saveAppliedChanges(newChanges);
      return { ...prev, appliedChanges: newChanges };
    });
  }, []);

  const markClustersMerged = useCallback((personId: number) => {
    setState(prev => {
      const newChanges = {
        ...prev.appliedChanges,
        mergedPeople: new Set([...prev.appliedChanges.mergedPeople, personId]),
      };
      saveAppliedChanges(newChanges);
      return { ...prev, appliedChanges: newChanges };
    });
  }, []);

  const markClusterFixed = useCallback((clusterId: string) => {
    setState(prev => {
      const newChanges = {
        ...prev.appliedChanges,
        fixedClusters: new Set([...prev.appliedChanges.fixedClusters, clusterId]),
      };
      saveAppliedChanges(newChanges);
      return { ...prev, appliedChanges: newChanges };
    });
  }, []);

  const resetAppliedChanges = useCallback(() => {
    const emptyChanges: AppliedChanges = {
      renamedClusters: new Set(),
      assignedPeople: new Set(),
      mergedPeople: new Set(),
      fixedClusters: new Set(),
    };
    saveAppliedChanges(emptyChanges);
    setState(prev => ({ ...prev, appliedChanges: emptyChanges }));
  }, []);

  const value: MatchingContextValue = {
    ...state,
    runAlgorithm,
    setPendingMinIoU,
    setPendingMaxCenterDist,
    applyThresholds,
    markClusterRenamed,
    markPersonAssigned,
    markClustersMerged,
    markClusterFixed,
    resetAppliedChanges,
  };

  return (
    <MatchingContext.Provider value={value}>
      {children}
    </MatchingContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useMatching() {
  const context = useContext(MatchingContext);
  if (!context) {
    throw new Error('useMatching must be used within a MatchingProvider');
  }
  return context;
}

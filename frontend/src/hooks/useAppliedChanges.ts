/**
 * useAppliedChanges - Hook for managing applied changes persistence.
 * 
 * This is a utility hook that provides direct access to localStorage-persisted
 * applied changes tracking. The main state is managed by MatchingContext,
 * but this hook can be used for checking/querying applied status.
 */

const STORAGE_KEY = 'migration-tool-applied-changes';

export interface AppliedChanges {
  renamedClusters: Set<string>;
  assignedPeople: Set<number>;
  mergedPeople: Set<number>;
  fixedClusters: Set<string>;
}

export function loadAppliedChanges(): AppliedChanges {
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

export function saveAppliedChanges(changes: AppliedChanges): void {
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

export function clearAppliedChanges(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear applied changes from localStorage:', e);
  }
}

/**
 * Check if a cluster has been renamed in the current session.
 */
export function isClusterRenamed(clusterId: string): boolean {
  const changes = loadAppliedChanges();
  return changes.renamedClusters.has(clusterId);
}

/**
 * Check if a person's unclustered faces have been assigned.
 */
export function isPersonAssigned(personId: number): boolean {
  const changes = loadAppliedChanges();
  return changes.assignedPeople.has(personId);
}

/**
 * Check if a person's clusters have been merged.
 */
export function areClustersMerged(personId: number): boolean {
  const changes = loadAppliedChanges();
  return changes.mergedPeople.has(personId);
}

/**
 * Check if a cluster's issues have been fixed.
 */
export function isClusterFixed(clusterId: string): boolean {
  const changes = loadAppliedChanges();
  return changes.fixedClusters.has(clusterId);
}

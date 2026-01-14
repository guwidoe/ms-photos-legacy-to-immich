// API Client

import type { SystemStatus, MatchingResult, ValidationResult, ApplyResult, PersonMatch, MergeAnalysisResult, MatchDetailsResult, UnmatchedResult, AnalyticsResult, UnclusteredPreviewResult, ApplyUnclusteredResult, FullAnalysisResult, UnclusteredDetailsResult, UnrecognizedPreviewResult, UnrecognizedDetailsResult, CreateFaceItem, CreateFacesResult, AppConfig, ConfigUpdateResult } from './types';

const API_BASE = '/api';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `API error: ${response.status}`);
  }

  return response.json();
}

// Health & Status
export async function getHealth(): Promise<{ status: string; service: string }> {
  return fetchAPI('/health');
}

export async function getStatus(): Promise<SystemStatus> {
  return fetchAPI('/status');
}

export async function getStats(): Promise<{
  ms_photos: SystemStatus['ms_photos'] | null;
  immich: SystemStatus['immich_db'] | null;
}> {
  return fetchAPI('/stats');
}

// Matching
export async function runMatching(params: {
  algorithm: 'face_position' | 'definitive';
  min_iou?: number;
  max_center_dist?: number;
  min_evidence?: number;
}): Promise<MatchingResult> {
  return fetchAPI('/matches/run', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function previewMatches(): Promise<{
  total_matches: number;
  applicable_matches: number;
  top_matches: PersonMatch[];
  stats: MatchingResult['stats'];
}> {
  return fetchAPI('/matches/preview');
}

export async function getMatchDetails(
  msPersonId: number,
  immichClusterId: string,
  minIou: number = 0.3,
  maxCenterDist: number = 0.4
): Promise<MatchDetailsResult> {
  return fetchAPI(`/matches/details/${msPersonId}/${immichClusterId}?min_iou=${minIou}&max_center_dist=${maxCenterDist}`);
}

// Unmatched MS Photos people
export async function getUnmatchedPeople(minIou: number = 0.3, maxCenterDist: number = 0.4): Promise<UnmatchedResult> {
  return fetchAPI(`/matches/unmatched?min_iou=${minIou}&max_center_dist=${maxCenterDist}`);
}

// Analytics - raw match data with histograms
export async function getMatchAnalytics(): Promise<AnalyticsResult> {
  return fetchAPI('/matches/analytics');
}

// Full Analysis - consolidated endpoint for all data in one call
export async function runFullAnalysis(params: {
  min_iou?: number;
  max_center_dist?: number;
}): Promise<FullAnalysisResult> {
  return fetchAPI('/algorithm/run', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Photo URLs
export function getImmichPhotoUrl(assetId: string, size: 'preview' | 'thumbnail' = 'preview'): string {
  return `${API_BASE}/photos/immich/${assetId}?size=${size}`;
}

// Cluster Validation
export async function runValidation(params: {
  min_iou?: number;
  max_center_dist?: number;
  min_faces?: number;
}): Promise<ValidationResult> {
  return fetchAPI('/validation/run', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Merge Analysis
export async function runMergeAnalysis(params: {
  min_iou?: number;
  max_center_dist?: number;
  min_matches?: number;
}): Promise<MergeAnalysisResult> {
  return fetchAPI('/validation/merge-analysis', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Thumbnails
export function getMSThumbnailUrl(personId: number): string {
  return `${API_BASE}/thumbnails/ms/${personId}`;
}

export function getImmichThumbnailUrl(personId: string): string {
  return `${API_BASE}/thumbnails/immich/${personId}`;
}

// Apply matches (rename clusters)
export async function applyMatches(params: {
  matches: {
    ms_person_id: number;
    ms_person_name: string;
    immich_cluster_id: string;
  }[];
  dry_run: boolean;
}): Promise<ApplyResult> {
  return fetchAPI('/apply', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Unclustered faces - preview what can be assigned
export async function previewUnclusteredMatches(params: {
  min_iou?: number;
  max_center_dist?: number;
}): Promise<UnclusteredPreviewResult> {
  return fetchAPI('/apply/unclustered/preview', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Unclustered faces - get detailed match data for photo viewer
export async function getUnclusteredDetails(
  msPersonId: number,
  minIou: number = 0.3,
  maxCenterDist: number = 0.4
): Promise<UnclusteredDetailsResult> {
  return fetchAPI(`/apply/unclustered/details/${msPersonId}?min_iou=${minIou}&max_center_dist=${maxCenterDist}`);
}

// Unclustered faces - apply assignments
export async function applyUnclusteredFaces(params: {
  items: {
    ms_person_id: number;
    ms_person_name: string;
    face_ids: string[];
  }[];
  dry_run: boolean;
}): Promise<ApplyUnclusteredResult> {
  return fetchAPI('/apply/unclustered', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============================================================================
// Create Faces (Unrecognized) - for faces MS Photos has but Immich didn't detect
// ============================================================================

// Preview unrecognized faces
export async function previewUnrecognizedFaces(params: {
  min_iou?: number;
}): Promise<UnrecognizedPreviewResult> {
  return fetchAPI('/create-faces/preview', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Get detailed unrecognized face data for photo viewer
export async function getUnrecognizedDetails(
  msPersonId: number,
  minIou: number = 0.3
): Promise<UnrecognizedDetailsResult> {
  return fetchAPI(`/create-faces/details/${msPersonId}?min_iou=${minIou}`);
}

// Create faces in Immich
export async function createFaces(params: {
  ms_person_id: number;
  ms_person_name: string;
  faces: CreateFaceItem[];
  dry_run: boolean;
}): Promise<CreateFacesResult> {
  return fetchAPI('/create-faces/apply', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============================================================================
// Configuration API - for manual settings via UI
// ============================================================================

// Get current configuration
export async function getConfig(): Promise<AppConfig> {
  return fetchAPI('/config');
}

// Update MS Photos database path
export async function updateMSPhotosDbPath(path: string): Promise<ConfigUpdateResult> {
  return fetchAPI('/config/ms-photos-db', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

// Update Immich API settings
export async function updateImmichApi(params: {
  url?: string;
  api_key?: string;
}): Promise<ConfigUpdateResult> {
  return fetchAPI('/config/immich-api', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Update Immich database settings
export async function updateImmichDb(params: {
  host?: string;
  port?: number;
  name?: string;
  user?: string;
  password?: string;
}): Promise<ConfigUpdateResult> {
  return fetchAPI('/config/immich-db', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

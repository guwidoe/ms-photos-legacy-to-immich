// API Response Types

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
  total_persons?: number;
  named_persons?: number;
  unique_named_persons?: number;
  unnamed_persons?: number;
  total_faces?: number;
  total_items?: number;
  total_assets?: number;
}

export interface SystemStatus {
  ms_photos: ConnectionStatus;
  immich_db: ConnectionStatus;
  immich_api: ConnectionStatus;
}

// Configuration Types
export interface ConfigOverrides {
  ms_photos_db: boolean;
  immich_api_url: boolean;
  immich_api_key: boolean;
  immich_db: boolean;
}

export interface AppConfig {
  ms_photos_db: string;
  ms_photos_db_path: string;
  immich_api_url: string;
  immich_api_key_set: boolean;
  immich_db_host: string;
  immich_db_port: number;
  immich_db_name: string;
  immich_db_user: string;
  immich_db_password_set: boolean;
  has_overrides: ConfigOverrides;
}

export interface ConfigUpdateResult {
  success: boolean;
  status: ConnectionStatus;
  config: AppConfig;
}

export interface PersonMatch {
  ms_person_id: number;
  ms_person_name: string;
  immich_cluster_id: string;
  immich_cluster_name: string | null;
  face_matches: number;
  avg_iou: number;
  avg_center_dist: number;
  confidence: 'high' | 'medium' | 'low';
  sample_photos: string[];
}

export interface MatchingResult {
  all_matches: PersonMatch[];
  applicable: PersonMatch[];
  stats: {
    ms_people_count?: number;
    immich_clusters_count?: number;
    common_photos?: number;
    total_matches: number;
    applicable_matches: number;
    high_confidence?: number;
    medium_confidence?: number;
    low_confidence?: number;
  };
}

export interface ClusterIssue {
  immich_cluster_id: string;
  immich_cluster_name: string | null;
  total_faces_in_cluster: number;
  matched_faces: number;
  ms_people_matched: {
    person_id: number;
    person_name: string;
    face_count: number;
  }[];
  severity: 'error' | 'warning' | 'ok';
  sample_photos: string[];
}

export interface ValidationResult {
  total_clusters_checked: number;
  clusters_with_issues: number;
  clusters_ok: number;
  issues: ClusterIssue[];
  summary: {
    errors: number;
    warnings: number;
    total_checked: number;
  };
}

export interface ApplyResult {
  dry_run: boolean;
  total: number;
  success_count: number;
  failed_count: number;
  results: {
    success: { person_id: string; name: string; status: string }[];
    failed: { person_id: string; name: string; error: string }[];
    skipped: { person_id: string; name: string; reason: string }[];
  };
}

export interface MergeClusterInfo {
  cluster_id: string;
  cluster_name: string | null;
  matched_faces: number;
  total_faces: number;
}

export interface MergeCandidate {
  ms_person_id: number;
  ms_person_name: string;
  total_ms_faces: number;
  immich_clusters: MergeClusterInfo[];
  confidence: number;
}

export interface MergeAnalysisResult {
  total_ms_people_analyzed: number;
  potential_faces_to_merge: number;
  merge_candidates: MergeCandidate[];
  summary: {
    people_with_split_clusters: number;
    total_clusters_to_merge: number;
    potential_faces_affected: number;
  };
}

// Detailed face match for photo viewer
export interface PhotoFaceMatch {
  filename: string;
  immich_asset_id: string;
  immich_original_path: string;
  ms_item_path: string;
  
  ms_person_id: number;
  ms_person_name: string;
  ms_rect_x1: number;
  ms_rect_y1: number;
  ms_rect_x2: number;
  ms_rect_y2: number;
  
  immich_cluster_id: string;
  immich_cluster_name: string | null;
  immich_rect_x1: number;
  immich_rect_y1: number;
  immich_rect_x2: number;
  immich_rect_y2: number;
  
  iou: number;
  center_dist: number;
  image_width: number;
  image_height: number;
  file_size: number;
}

export interface MatchDetailsResult {
  ms_person_id: number;
  immich_cluster_id: string;
  total_matches: number;
  matches: PhotoFaceMatch[];
}

// Unmatched MS Photos person
export interface UnmatchedPerson {
  ms_person_id: number;
  ms_person_name: string;
  face_count: number;
  sample_files: string[];
}

export interface UnmatchedResult {
  unmatched: UnmatchedPerson[];
  stats: {
    total_ms_people: number;
    matched_people: number;
    unmatched_people: number;
    match_rate: number;
  };
}

// Analytics types
export interface RawFaceMatch {
  ms_person_id: number;
  ms_person_name: string;
  immich_cluster_id: string;
  immich_cluster_name: string | null;
  iou: number;
  center_dist: number;
  filename: string;
}

export interface HistogramData {
  bins: number[];
  counts: number[];
  edges: number[];
}

export interface PercentileData {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  mean: number;
}

export interface CumulativeData {
  thresholds: number[];
  percent_above?: number[];
  percent_below?: number[];
}

export interface AnalyticsResult {
  raw_matches: RawFaceMatch[];
  histograms: {
    iou: HistogramData;
    center_dist: HistogramData;
  };
  percentiles: {
    iou: PercentileData;
    center_dist: PercentileData;
  };
  suggested_thresholds: {
    iou: number;
    center_dist: number;
  };
  cumulative: {
    iou: CumulativeData;
    center_dist: CumulativeData;
  };
  stats: {
    total_raw_matches: number;
    common_photos: number;
    ms_people_count: number;
    immich_clusters_count: number;
  };
}

// Unclustered face matching types
export interface UnclusteredFacePreview {
  immich_face_id: string;
  immich_asset_id: string;
  filename: string;
  iou: number;
  center_dist: number;
  // Rectangle data for drawing boxes on thumbnails
  ms_rect_x1?: number;
  ms_rect_y1?: number;
  ms_rect_x2?: number;
  ms_rect_y2?: number;
  immich_rect_x1?: number;
  immich_rect_y1?: number;
  immich_rect_x2?: number;
  immich_rect_y2?: number;
}

// Detailed unclustered face match for photo viewer
export interface UnclusteredFaceDetail {
  filename: string;
  immich_asset_id: string;
  immich_face_id: string;
  file_size: number;
  
  ms_person_id: number;
  ms_person_name: string;
  ms_rect_x1: number;
  ms_rect_y1: number;
  ms_rect_x2: number;
  ms_rect_y2: number;
  
  immich_rect_x1: number;
  immich_rect_y1: number;
  immich_rect_x2: number;
  immich_rect_y2: number;
  
  iou: number;
  center_dist: number;
}

export interface UnclusteredDetailsResult {
  ms_person_id: number;
  ms_person_name: string;
  total_matches: number;
  matches: UnclusteredFaceDetail[];
}

export interface PersonApplyPreview {
  ms_person_id: number;
  ms_person_name: string;
  existing_immich_person_id: string | null;
  existing_immich_person_name: string | null;
  needs_person_creation: boolean;
  face_count: number;
  total_faces_in_ms_photos: number;
  avg_iou: number;
  faces: UnclusteredFacePreview[];
  sample_filenames: string[];
}

export interface UnclusteredPreviewResult {
  previews: PersonApplyPreview[];
  stats: {
    total_ms_people_with_matches: number;
    total_faces_to_assign: number;
    total_unclustered_faces_in_immich: number;
    common_photos_with_unclustered: number;
    people_needing_creation: number;
    people_already_exist: number;
  };
}

export interface ApplyUnclusteredResult {
  dry_run: boolean;
  total_items: number;
  total_faces: number;
  people_created_count: number;
  faces_assigned_count: number;
  failed_count: number;
  results: {
    people_created: { name: string; status: string; person_id: string | null }[];
    faces_assigned: { face_id: string; person_name: string; status: string }[];
    failed: { face_id?: string; name?: string; error: string }[];
  };
}

// ============================================================================
// Full Analysis Result (consolidated endpoint)
// ============================================================================

export interface FullAnalysisResult {
  analytics: {
    raw_matches: RawFaceMatch[];
    histograms: {
      iou: HistogramData;
      center_dist: HistogramData;
    };
    percentiles: {
      iou: PercentileData;
      center_dist: PercentileData;
    };
    suggested_thresholds: {
      iou: number;
      center_dist: number;
    };
    cumulative: {
      iou: CumulativeData;
      center_dist: CumulativeData;
    };
  };
  matches: {
    all_matches: PersonMatch[];
    applicable: PersonMatch[];
  };
  unclustered: {
    previews: PersonApplyPreview[];
    stats: {
      total_faces_to_assign: number;
      total_ms_people_with_matches: number;
      total_unclustered_faces_in_immich: number;
      common_photos_with_unclustered: number;
      people_needing_creation: number;
      people_already_exist: number;
    };
  };
  merge: {
    candidates: MergeCandidate[];
    summary: {
      people_with_split_clusters: number;
      total_clusters_to_merge: number;
      potential_faces_affected: number;
    };
  };
  validation: {
    issues: ClusterIssue[];
    summary: {
      errors: number;
      warnings: number;
      total_checked: number;
    };
    total_clusters_checked: number;
    clusters_with_issues: number;
    clusters_ok: number;
  };
  stats: {
    total_raw_matches: number;
    common_photos: number;
    ms_people_count: number;
    ms_unique_people_count?: number;
    immich_clusters_count: number;
    immich_unique_people_count?: number;
    total_matches: number;
    applicable_matches: number;
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
    total_unclustered_faces: number;
    people_with_unclustered_matches: number;
    people_with_split_clusters: number;
    total_clusters_to_merge: number;
    clusters_with_issues: number;
    validation_errors: number;
    validation_warnings: number;
  };
  thresholds: {
    min_iou: number;
    max_center_dist: number;
  };
}

// ============================================================================
// Create Faces (Unrecognized faces) Types
// ============================================================================

export interface UnrecognizedFacePreview {
  immich_asset_id: string;
  filename: string;
  ms_rect_x1: number;
  ms_rect_y1: number;
  ms_rect_x2: number;
  ms_rect_y2: number;
  image_width: number;
  image_height: number;
}

export interface UnrecognizedPersonPreview {
  ms_person_id: number;
  ms_person_name: string;
  existing_immich_person_id: string | null;
  existing_immich_person_name: string | null;
  needs_person_creation: boolean;
  face_count: number;
  total_faces_in_ms_photos: number;
  faces: UnrecognizedFacePreview[];
  sample_filenames: string[];
}

export interface UnrecognizedPreviewResult {
  previews: UnrecognizedPersonPreview[];
  stats: {
    total_people_with_unrecognized: number;
    total_faces_to_create: number;
    total_photos_with_unrecognized: number;
    common_photos_checked: number;
    people_needing_creation: number;
    people_already_exist: number;
  };
}

export interface UnrecognizedFaceDetail {
  filename: string;
  immich_asset_id: string;
  file_size: number;
  
  ms_person_id: number;
  ms_person_name: string;
  ms_rect_x1: number;
  ms_rect_y1: number;
  ms_rect_x2: number;
  ms_rect_y2: number;
  
  image_width: number;
  image_height: number;
}

export interface UnrecognizedDetailsResult {
  ms_person_id: number;
  ms_person_name: string;
  total_faces: number;
  faces: UnrecognizedFaceDetail[];
}

export interface CreateFaceItem {
  asset_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image_width: number;
  image_height: number;
}

export interface CreateFacesResult {
  dry_run: boolean;
  success: boolean;
  total_faces: number;
  faces_created_count: number;
  failed_count: number;
  error?: string;
  results: {
    person_created: { name: string; status: string; person_id: string | null } | null;
    faces_created: { asset_id: string; status: string }[];
    failed: { asset_id: string; error: string }[];
  };
}

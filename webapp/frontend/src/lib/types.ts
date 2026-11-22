/**
 * API types — derived from webapp/SPEC.md (v1).
 * All endpoints are prefixed with /api/v1. Descriptive, strictly typed shapes.
 */

export type Role = 'admin' | 'clinician' | 'researcher';
export type SessionStatus = 'COLLECTING' | 'VALID' | 'INVALID' | 'COMPLETED';
export type SessionLabel = 'ADHD' | 'CONTROL' | 'UNKNOWN';
export type QualityStatus = 'VALID' | 'INVALID';
export type AssessmentKind = 'CONNERS' | 'IVA2' | 'PARENT_RATING';

export interface DetailError {
  detail: string | Array<{ loc?: string[]; msg: string; type?: string }>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

/* ---------------- Auth ---------------- */
export interface User {
  id: number | string;
  email: string;
  name: string;
  role: Role;
  clinic_id: number | string | null;
  clinic_name?: string | null;
  is_active?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  user: User;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}

/* ---------------- Clinics / Users ---------------- */
export interface Clinic {
  id: number | string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface ClinicCreate {
  name: string;
  code: string;
  is_active?: boolean;
}

export interface UserCreate {
  email: string;
  password: string;
  name: string;
  role: Role;
  clinic_id: number | string | null;
}

export interface UserPatch {
  is_active?: boolean;
  role?: Role;
  clinic_id?: number | string | null;
}

/* ---------------- Participants ---------------- */
export interface Participant {
  id: number | string;
  clinic_id: number | string | null;
  research_id: string;
  birth_year: number;
  age: number;
  sex: string;
  consent_guardian: boolean;
  consent_assent: boolean;
  consent_date: string;
  created_at?: string;
}

export interface ParticipantCreate {
  research_id: string;
  birth_year: number;
  age: number;
  sex: string;
  clinic_id: number | string | null;
  consent_guardian: boolean;
  consent_assent: boolean;
  consent_date: string;
}

export interface ParticipantPatch extends Partial<ParticipantCreate> {}

export interface ParticipantListParams {
  search?: string;
  clinic_id?: number | string;
  skip?: number;
  limit?: number;
}

/* ---------------- Calibration & gaze samples ---------------- */
export interface CalibrationPoint {
  /** target screen coordinate in pixels */
  target_x: number;
  target_y: number;
  /** median 4-feature vector captured at this point */
  feature: number[];
  /** achieved screen-space error in pixels */
  error_px?: number;
}

export interface Calibration {
  /** 2 x 3 affine coefficient matrix ([1, avg iris x, avg iris y]); legacy 2 x 15 also accepted */
  coef: number[][];
  mean_error_px: number;
  median_error_px: number;
  points: CalibrationPoint[];
  created_at: string;
}

export interface GazeSample {
  timestamp: number;
  frame_id: number;
  gaze_x: number;
  gaze_y: number;
  gaze_valid: boolean;
  left_iris_x: number;
  left_iris_y: number;
  right_iris_x: number;
  right_iris_y: number;
  /** true when gaze is on-screen but outside content — not tracking loss */
  off_screen?: boolean;
}

export interface SamplesBatchRequest {
  stimulus: string;
  samples: GazeSample[];
  quality_partial?: Record<string, unknown>;
}

/* ---------------- Sessions ---------------- */
export interface SessionCreate {
  participant_id: number | string;
  label: SessionLabel;
  stimulus_set: string;
  screen_width: number;
  screen_height: number;
  calibration: Calibration;
  started_at: string;
  client_meta?: Record<string, unknown>;
  idempotency_key: string;
}

export interface SessionListParams {
  participant_id?: number | string;
  status?: SessionStatus | QualityStatus;
  clinic_id?: number | string;
}

export interface QualityReport {
  status: QualityStatus;
  valid_gaze_ratio: number;
  tracking_loss_ratio: number;
  mean_brightness: number;
  brightness_cv: number;
  max_tracking_gap_s: number;
  calibration_error_px: number | null;
  reasons: string[];
  per_stimulus?: Record<string, Record<string, unknown>>;
}

export interface Features {
  valid_gaze_ratio: number;
  gaze_x_mean: number;
  gaze_y_mean: number;
  gaze_x_std: number;
  gaze_y_std: number;
  scanpath_length_px: number;
  mean_gaze_step_px: number;
  mean_gaze_velocity_px_s: number;
  fixation_count: number;
  mean_fixation_ms: number;
  saccade_count: number;
  aoi_enter_counts: number[] | Record<string, number>;
  extractor_version?: string;
  [key: string]: unknown;
}

export interface XAIEntry {
  feature: string;
  contribution: number;
}

export interface Risk {
  probability: number | null;
  version: string;
  feature_version?: string;
  xai?: XAIEntry[];
  disclaimer?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface Session {
  id: number | string;
  participant_id: number | string;
  label: SessionLabel;
  status: SessionStatus;
  stimulus_set: string;
  screen_width: number;
  screen_height: number;
  calibration_json?: Calibration | null;
  started_at: string;
  ended_at?: string | null;
  client_meta_json?: Record<string, unknown> | null;
  created_at?: string;
  quality?: QualityReport | null;
  features?: Features | null;
  risk?: Risk | null;
  xai?: XAIEntry[] | null;
}

export interface CompleteRequest {
  ended_at: string;
  quality: Record<string, unknown>;
}

export interface CompleteResponse {
  id: number | string;
  status: SessionStatus;
  quality: QualityReport | null;
  features: Features | null;
  risk: Risk | null;
}

export interface HeatmapSeries {
  stimulus: string;
  points: Array<[number, number]>;
}

export interface SessionEvent {
  id: number | string;
  session_id: number | string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/* ---------------- Assessments ---------------- */
export interface Assessment {
  id: number | string;
  participant_id: number | string;
  kind: AssessmentKind;
  version: string | null;
  /** Backend stores scores as a JSON string in `scores_json`. */
  scores_json: string;
  /** Only present on objects constructed locally; prefer `assessmentScores()`. */
  scores?: Record<string, unknown>;
  assessed_at: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface AssessmentCreate {
  kind: AssessmentKind;
  version: string;
  scores: Record<string, unknown>;
  assessed_at: string;
  notes?: string;
}

/* ---------------- Parent rating scale (SNAP-IV) ---------------- */
export interface ParentRatingDefinition {
  instrument: string;
  title_fa: string;
  disclaimer_fa: string;
  likert: Array<{ value: number; label_fa: string }>;
  sections: Array<{
    key: string;
    title_fa: string;
    description_fa: string;
    item_ids: number[];
  }>;
  items: Array<{ id: number; section: string; text_fa: string }>;
}

export interface ParentRatingCreate {
  instrument: 'SNAP-IV-26';
  answers: Array<{ item_id: number; value: number }>;
  notes?: string;
  assessed_at?: string;
}

/* ---------------- Models ---------------- */
export interface ModelMetrics {
  auc: number;
  accuracy: number;
  sensitivity: number;
  specificity: number;
  f1: number;
  calibration: number | Record<string, unknown>;
  confusion_matrix: number[][] | Record<string, number>;
  n_participants: number;
  feature_names: string[];
  model_version: string;
  [key: string]: unknown;
}

export interface ModelVersion {
  version: string;
  metrics: ModelMetrics;
  features?: string[];
  created_at?: string;
  artifact_path?: string | null;
  [key: string]: unknown;
}

export interface TrainRequest {
  min_labeled_sessions: number;
}

export interface PredictRequest {
  session_id: number | string;
}

export interface PredictResponse {
  risk: Risk;
  version: string;
  xai: XAIEntry[];
  disclaimer: string;
}

/* ---------------- Reports (10 sections, chapter 3) ---------------- */
export type ReportSectionStatus = 'OK' | 'NOT_CALCULATED' | 'NO_DATA';

export interface ReportSectionItem {
  label: string;
  value?: string | number | null;
}

/**
 * Report sections are accepted in two shapes so the UI stays compatible with
 * both the frontend-oriented `{items,note}` form and the backend's
 * `{key,content,status}` form. `content` may be prose or key/value pairs.
 */
export interface ReportSection {
  key?: string;
  title: string;
  status?: ReportSectionStatus;
  items?: ReportSectionItem[];
  content?: string | ReportSectionItem[];
  note?: string;
}

export interface SessionReport {
  session_id: number | string;
  sections: ReportSection[];
  generated_at?: string;
  limitations?: string;
  conclusion?: string;
  [key: string]: unknown;
}

/* ---------------- Sync / offline ---------------- */
export type SyncEventType =
  | 'SESSION_CREATE'
  | 'SESSION_SAMPLES'
  | 'SESSION_COMPLETE'
  | 'ASSESSMENT_CREATE'
  | 'PARTICIPANT_CREATE';

export interface SyncEvent {
  idempotency_key: string;
  type: SyncEventType;
  payload: Record<string, unknown>;
}

export interface SyncBatchRequest {
  events: SyncEvent[];
}

export interface SyncResult {
  idempotency_key: string;
  status: 'ok' | 'duplicate' | 'error' | string;
  resource_id?: number | string | null;
  detail?: string;
}

export interface SyncBatchResponse {
  results: SyncResult[];
}

export interface SyncStatus {
  pending: number;
  processed: number;
  last_sync_at?: string | null;
  [key: string]: unknown;
}

/* ---------------- Admin config / audit ---------------- */
export interface QualityConfig {
  min_valid_gaze_ratio: number;
  max_tracking_gap_s: number;
  min_brightness: number;
  max_brightness: number;
  max_calibration_error_px: number;
  [key: string]: number;
}

export interface AuditLog {
  id: number | string;
  user_id: number | string;
  action: string;
  entity: string;
  entity_id?: string | null;
  meta?: Record<string, unknown>;
  created_at: string;
  [key: string]: unknown;
}

export interface AuditParams {
  user_id?: number | string;
  from?: string;
  to?: string;
  action?: string;
}

/** Derived feature vector from MediaPipe — identical to legacy gaze_engine.py. */
export type GazeFeatureVector = [number, number, number, number];

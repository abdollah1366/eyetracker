import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import type {
  Assessment,
  AssessmentCreate,
  AuditLog,
  AuditParams,
  ChangePasswordRequest,
  Clinic,
  ClinicCreate,
  CptProtocol,
  CptSubmission,
  CompleteRequest,
  CompleteResponse,
  DetailError,
  GlobalHeatmap,
  HeatmapSeries,
  LoginRequest,
  LoginResponse,
  ModelMetrics,
  ModelReadiness,
  ModelVersion,
  Paginated,
  Participant,
  ParticipantCreate,
  ParticipantListParams,
  ParticipantPatch,
  ParentRatingCreate,
  ParentRatingDefinition,
  PredictRequest,
  PredictResponse,
  QualityConfig,
  SamplesBatchRequest,
  Session,
  SessionCreate,
  SessionEvent,
  SessionListParams,
  SessionReport,
  SyncBatchRequest,
  SyncBatchResponse,
  SyncStatus,
  TrainRequest,
  User,
  UserCreate,
  UserPatch,
} from './types';

export const TOKEN_KEY = 'adht_token';
export const REFRESH_KEY = 'adht_refresh_token';
export const LOGOUT_EVENT = 'auth:logout';

export const getAccessToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_KEY);
export const setTokens = (access: string, refresh?: string | null): void => {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else localStorage.removeItem(REFRESH_KEY);
};
export const clearTokens = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

/* ---------------- interceptors ---------------- */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    // The v1 contract has no dedicated refresh endpoint; attempt the conventional
    // route defensively. If the backend does not expose it we fail closed (logout).
    const res = await axios.post<{ access_token: string; refresh_token?: string }>(
      `${BASE_URL}/auth/refresh`,
      { refresh_token: refresh },
      { headers: { 'Content-Type': 'application/json' } },
    );
    const access = res.data?.access_token;
    if (access) setTokens(access, res.data?.refresh_token ?? refresh);
    return access ?? null;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface RetryableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<DetailError>) => {
    const original = error.config as RetryableRequest | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retry) {
      original._retry = true;
      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
      }
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      clearTokens();
      window.dispatchEvent(new CustomEvent(LOGOUT_EVENT));
    }
    return Promise.reject(error);
  },
);

/** Convert API errors to a human-readable message (Persian-safe fallback). */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<DetailError>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join('، ');
    if (error.response?.status === 401) return 'احراز هویت نامعتبر است. لطفاً دوباره وارد شوید.';
    if (error.response?.status === 403) return 'شما اجازه دسترسی به این عملیات را ندارید.';
    if (error.message === 'Network Error') return 'ارتباط با سرور برقرار نشد.';
    return error.message || 'خطای ناشناخته رخ داد.';
  }
  return 'خطای ناشناخته رخ داد.';
}

/* ---------------- typed endpoints ---------------- */
async function unwrap<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await api.request<T>(config);
  return res.data;
}

export const authApi = {
  login: (body: LoginRequest) =>
    unwrap<LoginResponse>({ method: 'POST', url: '/auth/login', data: body }),
  me: () => unwrap<User>({ method: 'GET', url: '/auth/me' }),
  changePassword: (body: ChangePasswordRequest) =>
    unwrap<{ detail: string }>({ method: 'POST', url: '/auth/change-password', data: body }),
};

export const clinicsApi = {
  list: () => unwrap<Clinic[]>({ method: 'GET', url: '/clinics' }),
  create: (body: ClinicCreate) =>
    unwrap<Clinic>({ method: 'POST', url: '/clinics', data: body }),
  patch: (id: number | string, body: Partial<ClinicCreate>) =>
    unwrap<Clinic>({ method: 'PATCH', url: `/clinics/${id}`, data: body }),
};

export const usersApi = {
  list: () => unwrap<User[]>({ method: 'GET', url: '/users' }),
  create: (body: UserCreate) => unwrap<User>({ method: 'POST', url: '/users', data: body }),
  patch: (id: number | string, body: UserPatch) =>
    unwrap<User>({ method: 'PATCH', url: `/users/${id}`, data: body }),
};

export const participantsApi = {
  list: (params: ParticipantListParams = {}) =>
    unwrap<Paginated<Participant>>({ method: 'GET', url: '/participants', params }),
  get: (id: number | string) =>
    unwrap<Participant>({ method: 'GET', url: `/participants/${id}` }),
  create: (body: ParticipantCreate) =>
    unwrap<Participant>({ method: 'POST', url: '/participants', data: body }),
  patch: (id: number | string, body: ParticipantPatch) =>
    unwrap<Participant>({ method: 'PATCH', url: `/participants/${id}`, data: body }),
  sessions: (id: number | string) =>
    unwrap<Session[]>({ method: 'GET', url: `/participants/${id}/sessions` }),
  assessments: (id: number | string) =>
    unwrap<Assessment[]>({ method: 'GET', url: `/participants/${id}/assessments` }),
};

export const sessionsApi = {
  list: (params: SessionListParams = {}) =>
    unwrap<Session[] | Paginated<Session>>({ method: 'GET', url: '/sessions', params }),
  get: (id: number | string) =>
    unwrap<Session>({ method: 'GET', url: `/sessions/${id}` }),
  create: (body: SessionCreate) =>
    unwrap<Session>({ method: 'POST', url: '/sessions', data: body }),
  addSamples: (id: number | string, body: SamplesBatchRequest) =>
    unwrap<{ accepted: number }>({ method: 'POST', url: `/sessions/${id}/samples`, data: body }),
  complete: (id: number | string, body: CompleteRequest) =>
    unwrap<CompleteResponse>({ method: 'POST', url: `/sessions/${id}/complete`, data: body }),
  heatmap: (id: number | string) =>
    unwrap<HeatmapSeries[]>({ method: 'GET', url: `/sessions/${id}/heatmap` }),
  /** Mean density over all valid gaze points, across every session and stimulus. */
  globalHeatmap: (stimulus?: string) =>
    unwrap<GlobalHeatmap>({
      method: 'GET',
      url: '/heatmap/global',
      params: stimulus ? { stimulus } : undefined,
    }),
  events: (id: number | string) =>
    unwrap<SessionEvent[]>({ method: 'GET', url: `/sessions/${id}/events` }),
};

export const assessmentsApi = {
  create: (participantId: number | string, body: AssessmentCreate) =>
    unwrap<Assessment>({
      method: 'POST',
      url: `/participants/${participantId}/assessments`,
      data: body,
    }),
  remove: (id: number | string) =>
    unwrap<{ detail: string }>({ method: 'DELETE', url: `/assessments/${id}` }),
};

/** SNAP-IV item bank and server-scored submission, stored on the participant. */
export const ratingScalesApi = {
  parentDefinition: () =>
    unwrap<ParentRatingDefinition>({ method: 'GET', url: '/rating-scales/parent' }),
  submitParent: (participantId: number | string, body: ParentRatingCreate) =>
    unwrap<Assessment>({
      method: 'POST',
      url: `/participants/${participantId}/parent-rating`,
      data: body,
    }),
};

/** Open IVA-style CPT: server-owned protocol + server-side scoring. */
export const cptApi = {
  protocol: () => unwrap<CptProtocol>({ method: 'GET', url: '/cpt/protocol' }),
  submit: (participantId: number | string, body: CptSubmission) =>
    unwrap<Assessment>({
      method: 'POST',
      url: `/participants/${participantId}/iva-cpt`,
      data: body,
    }),
};

export const modelsApi = {
  list: () => unwrap<ModelVersion[]>({ method: 'GET', url: '/models' }),
  readiness: () => unwrap<ModelReadiness>({ method: 'GET', url: '/models/readiness' }),
  train: (body: TrainRequest) =>
    unwrap<ModelMetrics>({ method: 'POST', url: '/models/train', data: body }),
  get: (version: string) =>
    unwrap<ModelVersion>({ method: 'GET', url: `/models/${encodeURIComponent(version)}` }),
  predict: (version: string, body: PredictRequest) =>
    unwrap<PredictResponse>({
      method: 'POST',
      url: `/models/${encodeURIComponent(version)}/predict`,
      data: body,
    }),
};

export const reportsApi = {
  session: (id: number | string) =>
    unwrap<SessionReport>({ method: 'GET', url: `/reports/session/${id}` }),
};

export const syncApi = {
  batch: (body: SyncBatchRequest) =>
    unwrap<SyncBatchResponse>({ method: 'POST', url: '/sync/batch', data: body }),
  status: () => unwrap<SyncStatus>({ method: 'GET', url: '/sync/status' }),
};

export const adminApi = {
  getQualityConfig: () =>
    unwrap<QualityConfig>({ method: 'GET', url: '/config/quality' }),
  patchQualityConfig: (body: Partial<QualityConfig>) =>
    unwrap<QualityConfig>({ method: 'PATCH', url: '/config/quality', data: body }),
  audit: (params: AuditParams = {}) =>
    unwrap<Paginated<AuditLog> | AuditLog[]>({ method: 'GET', url: '/audit', params }),
};

/** Normalize list endpoints that may return either an array or {items,total}. */
export function asItems<T>(res: T[] | Paginated<T>): T[] {
  return Array.isArray(res) ? res : res.items ?? [];
}

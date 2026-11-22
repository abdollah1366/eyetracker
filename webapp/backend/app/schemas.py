"""Pydantic v2 request/response models for every API endpoint."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.config import settings

Role = Literal["admin", "clinician", "researcher"]
SessionLabel = Literal["ADHD", "CONTROL", "UNKNOWN"]
SessionStatus = Literal["COLLECTING", "VALID", "INVALID"]
QualityStatus = Literal["VALID", "INVALID"]


class XaiContribution(BaseModel):
    """Signed contribution of one feature to a model output."""

    feature: str
    contribution: float


class RiskInfo(BaseModel):
    """Risk payload returned whenever a real prediction exists."""

    probability: float | None = None
    version: str = ""
    xai: list[XaiContribution] = Field(default_factory=list)
    disclaimer: str | None = None
    feature_version: str | None = None
    created_at: datetime | None = None


class ORMModel(BaseModel):
    """Base for response models constructed from SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.strip().lower()


class UserRef(ORMModel):
    id: int
    email: str
    name: str
    role: str
    clinic_id: int | None = None
    clinic_name: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None
    user: UserRef | None = None


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None
    user: UserRef | None = None


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


# ---------------------------------------------------------------------------
# Clinics / Users
# ---------------------------------------------------------------------------
class ClinicBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=50)
    is_active: bool = True


class ClinicCreate(ClinicBase):
    pass


class ClinicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=1, max_length=50)
    is_active: bool | None = None


class ClinicOut(ORMModel):
    id: int
    name: str
    code: str
    is_active: bool


class ClinicList(BaseModel):
    items: list[ClinicOut]
    total: int
    skip: int = 0
    limit: int = 100


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    role: Role = "clinician"
    clinic_id: int | None = None

    @field_validator("email")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.strip().lower()


class UserUpdate(BaseModel):
    is_active: bool | None = None
    role: Role | None = None
    clinic_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)


class UserOut(ORMModel):
    id: int
    clinic_id: int | None
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime


class UserList(BaseModel):
    items: list[UserOut]
    total: int
    skip: int = 0
    limit: int = 100


# ---------------------------------------------------------------------------
# Participants
# ---------------------------------------------------------------------------
class ParticipantCreate(BaseModel):
    research_id: str = Field(min_length=1, max_length=100)
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    age: int | None = Field(default=None, ge=0, le=120)
    sex: str | None = Field(default=None, max_length=20)
    clinic_id: int | None = None
    consent_guardian: bool = False
    consent_assent: bool = False
    consent_date: datetime | None = None


class ParticipantUpdate(BaseModel):
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    age: int | None = Field(default=None, ge=0, le=120)
    sex: str | None = Field(default=None, max_length=20)
    clinic_id: int | None = None
    consent_guardian: bool | None = None
    consent_assent: bool | None = None
    consent_date: datetime | None = None


class ParticipantOut(ORMModel):
    id: int
    clinic_id: int | None
    research_id: str
    birth_year: int | None
    age: int | None
    sex: str | None
    consent_guardian: bool
    consent_assent: bool
    consent_date: datetime | None
    created_at: datetime


class ParticipantList(BaseModel):
    items: list[ParticipantOut]
    total: int
    skip: int = 0
    limit: int = 100


# ---------------------------------------------------------------------------
# Sessions / samples / quality
# ---------------------------------------------------------------------------
class CalibrationIn(BaseModel):
    coef: list[list[float]] = Field(default_factory=list)
    mean_error_px: float | None = None
    median_error_px: float | None = None
    # Points may be coordinate pairs or richer {target, feature, error} objects.
    points: list[Any] | None = None
    created_at: datetime | None = None


class SessionCreate(BaseModel):
    participant_id: int
    label: SessionLabel = "UNKNOWN"
    stimulus_set: str | None = Field(default=None, max_length=100)
    screen_width: int = Field(gt=0, le=100_000)
    screen_height: int = Field(gt=0, le=100_000)
    calibration: CalibrationIn | None = None
    started_at: datetime | None = None
    client_meta: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str = Field(min_length=1, max_length=120)


class SampleIn(BaseModel):
    timestamp: float | None = None
    frame_id: int | None = None
    gaze_x: float | None = None
    gaze_y: float | None = None
    gaze_valid: bool = False
    # Optional explicit off-screen flag; when absent it is derived from screen bounds.
    off_screen: bool | None = None
    left_iris_x: float | None = None
    left_iris_y: float | None = None
    right_iris_x: float | None = None
    right_iris_y: float | None = None
    brightness: float | None = None


class QualityPartialIn(BaseModel):
    brightness: float | None = None
    # The SPA reports the frame brightness mean under this key.
    mean_brightness: float | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class SampleBatchIn(BaseModel):
    stimulus: str = Field(min_length=1, max_length=120)
    samples: list[SampleIn] = Field(default_factory=list)
    quality_partial: QualityPartialIn | None = None


class SamplesAccepted(BaseModel):
    accepted: int


class QualityInput(BaseModel):
    """Optional client-supplied brightness; server recomputes the gate itself."""

    brightness: float | None = None
    mean_brightness: float | None = None
    calibration_error_px: float | None = None
    notes: str | None = None


class CompleteRequest(BaseModel):
    ended_at: datetime | None = None
    quality: QualityInput | None = None


class QualityReportOut(ORMModel):
    status: str
    valid_gaze_ratio: float
    tracking_loss_ratio: float
    off_screen_ratio: float
    mean_brightness: float
    brightness_cv: float
    max_tracking_gap_s: float
    calibration_error_px: float | None
    # Stored as a JSON array string; legacy semicolon strings are also parsed.
    reasons: list[str] = Field(default_factory=list)
    per_stimulus_json: str | None
    created_at: datetime | None = None

    @field_validator("reasons", mode="before")
    @classmethod
    def _split_reasons(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(part) for part in parsed]
                except (TypeError, ValueError):
                    pass
            # Legacy semicolon-joined representation.
            return [part for part in value.split(";") if part and part != "OK"]
        return [str(part) for part in value]

    @property
    def reasons_list(self) -> list[str]:
        return self.reasons

    @computed_field
    @property
    def per_stimulus(self) -> dict[str, Any]:
        """Parsed per-stimulus quality breakdown (stored as JSON text)."""
        if not self.per_stimulus_json:
            return {}
        try:
            parsed = json.loads(self.per_stimulus_json)
        except (TypeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}


class SessionOut(ORMModel):
    id: int
    participant_id: int
    label: str
    status: str
    stimulus_set: str | None
    screen_width: int
    screen_height: int
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime


class SessionList(BaseModel):
    items: list[SessionOut]
    total: int
    skip: int = 0
    limit: int = 100


class SessionCompleteOut(BaseModel):
    id: int
    status: str
    quality: dict[str, Any]
    features: dict[str, Any] | None
    risk: RiskInfo | None = None
    message: str | None = None

    @computed_field
    @property
    def probability(self) -> float | None:
        return self.risk.probability if self.risk else None


class PredictionOut(ORMModel):
    id: int
    session_id: int
    model_version: str
    feature_version: str
    risk: float
    xai_json: str | None
    created_at: datetime


class SessionDetailOut(SessionOut):
    calibration: dict[str, Any] | None = None
    client_meta: dict[str, Any] | None = None
    quality: QualityReportOut | None = None
    features: dict[str, Any] | None = None
    risk: RiskInfo | None = None
    prediction: PredictionOut | None = None
    xai: list[XaiContribution] | None = None
    message: str | None = None
    heatmap_available: bool = False
    events: int = 0

    @computed_field
    @property
    def probability(self) -> float | None:
        return self.risk.probability if self.risk else None


class HeatmapPoint(BaseModel):
    stimulus: str
    points: list[list[float]]


class SessionEventsOut(BaseModel):
    items: list[dict[str, Any]]
    total: int = 0
    skip: int = 0
    limit: int = 100


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------
class AssessmentCreate(BaseModel):
    kind: Literal["CONNERS", "IVA2"]
    version: str | None = Field(default=None, max_length=80)
    scores: dict[str, Any] = Field(default_factory=dict)
    assessed_at: datetime | None = None
    notes: str | None = None


class AssessmentOut(ORMModel):
    id: int
    participant_id: int
    kind: str
    version: str | None
    scores_json: str
    assessed_at: datetime | None
    notes: str | None
    created_at: datetime


class AssessmentList(BaseModel):
    items: list[AssessmentOut]
    total: int
    skip: int = 0
    limit: int = 100


class ParentRatingAnswerIn(BaseModel):
    item_id: int = Field(ge=1, le=26)
    value: int = Field(ge=0, le=3)


class ParentRatingCreate(BaseModel):
    """Raw 0..3 answers; the server computes every subscale before saving."""

    instrument: Literal["SNAP-IV-26"] = "SNAP-IV-26"
    answers: list[ParentRatingAnswerIn]
    notes: str | None = None
    assessed_at: datetime | None = None

    @field_validator("answers")
    @classmethod
    def _all_items_exactly_once(cls, value: list[ParentRatingAnswerIn]) -> list[ParentRatingAnswerIn]:
        ids = [answer.item_id for answer in value]
        if len(ids) != len(set(ids)):
            raise ValueError("هر سؤال باید دقیقاً یک بار پاسخ داده شود.")
        if set(ids) != set(range(1, 27)):
            raise ValueError("پاسخ تمام ۲۶ سؤال الزامی است.")
        return value


class ParentRatingDefinition(BaseModel):
    instrument: str
    title_fa: str
    disclaimer_fa: str
    likert: list[dict[str, Any]]
    sections: list[dict[str, Any]]
    items: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Models / predictions
# ---------------------------------------------------------------------------
class TrainRequest(BaseModel):
    min_labeled_sessions: int = Field(default=30, ge=2, le=100_000)


class TrainMetrics(BaseModel):
    auc: float
    accuracy: float
    sensitivity: float
    specificity: float
    precision: float
    f1: float
    brier: float
    calibration_slope: float
    calibration_intercept: float
    auc_ci_low: float
    auc_ci_high: float
    confusion_matrix: list[list[int]]
    n_sessions: int
    n_participants: int
    n_splits: int
    feature_names: list[str]
    model_version: str


class ModelSummary(ORMModel):
    version: str
    metrics_json: str
    created_at: datetime
    artifact_path: str


class ModelList(BaseModel):
    items: list[ModelSummary]
    total: int
    skip: int = 0
    limit: int = 100


class ModelCard(BaseModel):
    version: str
    created_at: datetime
    metrics: dict[str, Any]
    feature_names: list[str]
    xai: list[XaiContribution]
    artifact_path: str
    disclaimer: str


class PredictRequest(BaseModel):
    session_id: int


class PredictResponse(BaseModel):
    risk: RiskInfo | None = None
    version: str = ""
    xai: list[XaiContribution] = Field(default_factory=list)
    disclaimer: str = ""
    message: str | None = None

    @computed_field
    @property
    def probability(self) -> float | None:
        return self.risk.probability if self.risk else None


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
class ReportSection(BaseModel):
    key: str
    title: str
    content: Any = None
    status: Literal["OK", "NOT_CALCULATED", "NO_DATA"] = "NO_DATA"


class ReportOut(BaseModel):
    session_id: int
    generated_at: datetime
    sections: list[ReportSection]
    disclaimer: str


# ---------------------------------------------------------------------------
# Sync / offline
# ---------------------------------------------------------------------------
class SyncEventIn(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=80)
    payload: dict[str, Any] = Field(default_factory=dict)


class SyncBatchIn(BaseModel):
    events: list[SyncEventIn] = Field(default_factory=list)


class SyncResultItem(BaseModel):
    idempotency_key: str
    status: str
    resource_id: str | None = None
    message: str | None = None

    @computed_field
    @property
    def detail(self) -> str | None:
        """Alias for ``message``, for client compatibility."""
        return self.message


class SyncBatchResponse(BaseModel):
    results: list[SyncResultItem]


class SyncStatus(BaseModel):
    total_events: int
    processed: int
    failed: int
    by_type: dict[str, int]
    last_sync_at: datetime | None = None

    @computed_field
    @property
    def pending(self) -> int:
        return max(self.total_events - self.processed, 0)


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
class QualityConfigOut(BaseModel):
    min_valid_gaze_ratio: float = Field(default=settings.MIN_VALID_GAZE_RATIO, ge=0.0, le=1.0)
    max_tracking_gap_s: float = Field(default=settings.MAX_TRACKING_GAP_SEC, ge=0.0)
    brightness_min: float = Field(default=settings.BRIGHTNESS_MIN)
    brightness_max: float = Field(default=settings.BRIGHTNESS_MAX)
    max_calibration_error_px: float = Field(default=settings.MAX_CALIBRATION_ERROR_PX, ge=0.0)
    stimulus_target: int = Field(default=settings.STIMULUS_TARGET)
    stimulus_duration_sec: float = Field(default=settings.STIMULUS_DURATION_SEC)
    updated_at: datetime | None = None

    @computed_field
    @property
    def min_brightness(self) -> float:
        """Alias for ``brightness_min``, for client compatibility."""
        return self.brightness_min

    @computed_field
    @property
    def max_brightness(self) -> float:
        """Alias for ``brightness_max``, for client compatibility."""
        return self.brightness_max

    @field_validator("brightness_max")
    @classmethod
    def _brightness_order(cls, value: float, info: Any) -> float:
        minimum = info.data.get("brightness_min")
        if minimum is not None and value <= minimum:
            raise ValueError("brightness_max must be greater than brightness_min")
        return value


class QualityConfigUpdate(BaseModel):
    min_valid_gaze_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    max_tracking_gap_s: float | None = Field(default=None, ge=0.0)
    brightness_min: float | None = None
    brightness_max: float | None = None
    max_calibration_error_px: float | None = Field(default=None, ge=0.0)


class AuditOut(ORMModel):
    id: int
    user_id: int | None
    action: str
    entity: str | None
    entity_id: str | None
    meta_json: str | None
    created_at: datetime


class AuditList(BaseModel):
    items: list[AuditOut]
    total: int
    skip: int = 0
    limit: int = 100

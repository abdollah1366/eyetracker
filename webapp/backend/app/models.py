"""ORM models for every table defined in SPEC section 3.

Additional columns required by the contract (``idempotency_key`` on sessions
and sync events, ``off_screen`` on gaze samples, a singleton quality config,
and metadata on predictions) are included here as well.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC timestamp factory (Python 3.11+)."""
    from datetime import UTC

    return datetime.now(UTC)


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    users: Mapped[list[User]] = relationship(back_populates="clinic")
    participants: Mapped[list[Participant]] = relationship(back_populates="clinic")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_email", "email", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[int | None] = mapped_column(
        ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="clinician", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    clinic: Mapped[Clinic | None] = relationship(back_populates="users")
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="user")
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (
        UniqueConstraint("research_id", name="uq_participants_research_id"),
        Index("ix_participants_clinic_id", "clinic_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Index is declared explicitly in __table_args__ (ix_participants_clinic_id);
    # do not also set index=True here or create_all emits a duplicate index.
    clinic_id: Mapped[int | None] = mapped_column(
        ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True
    )
    research_id: Mapped[str] = mapped_column(String(100), nullable=False)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(20), nullable=True)
    consent_guardian: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_assent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    clinic: Mapped[Clinic | None] = relationship(back_populates="participants")
    sessions: Mapped[list[EyeTrackingSession]] = relationship(back_populates="participant")
    assessments: Mapped[list[Assessment]] = relationship(back_populates="participant")


class EyeTrackingSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_sessions_idempotency_key"),
        Index("ix_sessions_participant_id", "participant_id"),
        Index("ix_sessions_status", "status"),
        Index("ix_sessions_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(20), nullable=False, default="UNKNOWN")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="COLLECTING")
    stimulus_set: Mapped[str | None] = mapped_column(String(100), nullable=True)
    screen_width: Mapped[int] = mapped_column(Integer, nullable=False)
    screen_height: Mapped[int] = mapped_column(Integer, nullable=False)
    calibration_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    client_meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    participant: Mapped[Participant] = relationship(back_populates="sessions")
    samples: Mapped[list[GazeSample]] = relationship(back_populates="session", cascade="all, delete-orphan")
    quality: Mapped[QualityReport | None] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    features: Mapped[FeatureSet | None] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    predictions: Mapped[list[Prediction]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    events: Mapped[list[Event]] = relationship(back_populates="session", cascade="all, delete-orphan")


class GazeSample(Base):
    __tablename__ = "gaze_samples"
    __table_args__ = (
        Index("ix_gaze_samples_session_id", "session_id"),
        Index("ix_gaze_samples_session_stimulus", "session_id", "stimulus"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    stimulus: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    timestamp: Mapped[float | None] = mapped_column(Float, nullable=True)
    frame_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gaze_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    gaze_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    gaze_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Off-screen gaze is a distinct flag and is NEVER treated as tracking loss.
    off_screen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    left_iris_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    left_iris_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_iris_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_iris_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    brightness: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_partial_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    session: Mapped[EyeTrackingSession] = relationship(back_populates="samples")


class QualityReport(Base):
    __tablename__ = "quality_reports"

    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    valid_gaze_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tracking_loss_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    off_screen_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mean_brightness: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    brightness_cv: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_tracking_gap_s: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    calibration_error_px: Mapped[float | None] = mapped_column(Float, nullable=True)
    reasons: Mapped[str] = mapped_column(Text, nullable=False, default="OK")
    per_stimulus_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    session: Mapped[EyeTrackingSession] = relationship(back_populates="quality")


class FeatureSet(Base):
    __tablename__ = "features"

    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    feature_json: Mapped[str] = mapped_column(Text, nullable=False)
    extractor_version: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    session: Mapped[EyeTrackingSession] = relationship(back_populates="features")


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (Index("ix_assessments_participant_id", "participant_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    scores_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    participant: Mapped[Participant] = relationship(back_populates="assessments")


class Prediction(Base):
    __tablename__ = "predictions"
    __table_args__ = (Index("ix_predictions_session_id", "session_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    model_version: Mapped[str] = mapped_column(String(80), nullable=False)
    feature_version: Mapped[str] = mapped_column(String(40), nullable=False)
    risk: Mapped[float] = mapped_column(Float, nullable=False)
    xai_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    session: Mapped[EyeTrackingSession] = relationship(back_populates="predictions")


class ModelVersion(Base):
    __tablename__ = "model_versions"

    version: Mapped[str] = mapped_column(String(80), primary_key=True)
    metrics_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    features_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    artifact_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_session_id", "session_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    session: Mapped[EyeTrackingSession] = relationship(back_populates="events")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_user_id", "user_id"),
        Index("ix_audit_logs_action", "action"),
        Index("ix_audit_logs_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    user: Mapped[User | None] = relationship(back_populates="audit_logs")


class RefreshToken(Base):
    """Server-side record of issued refresh tokens (only SHA-256 digests stored)."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        Index("ix_refresh_tokens_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class SyncEvent(Base):
    __tablename__ = "sync_events"

    idempotency_key: Mapped[str] = mapped_column(String(120), primary_key=True)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="processed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class QualityConfig(Base):
    """Singleton row (id=1) holding admin-adjustable Quality Gate thresholds."""

    __tablename__ = "quality_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    min_valid_gaze_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    max_tracking_gap_s: Mapped[float] = mapped_column(Float, nullable=False)
    brightness_min: Mapped[float] = mapped_column(Float, nullable=False)
    brightness_max: Mapped[float] = mapped_column(Float, nullable=False)
    max_calibration_error_px: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

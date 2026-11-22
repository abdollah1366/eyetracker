"""Session lifecycle: creation, sample ingestion, Quality Gate, and detail views.

The ``*_core`` functions perform work and flush but never commit; both the HTTP
routes and the offline-sync dispatcher call them so the Quality Gate logic has
a single implementation.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import (
    Event,
    EyeTrackingSession,
    FeatureSet,
    GazeSample,
    Participant,
    QualityReport,
    User,
)
from app.routers import scoped_clinic_id
from app.schemas import (
    CompleteRequest,
    GlobalHeatmap,
    HeatmapPoint,
    RiskInfo,
    SampleBatchIn,
    SamplesAccepted,
    SessionCompleteOut,
    SessionCreate,
    SessionDetailOut,
    SessionEventsOut,
    SessionList,
    SessionOut,
    PredictionOut,
    QualityReportOut,
)
from app.security import get_current_user, require_clinician
from app.services.features import EXTRACTOR_VERSION, extract_features
from app.services.heatmap import build_global_map
from app.services.ml import DISCLAIMER, NOT_CALCULATED_MESSAGE
from app.services.quality import Thresholds, evaluate_quality

router = APIRouter(prefix="/api/v1", tags=["sessions"])


def _now() -> datetime:
    return datetime.now(UTC)


def _json_dict(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _get_session(db: Session, session_id: int, current: User) -> EyeTrackingSession:
    session = (
        db.query(EyeTrackingSession)
        .join(Participant, EyeTrackingSession.participant_id == Participant.id)
        .filter(EyeTrackingSession.id == session_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    allowed = scoped_clinic_id(current, None)
    if allowed is not None and session.participant.clinic_id != allowed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


def _add_event(db: Session, session_id: int, event_type: str, payload: dict[str, Any]) -> None:
    db.add(
        Event(
            session_id=session_id,
            type=event_type,
            payload_json=json.dumps(payload, ensure_ascii=False, default=str),
        )
    )


def _off_screen(x: float | None, y: float | None, width: int, height: int) -> bool:
    """Derive off-screen flag from mapped coordinates when the client omits it."""
    if x is None or y is None:
        return False
    return x < 0 or x >= width or y >= height or y < 0


def _calibration_error(session: EyeTrackingSession) -> float | None:
    calibration = _json_dict(session.calibration_json)
    if not calibration:
        return None
    value = calibration.get("mean_error_px")
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Core operations (flush only; caller commits)
# ---------------------------------------------------------------------------
def create_session_core(db: Session, payload: SessionCreate, actor: User) -> EyeTrackingSession:
    """Create a session or return the existing one with the same idempotency key."""
    existing = (
        db.query(EyeTrackingSession)
        .filter(EyeTrackingSession.idempotency_key == payload.idempotency_key)
        .first()
    )
    if existing is not None:
        return existing

    participant = db.get(Participant, payload.participant_id)
    if participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    if actor.role != "admin" and participant.clinic_id != actor.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")

    session = EyeTrackingSession(
        participant_id=participant.id,
        label=payload.label,
        status="COLLECTING",
        stimulus_set=payload.stimulus_set,
        screen_width=payload.screen_width,
        screen_height=payload.screen_height,
        calibration_json=(
            json.dumps(payload.calibration.model_dump(mode="json"), ensure_ascii=False)
            if payload.calibration is not None
            else None
        ),
        started_at=payload.started_at or _now(),
        client_meta_json=json.dumps(payload.client_meta, ensure_ascii=False),
        idempotency_key=payload.idempotency_key,
    )
    db.add(session)
    db.flush()
    _add_event(
        db,
        session.id,
        "SESSION_STARTED",
        {"stimulus_set": payload.stimulus_set, "label": payload.label},
    )
    log_action(
        db,
        actor,
        "CREATE_SESSION",
        entity="session",
        entity_id=session.id,
        meta={"idempotency_key": payload.idempotency_key, "participant_id": participant.id},
    )
    return session


def add_samples_core(db: Session, session: EyeTrackingSession, payload: SampleBatchIn, actor: User) -> int:
    if session.status != "COLLECTING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not collecting samples")

    partial = payload.quality_partial
    partial_brightness = None
    if partial is not None:
        partial_brightness = partial.brightness if partial.brightness is not None else partial.mean_brightness
    partial_dict = {
        **(partial.extra if partial else {}),
        **({"brightness": partial_brightness} if partial_brightness is not None else {}),
    }

    for sample in payload.samples:
        is_valid = bool(sample.gaze_valid)
        # Off-screen is independent: detected gaze outside the viewport is NOT
        # transformed into a tracking loss.
        off = sample.off_screen if sample.off_screen is not None else _off_screen(
            sample.gaze_x, sample.gaze_y, session.screen_width, session.screen_height
        )
        db.add(
            GazeSample(
                session_id=session.id,
                stimulus=payload.stimulus,
                timestamp=sample.timestamp,
                frame_id=sample.frame_id,
                gaze_x=sample.gaze_x,
                gaze_y=sample.gaze_y,
                gaze_valid=is_valid,
                off_screen=bool(off) and is_valid,
                left_iris_x=sample.left_iris_x,
                left_iris_y=sample.left_iris_y,
                right_iris_x=sample.right_iris_x,
                right_iris_y=sample.right_iris_y,
                brightness=sample.brightness if sample.brightness is not None else partial_brightness,
                quality_partial_json=(
                    json.dumps(partial_dict, ensure_ascii=False) if partial_dict else None
                ),
            )
        )

    _add_event(
        db,
        session.id,
        "SAMPLES_RECEIVED",
        {"stimulus": payload.stimulus, "count": len(payload.samples)},
    )
    log_action(
        db,
        actor,
        "ADD_SAMPLES",
        entity="session",
        entity_id=session.id,
        meta={"stimulus": payload.stimulus, "count": len(payload.samples)},
    )
    return len(payload.samples)


def complete_session_core(
    db: Session,
    session: EyeTrackingSession,
    payload: CompleteRequest,
    actor: User,
) -> SessionCompleteOut:
    """Recompute the Quality Gate. Risk is NEVER computed here.

    An INVALID session gets no feature row and no prediction.
    """
    if session.status != "COLLECTING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is already completed")

    client_quality = payload.quality
    client_brightness = None
    if client_quality is not None:
        client_brightness = (
            client_quality.brightness
            if client_quality.brightness is not None
            else client_quality.mean_brightness
        )
    result = evaluate_quality(
        session.samples,
        screen_width=session.screen_width,
        screen_height=session.screen_height,
        calibration_error_px=_calibration_error(session),
        thresholds=Thresholds.from_db(db),
        client_calibration_error=client_quality.calibration_error_px if client_quality else None,
        client_brightness=client_brightness,
    )

    db.add(
        QualityReport(
            session_id=session.id,
            status=result.status,
            valid_gaze_ratio=result.valid_gaze_ratio,
            tracking_loss_ratio=result.tracking_loss_ratio,
            off_screen_ratio=result.off_screen_ratio,
            mean_brightness=result.mean_brightness,
            brightness_cv=result.brightness_cv,
            max_tracking_gap_s=result.max_tracking_gap_s,
            calibration_error_px=result.calibration_error_px,
            # Stored as a JSON array string so every quality response can expose
            # reasons as string[] without lossy parsing.
            reasons=json.dumps(result.reasons, ensure_ascii=False),
            per_stimulus_json=json.dumps(result.per_stimulus, ensure_ascii=False),
        )
    )

    session.status = result.status
    session.ended_at = payload.ended_at or _now()

    features_dict: dict[str, Any] | None = None
    if result.is_valid:
        features_dict = extract_features(
            session.samples,
            screen_width=session.screen_width,
            screen_height=session.screen_height,
            brightness_cv=result.brightness_cv,
            mean_brightness=result.mean_brightness,
        )
        db.add(
            FeatureSet(
                session_id=session.id,
                feature_json=json.dumps(features_dict, ensure_ascii=False),
                extractor_version=EXTRACTOR_VERSION,
            )
        )
    else:
        if session.features is not None:
            db.delete(session.features)
        for prediction in list(session.predictions):
            db.delete(prediction)

    _add_event(
        db,
        session.id,
        "SESSION_COMPLETED" if result.is_valid else "SESSION_INVALID",
        {"quality": result.status, "reasons": result.reasons},
    )
    log_action(
        db,
        actor,
        "COMPLETE_SESSION",
        entity="session",
        entity_id=session.id,
        meta={"status": result.status, "reasons": result.reasons},
    )
    return SessionCompleteOut(
        id=session.id,
        status=session.status,
        quality=result.to_dict(),
        features=features_dict,
        risk=None,
        message=None if result.is_valid else NOT_CALCULATED_MESSAGE,
    )


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------
@router.get("/sessions", response_model=SessionList)
def list_sessions(
    participant_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    clinic_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> SessionList:
    query = db.query(EyeTrackingSession).join(
        Participant, EyeTrackingSession.participant_id == Participant.id
    )
    allowed = scoped_clinic_id(current, clinic_id)
    if allowed is not None:
        query = query.filter(Participant.clinic_id == allowed)
    if participant_id is not None:
        query = query.filter(EyeTrackingSession.participant_id == participant_id)
    if status_filter:
        query = query.filter(EyeTrackingSession.status == status_filter.upper())
    total = query.count()
    safe_skip, safe_limit = max(skip, 0), min(max(limit, 1), 500)
    items = (
        query.order_by(EyeTrackingSession.created_at.desc())
        .offset(safe_skip)
        .limit(safe_limit)
        .all()
    )
    return SessionList(
        items=[SessionOut.model_validate(item) for item in items],
        total=total,
        skip=safe_skip,
        limit=safe_limit,
    )


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> SessionOut:
    session = create_session_core(db, payload, current)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        duplicate = (
            db.query(EyeTrackingSession)
            .filter(EyeTrackingSession.idempotency_key == payload.idempotency_key)
            .first()
        )
        if duplicate is not None:
            return SessionOut.model_validate(duplicate)
        raise
    return SessionOut.model_validate(session)


@router.post("/sessions/{session_id}/samples", response_model=SamplesAccepted)
def add_samples(
    session_id: int,
    payload: SampleBatchIn,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> SamplesAccepted:
    session = _get_session(db, session_id, current)
    accepted = add_samples_core(db, session, payload, current)
    db.commit()
    return SamplesAccepted(accepted=accepted)


@router.post("/sessions/{session_id}/complete", response_model=SessionCompleteOut)
def complete_session(
    session_id: int,
    payload: CompleteRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> SessionCompleteOut:
    session = _get_session(db, session_id, current)
    result = complete_session_core(db, session, payload, current)
    db.commit()
    return result


@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> SessionDetailOut:
    session = _get_session(db, session_id, current)
    quality = (
        QualityReportOut.model_validate(session.quality) if session.quality is not None else None
    )
    features = _json_dict(session.features.feature_json) if session.features else None

    latest_prediction = session.predictions[-1] if session.predictions else None
    xai: list[dict[str, Any]] = []
    if latest_prediction and latest_prediction.xai_json:
        try:
            parsed = json.loads(latest_prediction.xai_json)
            if isinstance(parsed, list):
                xai = parsed
        except (TypeError, ValueError):
            xai = []

    risk: RiskInfo | None = None
    if latest_prediction is not None:
        risk = RiskInfo(
            probability=latest_prediction.risk,
            version=latest_prediction.model_version,
            feature_version=latest_prediction.feature_version,
            xai=xai,
            disclaimer=DISCLAIMER,
            created_at=latest_prediction.created_at,
        )

    heatmap_available = any(
        sample.gaze_valid and sample.gaze_x is not None and sample.gaze_y is not None
        for sample in session.samples
    )

    return SessionDetailOut(
        id=session.id,
        participant_id=session.participant_id,
        label=session.label,
        status=session.status,
        stimulus_set=session.stimulus_set,
        screen_width=session.screen_width,
        screen_height=session.screen_height,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        calibration=_json_dict(session.calibration_json),
        client_meta=_json_dict(session.client_meta_json),
        quality=quality,
        features=features,
        risk=risk,
        prediction=PredictionOut.model_validate(latest_prediction) if latest_prediction else None,
        xai=xai or None,
        message=None if session.status == "VALID" else NOT_CALCULATED_MESSAGE,
        heatmap_available=heatmap_available,
        events=len(session.events),
    )


@router.get("/sessions/{session_id}/heatmap", response_model=list[HeatmapPoint])
def session_heatmap(
    session_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[HeatmapPoint]:
    session = _get_session(db, session_id, current)
    grouped: dict[str, list[list[float]]] = {}
    for sample in session.samples:
        if not sample.gaze_valid or sample.gaze_x is None or sample.gaze_y is None:
            continue
        grouped.setdefault(sample.stimulus or "unknown", []).append(
            [float(sample.gaze_x), float(sample.gaze_y)]
        )
    return [
        HeatmapPoint(stimulus=stimulus, points=points)
        for stimulus, points in sorted(grouped.items())
    ]


@router.get("/heatmap/global", response_model=GlobalHeatmap)
def global_heatmap(
    stimulus: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> GlobalHeatmap:
    """Mean gaze density across all sessions/stimuli (clinic-scoped).

    Every point is normalized by its own session's screen size before binning.
    Invalid gaze rows and tracking loss are excluded; off-screen valid gaze is
    kept as a distinct observation, consistent with the per-session heatmap.
    """
    query = (
        db.query(GazeSample, EyeTrackingSession)
        .join(EyeTrackingSession, GazeSample.session_id == EyeTrackingSession.id)
        .filter(GazeSample.gaze_valid.is_(True))
        .filter(GazeSample.gaze_x.isnot(None), GazeSample.gaze_y.isnot(None))
    )
    clinic_id = scoped_clinic_id(current, None)
    if clinic_id is not None:
        query = query.join(Participant, EyeTrackingSession.participant_id == Participant.id).filter(
            Participant.clinic_id == clinic_id
        )
    if stimulus:
        query = query.filter(GazeSample.stimulus == stimulus)
    rows = query.all()
    return GlobalHeatmap.model_validate(build_global_map(rows, stimulus))


@router.get("/sessions/{session_id}/events", response_model=SessionEventsOut)
def session_events(
    session_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> SessionEventsOut:
    session = _get_session(db, session_id, current)
    ordered = sorted(session.events, key=lambda item: item.id)
    safe_skip, safe_limit = max(skip, 0), min(max(limit, 1), 500)
    page = ordered[safe_skip : safe_skip + safe_limit]
    items = [
        {
            "id": event.id,
            "session_id": event.session_id,
            "type": event.type,
            "payload": _json_dict(event.payload_json),
            "created_at": event.created_at.isoformat(),
        }
        for event in page
    ]
    return SessionEventsOut(
        items=items,
        total=len(ordered),
        skip=safe_skip,
        limit=safe_limit,
    )

"""Administrative configuration and audit endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.config import settings
from app.db import get_db
from app.models import AuditLog, QualityConfig, User
from app.schemas import AuditList, AuditOut, QualityConfigOut, QualityConfigUpdate
from app.security import get_current_user, require_admin

router = APIRouter(prefix="/api/v1", tags=["admin"])


def _config_out(row: QualityConfig) -> QualityConfigOut:
    return QualityConfigOut(
        min_valid_gaze_ratio=row.min_valid_gaze_ratio,
        max_tracking_gap_s=row.max_tracking_gap_s,
        brightness_min=row.brightness_min,
        brightness_max=row.brightness_max,
        max_calibration_error_px=row.max_calibration_error_px,
        stimulus_target=settings.STIMULUS_TARGET,
        stimulus_duration_sec=settings.STIMULUS_DURATION_SEC,
        updated_at=row.updated_at,
    )


@router.get("/config/quality", response_model=QualityConfigOut)
def get_quality_config(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> QualityConfigOut:
    row = db.get(QualityConfig, 1)
    if row is None:
        return QualityConfigOut(
            stimulus_target=settings.STIMULUS_TARGET,
            stimulus_duration_sec=settings.STIMULUS_DURATION_SEC,
        )
    return _config_out(row)


@router.patch("/config/quality", response_model=QualityConfigOut)
def update_quality_config(
    payload: QualityConfigUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> QualityConfigOut:
    row = db.get(QualityConfig, 1)
    if row is None:
        row = QualityConfig(
            id=1,
            min_valid_gaze_ratio=settings.MIN_VALID_GAZE_RATIO,
            max_tracking_gap_s=settings.MAX_TRACKING_GAP_SEC,
            brightness_min=settings.BRIGHTNESS_MIN,
            brightness_max=settings.BRIGHTNESS_MAX,
            max_calibration_error_px=settings.MAX_CALIBRATION_ERROR_PX,
        )
        db.add(row)

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            setattr(row, key, value)
    if row.brightness_max <= row.brightness_min:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="brightness_max must be greater than brightness_min",
        )
    log_action(db, current, "QUALITY_CONFIG_UPDATE", entity="quality_config", entity_id=1, meta=data)
    db.commit()
    return _config_out(row)


@router.get("/audit", response_model=AuditList)
def list_audit(
    user_id: int | None = None,
    action: str | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> AuditList:
    query = db.query(AuditLog)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action.upper())
    if from_ is not None:
        query = query.filter(AuditLog.created_at >= from_)
    if to is not None:
        query = query.filter(AuditLog.created_at <= to)
    total = query.count()
    items = (
        query.order_by(AuditLog.created_at.desc())
        .offset(max(skip, 0))
        .limit(min(max(limit, 1), 500))
        .all()
    )
    return AuditList(
        items=[AuditOut.model_validate(item) for item in items],
        total=total,
        skip=max(skip, 0),
        limit=min(max(limit, 1), 500),
    )

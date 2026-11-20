"""Model training, model cards and prediction endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import ModelVersion, User
from app.schemas import (
    ModelCard,
    ModelList,
    ModelSummary,
    PredictRequest,
    PredictResponse,
    RiskInfo,
    TrainMetrics,
    TrainRequest,
)
from app.security import get_current_user, require_admin, require_clinician
from app.services import ml

router = APIRouter(prefix="/api/v1", tags=["models"])


@router.get("/models", response_model=ModelList)
def list_models(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ModelList:
    all_items = ml.list_model_versions(db)
    safe_skip, safe_limit = max(skip, 0), min(max(limit, 1), 500)
    items = all_items[safe_skip : safe_skip + safe_limit]
    return ModelList(
        items=[
            ModelSummary(
                version=item.version,
                metrics_json=item.metrics_json,
                created_at=item.created_at,
                artifact_path=item.artifact_path,
            )
            for item in items
        ],
        total=len(all_items),
        skip=safe_skip,
        limit=safe_limit,
    )


@router.post("/models/train", response_model=TrainMetrics)
def train(
    payload: TrainRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> TrainMetrics:
    try:
        result = ml.train_model(db, payload.min_labeled_sessions)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    log_action(
        db,
        current,
        "TRAIN_MODEL",
        entity="model_version",
        entity_id=result["model_version"],
        meta={"auc": result["auc"], "n_participants": result["n_participants"]},
    )
    db.commit()
    return TrainMetrics(**result)


@router.get("/models/{version}", response_model=ModelCard)
def model_card(
    version: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ModelCard:
    card = ml.get_model_card(db, version)
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model version not found")
    return ModelCard(**card)


@router.post("/models/{version}/predict", response_model=PredictResponse)
def predict(
    version: str,
    payload: PredictRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> PredictResponse:
    result = ml.predict_session(db, payload.session_id, version=version)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    log_action(
        db,
        current,
        "PREDICT",
        entity="session",
        entity_id=payload.session_id,
        meta={"version": result["version"], "risk": result["risk"]},
    )
    db.commit()
    risk = None
    if result.get("risk") is not None:
        risk = RiskInfo(
            probability=result["risk"],
            version=result["version"],
            xai=result["xai"],
            disclaimer=result["disclaimer"],
            feature_version=result.get("feature_version"),
        )
    return PredictResponse(
        risk=risk,
        version=result["version"],
        xai=result["xai"],
        disclaimer=result["disclaimer"],
        message=result.get("message"),
    )

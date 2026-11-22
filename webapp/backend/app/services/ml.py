"""Model training, evaluation, versioning and inference.

Only real, VALID, labeled sessions with extracted features are used. A model
is never fabricated and predictions are unavailable until training succeeds.
Validation uses ``StratifiedGroupKFold`` split by *participant*, with the
number of splits derived from the minority class participant count.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from app.config import settings
from app.models import EyeTrackingSession, ModelVersion, Prediction
from app.services.features import FEATURE_VERSION, flatten_features

DISCLAIMER = "ابزار پشتیبان تصمیم پژوهشی است، جایگزین تشخیص متخصص نیست."
NOT_TRAINED_MESSAGE = "مدل آموزشدیدهای موجود نیست."
NOT_CALCULATED_MESSAGE = "Eye Tracking Result: Not Calculated – Insufficient Data Quality"
MODEL_READY_PARTICIPANTS = 100
MODEL_PENDING_MESSAGE = (
    "مدل در حال تکمیل است؛ تا رسیدن به ۱۰۰ مراجع دارای برچسب، احتمال پیشبینی محاسبه نمیشود "
    "و فقط مقادیر خام ارزیابی (کیفیت و ویژگیها) نمایش داده میشود."
)

LABEL_TO_INT = {"ADHD": 1, "CONTROL": 0}
BOOTSTRAP_ROUNDS = 1000
RANDOM_STATE = 42


def _build_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
            ("model", LogisticRegression(max_iter=3000, class_weight="balanced", random_state=RANDOM_STATE)),
        ]
    )


def _session_rows(db: Session) -> list[dict[str, Any]]:
    """Load usable labelled sessions from the database only."""
    sessions = (
        db.query(EyeTrackingSession)
        .filter(EyeTrackingSession.status == "VALID")
        .filter(EyeTrackingSession.label.in_(["ADHD", "CONTROL"]))
        .all()
    )
    rows: list[dict[str, Any]] = []
    for session in sessions:
        if session.features is None:
            continue
        try:
            feature_dict = json.loads(session.features.feature_json)
        except (TypeError, ValueError):
            continue
        if not isinstance(feature_dict, dict):
            continue
        rows.append(
            {
                "session_id": session.id,
                "participant_id": session.participant_id,
                "label": LABEL_TO_INT[session.label],
                "features": flatten_features(feature_dict),
            }
        )
    return rows


def model_readiness(db: Session) -> dict[str, Any]:
    """Progress toward the research cohort size required before showing risk.

    Until ``MODEL_READY_PARTICIPANTS`` distinct labelled participants have a
    valid session with features, the API must expose raw values only and never
    a model probability. A trained version alone is not enough.
    """
    rows = _session_rows(db)
    labelled_participants = len({int(row["participant_id"]) for row in rows})
    participants_ready = labelled_participants >= MODEL_READY_PARTICIPANTS
    model_available = latest_model_version(db) is not None
    return {
        "required_participants": MODEL_READY_PARTICIPANTS,
        "labeled_participants": labelled_participants,
        "labeled_sessions": len(rows),
        "progress": round(min(1.0, labelled_participants / MODEL_READY_PARTICIPANTS), 4),
        "participants_ready": participants_ready,
        "model_available": model_available,
        "ready": participants_ready and model_available,
        "message": None if participants_ready and model_available else MODEL_PENDING_MESSAGE,
    }


def _participant_labels(rows: list[dict[str, Any]]) -> dict[int, int]:
    mapping: dict[int, int] = {}
    for row in rows:
        pid = int(row["participant_id"])
        label = int(row["label"])
        if pid in mapping and mapping[pid] != label:
            raise ValueError(
                f"Participant {pid} has conflicting labels; resolve labels before training."
            )
        mapping[pid] = label
    return mapping


def _matrix(rows: list[dict[str, Any]]) -> tuple[pd.DataFrame, list[str]]:
    all_keys = sorted({key for row in rows for key in row["features"]})
    data = [{key: row["features"].get(key, np.nan) for key in all_keys} for row in rows]
    return pd.DataFrame(data, columns=all_keys, dtype=float), all_keys


def _global_coefficients(pipeline: Pipeline, feature_names: list[str]) -> list[dict[str, Any]]:
    model = pipeline.named_steps.get("model")
    coef = getattr(model, "coef_", None)
    if coef is None:
        return []
    values = np.asarray(coef).reshape(-1)
    pairs = [
        {"feature": name, "contribution": round(float(value), 6)}
        for name, value in zip(feature_names, values)
    ]
    return sorted(pairs, key=lambda item: abs(item["contribution"]), reverse=True)


def _bootstrap_auc_ci(y: np.ndarray, probs: np.ndarray) -> tuple[float, float]:
    rng = np.random.default_rng(RANDOM_STATE)
    scores: list[float] = []
    n = len(y)
    for _ in range(BOOTSTRAP_ROUNDS):
        idx = rng.integers(0, n, size=n)
        if len(np.unique(y[idx])) < 2:
            continue
        scores.append(float(roc_auc_score(y[idx], probs[idx])))
    if not scores:
        return 0.0, 0.0
    return (
        round(float(np.percentile(scores, 2.5)), 4),
        round(float(np.percentile(scores, 97.5)), 4),
    )


def list_model_versions(db: Session) -> list[ModelVersion]:
    return db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()


def get_model_version(db: Session, version: str) -> ModelVersion | None:
    return db.get(ModelVersion, version)


def latest_model_version(db: Session) -> ModelVersion | None:
    return db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).first()


def train_model(db: Session, min_labeled_sessions: int) -> dict[str, Any]:
    """Train, cross-validate, persist and register a new model version.

    Raises ``ValueError`` with an explicit message when data is insufficient.
    """
    rows = _session_rows(db)
    if len(rows) < min_labeled_sessions:
        raise ValueError(
            f"At least {min_labeled_sessions} labeled VALID sessions are required; found {len(rows)}."
        )

    participant_labels = _participant_labels(rows)
    n_adhd = sum(1 for value in participant_labels.values() if value == 1)
    n_control = sum(1 for value in participant_labels.values() if value == 0)
    n_splits = min(5, n_adhd, n_control)
    if n_splits < 2:
        raise ValueError(
            "At least 2 distinct participants per class are required for participant-level validation."
        )

    X, feature_names = _matrix(rows)
    if not feature_names:
        raise ValueError("No numeric features available for training.")
    y = np.asarray([row["label"] for row in rows], dtype=int)
    groups = np.asarray([str(row["participant_id"]) for row in rows])

    pipeline = _build_pipeline()
    cv = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_STATE)
    oof = cross_val_predict(pipeline, X, y, groups=groups, cv=cv, method="predict_proba")[:, 1]
    predictions = (oof >= 0.5).astype(int)

    logits = np.log(np.clip(oof, 1e-6, 1 - 1e-6) / (1 - np.clip(oof, 1e-6, 1 - 1e-6)))
    calibration = LogisticRegression(random_state=RANDOM_STATE).fit(logits.reshape(-1, 1), y)
    ci_low, ci_high = _bootstrap_auc_ci(y, oof)

    metrics: dict[str, Any] = {
        "auc": round(float(roc_auc_score(y, oof)), 4),
        "accuracy": round(float(accuracy_score(y, predictions)), 4),
        "sensitivity": round(float(recall_score(y, predictions, pos_label=1, zero_division=0)), 4),
        "specificity": round(float(recall_score(y, predictions, pos_label=0, zero_division=0)), 4),
        "precision": round(float(precision_score(y, predictions, pos_label=1, zero_division=0)), 4),
        "f1": round(float(f1_score(y, predictions, pos_label=1, zero_division=0)), 4),
        "brier": round(float(brier_score_loss(y, oof)), 4),
        "calibration_slope": round(float(calibration.coef_[0][0]), 4),
        "calibration_intercept": round(float(calibration.intercept_[0]), 4),
        "auc_ci_low": ci_low,
        "auc_ci_high": ci_high,
        "confusion_matrix": confusion_matrix(y, predictions, labels=[0, 1]).tolist(),
        "n_sessions": int(len(rows)),
        "n_participants": int(len(participant_labels)),
        "n_splits": int(n_splits),
        "feature_names": feature_names,
    }

    pipeline.fit(X, y)

    count = db.query(ModelVersion).count()
    now = datetime.now(UTC)
    version = f"v{count + 1:03d}-{now:%Y%m%dT%H%M%SZ}"
    artifacts: Path = settings.artifacts_path
    artifacts.mkdir(parents=True, exist_ok=True)
    artifact_path = artifacts / f"{version}.joblib"
    joblib.dump(pipeline, artifact_path)

    record = ModelVersion(
        version=version,
        metrics_json=json.dumps(metrics, ensure_ascii=False),
        features_json=json.dumps(feature_names, ensure_ascii=False),
        artifact_path=str(artifact_path),
        created_at=now,
    )
    db.add(record)
    db.flush()

    result = dict(metrics)
    result["model_version"] = version
    result["xai"] = _global_coefficients(pipeline, feature_names)
    return result


def _load_pipeline(record: ModelVersion) -> tuple[Pipeline, list[str]]:
    if not Path(record.artifact_path).exists():
        raise FileNotFoundError(f"Artifact for model {record.version} is missing.")
    pipeline: Pipeline = joblib.load(record.artifact_path)
    try:
        feature_names = json.loads(record.features_json)
    except (TypeError, ValueError):
        feature_names = []
    return pipeline, list(feature_names)


def get_model_card(db: Session, version: str) -> dict[str, Any] | None:
    record = get_model_version(db, version)
    if record is None:
        return None
    try:
        metrics = json.loads(record.metrics_json)
    except (TypeError, ValueError):
        metrics = {}
    try:
        feature_names = list(json.loads(record.features_json))
    except (TypeError, ValueError):
        feature_names = []

    xai: list[dict[str, Any]] = []
    try:
        pipeline, names = _load_pipeline(record)
        xai = _global_coefficients(pipeline, names or feature_names)
    except (FileNotFoundError, ValueError, OSError):
        pass

    return {
        "version": record.version,
        "created_at": record.created_at,
        "metrics": metrics,
        "feature_names": feature_names,
        "xai": xai,
        "artifact_path": record.artifact_path,
        "disclaimer": DISCLAIMER,
    }


def _unavailable(version: str | None, message: str) -> dict[str, Any]:
    return {
        "risk": None,
        "version": version or "none",
        "xai": [],
        "disclaimer": DISCLAIMER,
        "message": message,
    }


def predict_session(
    db: Session,
    session_id: int,
    version: str | None = None,
) -> dict[str, Any] | None:
    """Predict risk for a VALID session with a real model; otherwise no risk.

    Returns ``None`` when the session does not exist (router maps to 404).
    """
    session = db.get(EyeTrackingSession, session_id)
    if session is None:
        return None

    if session.quality is None or session.quality.status != "VALID" or session.features is None:
        return _unavailable(version, NOT_CALCULATED_MESSAGE)

    # Research gate: no risk probability before the full labelled cohort and a
    # trained model exist. Raw quality/feature values remain available.
    readiness = model_readiness(db)
    if not readiness["ready"]:
        return _unavailable(version, MODEL_PENDING_MESSAGE)

    record = get_model_version(db, version) if version else latest_model_version(db)
    if record is None:
        return _unavailable(version, NOT_TRAINED_MESSAGE)

    try:
        feature_dict = json.loads(session.features.feature_json)
        pipeline, feature_names = _load_pipeline(record)
    except (FileNotFoundError, TypeError, ValueError, OSError):
        return _unavailable(record.version, NOT_TRAINED_MESSAGE)

    if not feature_names:
        return _unavailable(record.version, NOT_TRAINED_MESSAGE)

    row = pd.DataFrame(
        [{name: flatten_features(feature_dict).get(name, np.nan) for name in feature_names}],
        columns=feature_names,
        dtype=float,
    )
    risk = float(pipeline.predict_proba(row)[0, 1])

    # Local XAI: standardized coefficient * standardized feature value.
    imputer = pipeline.named_steps.get("imputer")
    scaler = pipeline.named_steps.get("scale")
    try:
        imputed = imputer.transform(row) if imputer is not None else row.to_numpy()
        scaled = scaler.transform(imputed) if scaler is not None else np.asarray(imputed)
        coef = np.asarray(pipeline.named_steps["model"].coef_).reshape(-1)
        contributions = [
            {"feature": name, "contribution": round(float(c * z), 6)}
            for name, c, z in zip(feature_names, coef, np.asarray(scaled).reshape(-1))
        ]
        contributions.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    except (ValueError, AttributeError, TypeError):
        contributions = []

    feature_version = str(feature_dict.get("feature_version", FEATURE_VERSION))
    prediction = Prediction(
        session_id=session.id,
        model_version=record.version,
        feature_version=feature_version,
        risk=risk,
        xai_json=json.dumps(contributions, ensure_ascii=False),
        created_at=datetime.now(UTC),
    )
    db.add(prediction)
    db.flush()

    return {
        "risk": risk,
        "version": record.version,
        "xai": contributions,
        "disclaimer": DISCLAIMER,
        "feature_version": feature_version,
        "prediction_id": prediction.id,
    }

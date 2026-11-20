"""Offline sync endpoints with idempotent batch processing."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import Assessment, Clinic, Participant, SyncEvent, User
from app.routers.sessions import _get_session, add_samples_core, complete_session_core, create_session_core
from app.schemas import (
    AssessmentCreate,
    CompleteRequest,
    ParticipantCreate,
    SampleBatchIn,
    SessionCreate,
    SyncBatchIn,
    SyncBatchResponse,
    SyncEventIn,
    SyncResultItem,
    SyncStatus,
)
from app.security import get_current_user, require_clinician

router = APIRouter(prefix="/api/v1", tags=["sync"])


def _create_participant(db: Session, payload: dict[str, Any], actor: User) -> int:
    data = ParticipantCreate(**payload)
    if db.query(Participant).filter(Participant.research_id == data.research_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="research_id already exists")
    clinic_id = data.clinic_id if actor.role == "admin" else actor.clinic_id
    if clinic_id is not None and db.get(Clinic, clinic_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    participant = Participant(
        clinic_id=clinic_id,
        research_id=data.research_id,
        birth_year=data.birth_year,
        age=data.age,
        sex=data.sex,
        consent_guardian=data.consent_guardian,
        consent_assent=data.consent_assent,
        consent_date=data.consent_date,
    )
    db.add(participant)
    db.flush()
    log_action(
        db,
        actor,
        "CREATE_PARTICIPANT",
        entity="participant",
        entity_id=participant.id,
        meta={"source": "sync", "research_id": participant.research_id},
    )
    return participant.id


def _create_assessment(db: Session, payload: dict[str, Any], actor: User) -> int:
    participant_id = payload.get("participant_id")
    if not isinstance(participant_id, int):
        raise ValueError("participant_id is required")
    if db.get(Participant, participant_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    data = AssessmentCreate(**{k: v for k, v in payload.items() if k != "participant_id"})
    assessment = Assessment(
        participant_id=participant_id,
        kind=data.kind,
        version=data.version,
        scores_json=json.dumps(data.scores, ensure_ascii=False),
        assessed_at=data.assessed_at,
        notes=data.notes,
    )
    db.add(assessment)
    db.flush()
    log_action(
        db,
        actor,
        "CREATE_ASSESSMENT",
        entity="assessment",
        entity_id=assessment.id,
        meta={"source": "sync", "kind": data.kind},
    )
    return assessment.id


def _dispatch(db: Session, event: SyncEventIn, actor: User) -> int:
    """Apply one sync event and return the created resource id."""
    payload = dict(event.payload)
    # Accept both the SPEC-style names and the shorter names used by the SPA.
    event_type = {
        "PARTICIPANT_CREATE": "CREATE_PARTICIPANT",
        "SESSION_CREATE": "CREATE_SESSION",
        "SESSION_SAMPLES": "ADD_SAMPLES",
        "SESSION_COMPLETE": "COMPLETE_SESSION",
        "ASSESSMENT_CREATE": "CREATE_ASSESSMENT",
    }.get(event.type, event.type)

    if event_type == "CREATE_PARTICIPANT":
        return _create_participant(db, payload, actor)
    if event_type == "CREATE_SESSION":
        payload.setdefault("idempotency_key", event.idempotency_key)
        session = create_session_core(db, SessionCreate(**payload), actor)
        return session.id
    if event_type in {"ADD_SAMPLES", "COMPLETE_SESSION"}:
        session_id = payload.get("session_id")
        if not isinstance(session_id, int):
            raise ValueError("session_id is required")
        session = _get_session(db, session_id, actor)
        if event_type == "ADD_SAMPLES":
            add_samples_core(
                db,
                session,
                SampleBatchIn(**{k: v for k, v in payload.items() if k != "session_id"}),
                actor,
            )
        else:
            complete_session_core(
                db,
                session,
                CompleteRequest(**{k: v for k, v in payload.items() if k != "session_id"}),
                actor,
            )
        return session.id
    if event_type == "CREATE_ASSESSMENT":
        return _create_assessment(db, payload, actor)
    raise ValueError(f"Unsupported sync event type: {event.type}")


@router.post("/sync/batch", response_model=SyncBatchResponse)
def sync_batch(
    payload: SyncBatchIn,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> SyncBatchResponse:
    results: list[SyncResultItem] = []
    for event in payload.events:
        db.rollback()  # clear any state left by a previously failed event
        existing = db.get(SyncEvent, event.idempotency_key)
        if existing is not None:
            results.append(
                SyncResultItem(
                    idempotency_key=event.idempotency_key,
                    status="duplicate",
                    resource_id=existing.resource_id,
                )
            )
            continue
        try:
            resource_id = _dispatch(db, event, current)
            db.add(
                SyncEvent(
                    idempotency_key=event.idempotency_key,
                    type=event.type,
                    payload_json=json.dumps(event.payload, ensure_ascii=False, default=str),
                    resource_id=str(resource_id),
                    status="processed",
                )
            )
            log_action(
                db,
                current,
                "SYNC_EVENT",
                entity="sync_event",
                entity_id=event.idempotency_key,
                meta={"type": event.type, "resource_id": str(resource_id)},
            )
            db.commit()
            results.append(
                SyncResultItem(
                    idempotency_key=event.idempotency_key,
                    status="ok",
                    resource_id=str(resource_id),
                )
            )
        except (ValidationError, ValueError, HTTPException) as exc:
            db.rollback()
            detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
            results.append(
                SyncResultItem(
                    idempotency_key=event.idempotency_key,
                    status="error",
                    message=str(detail)[:500],
                )
            )
        except Exception as exc:  # noqa: BLE001 - one bad event must not break the batch
            db.rollback()
            results.append(
                SyncResultItem(
                    idempotency_key=event.idempotency_key,
                    status="error",
                    message=f"{type(exc).__name__}: {exc}"[:500],
                )
            )
    return SyncBatchResponse(results=results)


@router.get("/sync/status", response_model=SyncStatus)
def sync_status(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> SyncStatus:
    rows = db.query(SyncEvent).order_by(SyncEvent.created_at.desc()).all()
    by_type: dict[str, int] = {}
    for row in rows:
        by_type[row.type] = by_type.get(row.type, 0) + 1
    last: datetime | None = rows[0].created_at if rows else None
    processed = sum(1 for row in rows if row.status == "processed")
    return SyncStatus(
        total_events=len(rows),
        processed=processed,
        failed=sum(1 for row in rows if row.status == "failed"),
        by_type=by_type,
        last_sync_at=last,
    )

"""Participant registry endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import String, func, or_
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import Clinic, EyeTrackingSession, Participant, User
from app.routers import scoped_clinic_id
from app.schemas import (
    ParticipantCreate,
    ParticipantList,
    ParticipantOut,
    ParticipantUpdate,
    SessionList,
    SessionOut,
)
from app.security import get_current_user, require_clinician

router = APIRouter(prefix="/api/v1", tags=["participants"])


@router.get("/participants", response_model=ParticipantList)
def list_participants(
    search: str | None = None,
    clinic_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ParticipantList:
    query = db.query(Participant)
    allowed_clinic = scoped_clinic_id(current, clinic_id)
    if allowed_clinic is not None:
        query = query.filter(Participant.clinic_id == allowed_clinic)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Participant.research_id.ilike(pattern),
                func.cast(Participant.id, String).ilike(pattern),
            )
        )
    total = query.count()
    safe_skip, safe_limit = max(skip, 0), min(max(limit, 1), 500)
    items = (
        query.order_by(Participant.id.desc())
        .offset(safe_skip)
        .limit(safe_limit)
        .all()
    )
    return ParticipantList(
        items=[ParticipantOut.model_validate(item) for item in items],
        total=total,
        skip=safe_skip,
        limit=safe_limit,
    )


@router.post("/participants", response_model=ParticipantOut, status_code=status.HTTP_201_CREATED)
def create_participant(
    payload: ParticipantCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> ParticipantOut:
    if db.query(Participant).filter(Participant.research_id == payload.research_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="research_id already exists")
    clinic_id = payload.clinic_id if current.role == "admin" else current.clinic_id
    if clinic_id is not None and db.get(Clinic, clinic_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    participant = Participant(
        clinic_id=clinic_id,
        research_id=payload.research_id,
        birth_year=payload.birth_year,
        age=payload.age,
        sex=payload.sex,
        consent_guardian=payload.consent_guardian,
        consent_assent=payload.consent_assent,
        consent_date=payload.consent_date,
    )
    db.add(participant)
    db.flush()
    log_action(
        db,
        current,
        "CREATE_PARTICIPANT",
        entity="participant",
        entity_id=participant.id,
        meta={"research_id": participant.research_id},
    )
    db.commit()
    return ParticipantOut.model_validate(participant)


@router.get("/participants/{participant_id}", response_model=ParticipantOut)
def get_participant(
    participant_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ParticipantOut:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    if current.role != "admin" and participant.clinic_id != current.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return ParticipantOut.model_validate(participant)


@router.patch("/participants/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: int,
    payload: ParticipantUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> ParticipantOut:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    data = payload.model_dump(exclude_unset=True)
    if current.role != "admin":
        data.pop("clinic_id", None)
    for key, value in data.items():
        setattr(participant, key, value)
    log_action(db, current, "UPDATE_PARTICIPANT", entity="participant", entity_id=participant_id, meta=data)
    db.commit()
    return ParticipantOut.model_validate(participant)


@router.get("/participants/{participant_id}/sessions", response_model=SessionList)
def participant_sessions(
    participant_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> SessionList:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    query = (
        db.query(EyeTrackingSession)
        .join(Participant, EyeTrackingSession.participant_id == Participant.id)
        .filter(EyeTrackingSession.participant_id == participant_id)
    )
    if current.role != "admin":
        query = query.filter(Participant.clinic_id == current.clinic_id)
    items = query.order_by(EyeTrackingSession.created_at.desc()).all()
    return SessionList(
        items=[SessionOut.model_validate(item) for item in items],
        total=len(items),
        skip=0,
        limit=len(items),
    )

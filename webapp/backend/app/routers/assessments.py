"""Structured assessment endpoints, including the SNAP-IV parent rating scale."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import Assessment, Participant, User
from app.schemas import (
    AssessmentCreate,
    AssessmentList,
    AssessmentOut,
    ParentRatingCreate,
    ParentRatingDefinition,
)
from app.security import get_current_user, require_clinician
from app.services.rating_scales import (
    INSTRUMENT_ID,
    TITLE_FA,
    instrument_definition,
    score_snap4,
)

router = APIRouter(prefix="/api/v1", tags=["assessments"])


def _scoped_participant(db: Session, participant_id: int, current: User) -> Participant:
    """A non-admin may only access participants of their own clinic."""
    participant = db.get(Participant, participant_id)
    if participant is None or (
        current.role != "admin" and participant.clinic_id != current.clinic_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    return participant


@router.get("/rating-scales/parent", response_model=ParentRatingDefinition)
def get_parent_rating_definition(
    current: User = Depends(get_current_user),
) -> ParentRatingDefinition:
    """Item bank the client must render; scoring definition is server-owned."""
    return ParentRatingDefinition.model_validate(instrument_definition())


@router.post(
    "/participants/{participant_id}/parent-rating",
    response_model=AssessmentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_parent_rating(
    participant_id: int,
    payload: ParentRatingCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> AssessmentOut:
    """Persist raw answers + server-computed scores onto the participant record."""
    _scoped_participant(db, participant_id, current)
    answers = {answer.item_id: answer.value for answer in payload.answers}
    scores = score_snap4(answers)

    assessment = Assessment(
        participant_id=participant_id,
        kind="PARENT_RATING",
        version=INSTRUMENT_ID,
        scores_json=json.dumps(scores, ensure_ascii=False),
        assessed_at=payload.assessed_at,
        notes=payload.notes,
    )
    db.add(assessment)
    db.flush()
    log_action(
        db,
        current,
        "CREATE_ASSESSMENT",
        entity="assessment",
        entity_id=assessment.id,
        meta={
            "participant_id": participant_id,
            "kind": "PARENT_RATING",
            "instrument": INSTRUMENT_ID,
        },
    )
    db.commit()
    return AssessmentOut.model_validate(assessment)


@router.get("/participants/{participant_id}/assessments", response_model=AssessmentList)
def list_assessments(
    participant_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> AssessmentList:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    query = (
        db.query(Assessment)
        .filter(Assessment.participant_id == participant_id)
        .order_by(Assessment.created_at.desc())
    )
    total = query.count()
    safe_skip, safe_limit = max(skip, 0), min(max(limit, 1), 500)
    items = query.offset(safe_skip).limit(safe_limit).all()
    return AssessmentList(
        items=[AssessmentOut.model_validate(item) for item in items],
        total=total,
        skip=safe_skip,
        limit=safe_limit,
    )


@router.post(
    "/participants/{participant_id}/assessments",
    response_model=AssessmentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_assessment(
    participant_id: int,
    payload: AssessmentCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> AssessmentOut:
    if db.get(Participant, participant_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    assessment = Assessment(
        participant_id=participant_id,
        kind=payload.kind,
        version=payload.version,
        scores_json=json.dumps(payload.scores, ensure_ascii=False),
        assessed_at=payload.assessed_at,
        notes=payload.notes,
    )
    db.add(assessment)
    db.flush()
    log_action(
        db,
        current,
        "CREATE_ASSESSMENT",
        entity="assessment",
        entity_id=assessment.id,
        meta={"participant_id": participant_id, "kind": payload.kind},
    )
    db.commit()
    return AssessmentOut.model_validate(assessment)


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_clinician),
) -> None:
    assessment = db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    meta = {"participant_id": assessment.participant_id, "kind": assessment.kind}
    db.delete(assessment)
    log_action(db, current, "DELETE_ASSESSMENT", entity="assessment", entity_id=assessment_id, meta=meta)
    db.commit()

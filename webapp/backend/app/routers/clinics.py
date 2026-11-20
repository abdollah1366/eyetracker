"""Clinic management endpoints (admin)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import Clinic, User
from app.routers import scoped_clinic_id
from app.schemas import ClinicCreate, ClinicList, ClinicOut, ClinicUpdate
from app.security import get_current_user, require_admin

router = APIRouter(prefix="/api/v1", tags=["clinics"])


@router.get("/clinics", response_model=ClinicList)
def list_clinics(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ClinicList:
    query = db.query(Clinic)
    clinic_id = scoped_clinic_id(current, None)
    if clinic_id is not None:
        query = query.filter(Clinic.id == clinic_id)
    total = query.count()
    items = (
        query.order_by(Clinic.id)
        .offset(max(skip, 0))
        .limit(min(max(limit, 1), 500))
        .all()
    )
    return ClinicList(
        items=[ClinicOut.model_validate(item) for item in items],
        total=total,
        skip=max(skip, 0),
        limit=min(max(limit, 1), 500),
    )


@router.post("/clinics", response_model=ClinicOut, status_code=status.HTTP_201_CREATED)
def create_clinic(
    payload: ClinicCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> ClinicOut:
    if db.query(Clinic).filter(Clinic.code == payload.code).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Clinic code already exists")
    clinic = Clinic(name=payload.name, code=payload.code, is_active=payload.is_active)
    db.add(clinic)
    db.flush()
    log_action(db, current, "CREATE_CLINIC", entity="clinic", entity_id=clinic.id, meta={"code": clinic.code})
    db.commit()
    return ClinicOut.model_validate(clinic)


@router.patch("/clinics/{clinic_id}", response_model=ClinicOut)
def update_clinic(
    clinic_id: int,
    payload: ClinicUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> ClinicOut:
    clinic = db.get(Clinic, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and db.query(Clinic).filter(Clinic.code == data["code"], Clinic.id != clinic_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Clinic code already exists")
    for key, value in data.items():
        setattr(clinic, key, value)
    log_action(db, current, "UPDATE_CLINIC", entity="clinic", entity_id=clinic_id, meta=data)
    db.commit()
    return ClinicOut.model_validate(clinic)

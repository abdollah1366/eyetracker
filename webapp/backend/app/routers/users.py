"""User management endpoints (admin)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import Clinic, User
from app.schemas import UserCreate, UserList, UserOut, UserUpdate
from app.security import get_current_user, hash_password, require_admin

router = APIRouter(prefix="/api/v1", tags=["users"])


@router.get("/users", response_model=UserList)
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> UserList:
    query = db.query(User)
    if current.role != "admin":
        query = query.filter(User.clinic_id == current.clinic_id)
    total = query.count()
    items = (
        query.order_by(User.id)
        .offset(max(skip, 0))
        .limit(min(max(limit, 1), 500))
        .all()
    )
    return UserList(
        items=[UserOut.model_validate(item) for item in items],
        total=total,
        skip=max(skip, 0),
        limit=min(max(limit, 1), 500),
    )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> UserOut:
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    if payload.clinic_id is not None and db.get(Clinic, payload.clinic_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    user = User(
        clinic_id=payload.clinic_id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    log_action(db, current, "CREATE_USER", entity="user", entity_id=user.id, meta={"email": user.email, "role": user.role})
    db.commit()
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    if "clinic_id" in data and data["clinic_id"] is not None:
        if db.get(Clinic, data["clinic_id"]) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    for key, value in data.items():
        setattr(user, key, value)
    log_action(db, current, "UPDATE_USER", entity="user", entity_id=user_id, meta=data)
    db.commit()
    return UserOut.model_validate(user)

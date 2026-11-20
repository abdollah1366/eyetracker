"""Authentication endpoints: login, refresh, identity, password change."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db import get_db
from app.models import RefreshToken, User
from app.routers import build_user_ref
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RefreshResponse,
    TokenResponse,
    UserRef,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
    hash_password,
    hash_token,
    verify_password,
)

router = APIRouter(prefix="/api/v1", tags=["auth"])


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise _unauthorized("Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    refresh_token, refresh_record = create_refresh_token(user)
    db.add(refresh_record)
    log_action(db, user, "LOGIN", entity="user", entity_id=user.id, meta={"email": user.email})
    db.commit()
    return TokenResponse(
        access_token=create_access_token(user),
        token_type="bearer",
        refresh_token=refresh_token,
        user=build_user_ref(user),
    )


@router.post("/auth/refresh", response_model=RefreshResponse)
def refresh(
    request: Request,
    payload: RefreshRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> RefreshResponse:
    """Rotate a stored refresh token and return a fresh access token."""
    raw = payload.refresh_token if payload and payload.refresh_token else None
    if not raw:
        raw = request.cookies.get("refresh_token")
    if not raw:
        raise _unauthorized("Refresh token required")

    claims = decode_refresh_token(raw)
    record = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.jti == claims["jti"],
            RefreshToken.token_hash == hash_token(raw),
        )
        .first()
    )
    if record is None or record.revoked_at is not None:
        raise _unauthorized("Refresh token is no longer valid")

    expires_at = record.expires_at
    if expires_at.tzinfo is None:  # SQLite strips timezone information
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        raise _unauthorized("Refresh token expired")

    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise _unauthorized("User is inactive or no longer exists")

    new_refresh, new_record = create_refresh_token(user)
    record.revoked_at = datetime.now(UTC)
    db.add(new_record)
    log_action(db, user, "REFRESH_TOKEN", entity="user", entity_id=user.id)
    db.commit()

    return RefreshResponse(
        access_token=create_access_token(user),
        token_type="bearer",
        refresh_token=new_refresh,
        user=build_user_ref(user),
    )


@router.get("/auth/me", response_model=UserRef)
def me(current: User = Depends(get_current_user)) -> UserRef:
    return build_user_ref(current)


@router.post("/auth/change-password", response_model=UserRef)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> UserRef:
    if not verify_password(payload.old_password, current.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect")
    current.password_hash = hash_password(payload.new_password)
    log_action(db, current, "CHANGE_PASSWORD", entity="user", entity_id=current.id)
    db.commit()
    return build_user_ref(current)

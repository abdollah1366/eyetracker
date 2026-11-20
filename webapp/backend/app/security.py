"""Password hashing, JWT handling and role-based dependencies."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import RefreshToken, User

_bearer = HTTPBearer(auto_error=False, description="Bearer <JWT>")
Credentials = HTTPAuthorizationCredentials | None
DbDependency = Session


def hash_password(password: str) -> str:
    """Hash a password with bcrypt (salt is generated per call)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time bcrypt verification; never raises on bad input."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user: User) -> str:
    """Create a signed JWT carrying the user id and role."""
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def hash_token(raw_token: str) -> str:
    """SHA-256 digest used to persist refresh tokens without storing secrets."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_refresh_token(user: User) -> tuple[str, RefreshToken]:
    """Issue a long-lived refresh JWT and its server-side tracking record."""
    now = datetime.now(UTC)
    expires = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = uuid.uuid4().hex
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "type": "refresh",
        "jti": jti,
        "iat": now,
        "exp": expires,
    }
    raw = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    record = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw),
        jti=jti,
        expires_at=expires,
    )
    return raw, record


def decode_refresh_token(token: str) -> dict[str, Any]:
    """Validate a refresh JWT. Raises 401 when invalid or of the wrong type."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub", "jti"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if payload.get("type") != "refresh" or not str(payload["sub"]).isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises 401 on any problem."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if not str(payload.get("sub", "")).isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_user(
    credentials: Credentials = Depends(_bearer),
    db: DbDependency = Depends(get_db),
) -> User:
    """Dependency resolving the authenticated, active user."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive or no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*allowed: str) -> Callable[..., User]:
    """Build a dependency that restricts an endpoint to the given roles."""

    def _dependency(current: User = Depends(get_current_user)) -> User:
        if current.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current

    return _dependency


require_admin = require_roles("admin")
require_clinician = require_roles("admin", "clinician")
require_researcher = require_roles("admin", "researcher")

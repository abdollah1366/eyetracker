"""API routers (all mounted under /api/v1)."""

from __future__ import annotations

from app.models import User
from app.schemas import UserRef


def build_user_ref(user: User) -> UserRef:
    """Build the compact user payload used by auth endpoints."""
    return UserRef(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        clinic_id=user.clinic_id,
        clinic_name=user.clinic.name if user.clinic else None,
    )


def scoped_clinic_id(user: User, requested: int | None) -> int | None:
    """Non-admin users are restricted to their own clinic."""
    if user.role == "admin":
        return requested
    return user.clinic_id

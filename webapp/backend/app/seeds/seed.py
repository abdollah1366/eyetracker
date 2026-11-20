"""Idempotent startup seeding: default clinic, admin user, quality config."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Clinic, QualityConfig, User
from app.security import hash_password


def seed_db(db: Session) -> None:
    """Create baseline records only when they do not already exist."""
    clinic = db.query(Clinic).filter(Clinic.code == settings.DEFAULT_CLINIC_CODE).first()
    if clinic is None:
        clinic = Clinic(
            name=settings.DEFAULT_CLINIC_NAME,
            code=settings.DEFAULT_CLINIC_CODE,
            is_active=True,
        )
        db.add(clinic)
        db.flush()

    admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL.strip().lower()).first()
    if admin is None:
        admin = User(
            clinic_id=clinic.id,
            email=settings.ADMIN_EMAIL.strip().lower(),
            password_hash=hash_password(settings.ADMIN_PASSWORD),
            name=settings.ADMIN_NAME,
            role="admin",
            is_active=True,
        )
        db.add(admin)

    if db.get(QualityConfig, 1) is None:
        db.add(
            QualityConfig(
                id=1,
                min_valid_gaze_ratio=settings.MIN_VALID_GAZE_RATIO,
                max_tracking_gap_s=settings.MAX_TRACKING_GAP_SEC,
                brightness_min=settings.BRIGHTNESS_MIN,
                brightness_max=settings.BRIGHTNESS_MAX,
                max_calibration_error_px=settings.MAX_CALIBRATION_ERROR_PX,
            )
        )
    db.commit()

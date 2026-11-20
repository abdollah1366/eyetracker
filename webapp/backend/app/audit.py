"""Audit-log helper used by every sensitive action."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def log_action(
    db: Session,
    user: User | None,
    action: str,
    entity: str | None = None,
    entity_id: int | str | None = None,
    meta: dict[str, Any] | None = None,
) -> AuditLog:
    """Stage an audit entry in the current transaction.

    The caller owns the commit; adding and flushing here ensures the entry is
    part of the same atomic unit of work as the action it describes.
    """
    entry = AuditLog(
        user_id=user.id if user is not None else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        meta_json=json.dumps(meta, ensure_ascii=False, default=str) if meta is not None else None,
    )
    db.add(entry)
    db.flush()
    return entry

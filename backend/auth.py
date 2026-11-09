import hmac
from typing import Optional

from fastapi import Header, HTTPException

from backend.config import settings


def require_staff(x_staff_key: Optional[str] = Header(default=None)):
    if not settings.staff_key:
        raise HTTPException(503, "Server has no STAFF_KEY set")
    if not x_staff_key or not hmac.compare_digest(x_staff_key, settings.staff_key):
        raise HTTPException(401, "Staff key required")

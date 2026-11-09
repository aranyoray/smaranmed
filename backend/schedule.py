from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Tuple


def as_date(value) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value)[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def display_date(value) -> str:
    parsed = as_date(value)
    if parsed is None:
        return "" if value is None else str(value)
    return f"{parsed.day} {parsed.strftime('%b %Y')}"


def recall_presentation(
    next_recall,
    status: str,
    threshold: int = 90,
    today: Optional[date] = None,
) -> Tuple[str, str]:
    """Scheduling label only. Does not look at lab values."""
    parsed = as_date(next_recall)
    current = status or "due"
    if parsed is None:
        return current, ""
    day = today or date.today()
    days = (day - parsed).days
    if days > threshold:
        return "overdue", f"Overdue {days} days"
    if current == "slipping":
        if days > 0:
            return "slipping", f"Slipping, {days} days past recall"
        return "slipping", "Pattern slipping"
    if days > 0:
        return "due", f"Due {days} days ago"
    return "due", f"Due in {abs(days)} days"


def days_past_recall(next_recall, today: Optional[date] = None) -> Optional[int]:
    parsed = as_date(next_recall)
    if parsed is None:
        return None
    return ((today or date.today()) - parsed).days

"""Plain-language queue search: 'critical and reachable this week' -> filters.

Parsing is keyword rules over cockpit-keywords.json, optionally refined by an
LLM. Filtering is plain Python over scheduling fields, so the result is
explainable: the response lists the filters that were applied.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional

from backend.replies import find_phrase, keywords
from backend.schedule import as_date

UNREACHABLE = {"opt_out", "wrong_number", "deceased", "moved"}
CRITICAL_PRIORITY = 0.5
WINDOWS = {"today": 0, "week": 7, "month": 30}


def parse_query(text: str) -> dict:
    words = keywords()["search"]
    found = {"statuses": [], "critical": False, "reachable": False, "escalated": False,
             "lang": None, "due_within_days": None, "min_age": None, "max_age": None}
    for status in ("overdue", "slipping", "due"):
        if find_phrase(text, words[status]):
            found["statuses"].append(status)
    for flag in ("critical", "reachable", "escalated"):
        found[flag] = bool(find_phrase(text, words[flag]))
    for lang in ("bn", "en"):
        if find_phrase(text, words[lang]):
            found["lang"] = lang
    for window, days in WINDOWS.items():
        if find_phrase(text, words[window]):
            found["due_within_days"] = days
            break
    lowered = (text or "").lower()
    over = re.search(r"(?:over|above|older than|>)\s*(\d{2})|(\d{2})\s*\+", lowered)
    under = re.search(r"(?:under|below|younger than|<)\s*(\d{2})", lowered)
    if over:
        found["min_age"] = int(over.group(1) or over.group(2))
    if under:
        found["max_age"] = int(under.group(1))
    return found


def describe(filters: dict) -> list:
    parts = []
    if filters.get("statuses"):
        parts.append(" or ".join(filters["statuses"]))
    if filters.get("critical"):
        parts.append("high priority or escalated")
    if filters.get("escalated"):
        parts.append("escalated")
    if filters.get("reachable"):
        parts.append("reachable by phone")
    if filters.get("due_within_days") is not None:
        days = filters["due_within_days"]
        parts.append("due by today" if days == 0 else f"due within {days} days")
    if filters.get("lang"):
        parts.append({"bn": "Bengali", "en": "English"}[filters["lang"]])
    if filters.get("min_age"):
        parts.append(f"age {filters['min_age']}+")
    if filters.get("max_age"):
        parts.append(f"under {filters['max_age']}")
    return parts


def matches(p: dict, filters: dict, today: Optional[date] = None) -> bool:
    today = today or date.today()
    if filters.get("statuses") and p.get("status") not in filters["statuses"]:
        return False
    if filters.get("critical") and not (p.get("escalated_at") or (p.get("priority_score") or 0) >= CRITICAL_PRIORITY):
        return False
    if filters.get("escalated") and not p.get("escalated_at"):
        return False
    if filters.get("reachable") and (not p.get("phone") or p.get("outcome") in UNREACHABLE):
        return False
    if filters.get("lang") and p.get("lang") != filters["lang"]:
        return False
    days = filters.get("due_within_days")
    if days is not None:
        recall = as_date(p.get("next_recall"))
        if recall is None or recall > today + timedelta(days=days):
            return False
    age = p.get("age")
    if filters.get("min_age") and (age is None or age < filters["min_age"]):
        return False
    if filters.get("max_age") and (age is None or age >= filters["max_age"]):
        return False
    return True


def run_search(patients: list, text: str, llm_parse=None, today: Optional[date] = None) -> dict:
    filters = parse_query(text)
    by = "rule"
    if llm_parse and not describe(filters):
        try:
            refined = llm_parse(text)
            if refined:
                filters, by = {**filters, **refined}, "llm"
        except Exception:
            pass
    hits = [p for p in patients if matches(p, filters, today)]
    hits.sort(key=lambda p: p.get("priority_score") or 0, reverse=True)
    return {"filters": filters, "applied": describe(filters), "by": by, "ids": [p["id"] for p in hits]}

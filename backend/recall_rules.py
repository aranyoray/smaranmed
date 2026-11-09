"""Transparent recall rules: when each test is next due.

Defaults follow published intervals (ADA Standards of Care in Diabetes,
sections 6, 10, 11, 12; RSSDI clinical practice recommendations). Every
interval is a plain number the doctor can edit in settings. This decides
scheduling only. It never interprets a result for the patient.
"""

from __future__ import annotations

import calendar
from datetime import date
from typing import Optional

from backend.schedule import as_date, display_date

DEFAULT_RULES = [
    {
        "test": "hba1c", "label": "HbA1c", "months": 6,
        "months_off_goal": 3, "goal_below": 7.0,
        "source": "ADA 6: at least twice a year at goal, quarterly if not at goal or therapy changed",
    },
    {"test": "lipid", "label": "Lipid profile", "months": 12, "source": "ADA 10: at diagnosis, then yearly"},
    {"test": "uacr", "label": "Urine albumin (UACR)", "months": 12, "source": "ADA 11: at least yearly"},
    {"test": "egfr", "label": "Kidney function (eGFR)", "months": 12, "source": "ADA 11: at least yearly"},
    {"test": "eye", "label": "Retinal eye exam", "months": 12, "source": "ADA 12: yearly, 1-2 years if normal"},
    {"test": "foot", "label": "Foot exam", "months": 12, "source": "ADA 12: at least yearly"},
]

SLIP_FACTOR = 1.5
STRETCH_FACTOR = 1.2


def add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def rule_months(rule: dict, latest_value) -> int:
    goal = rule.get("goal_below")
    off_goal = rule.get("months_off_goal")
    if goal is not None and off_goal and latest_value is not None and float(latest_value) >= float(goal):
        return int(off_goal)
    return int(rule["months"])


def _history(labs: list, test: str) -> list:
    rows = [
        (as_date(lab.get("result_date")), lab.get("value"))
        for lab in labs
        if (lab.get("test_type") or "").lower() == test
    ]
    return sorted((d, v) for d, v in rows if d is not None)


def slipping(history: list, rule: dict) -> Optional[str]:
    """A plain reason when visit gaps are stretching, else None."""
    if len(history) < 2:
        return None
    gaps = [(b[0] - a[0]).days for a, b in zip(history, history[1:])]
    expected = rule_months(rule, history[-2][1]) * 30
    last = gaps[-1]
    if last > expected * SLIP_FACTOR:
        return f"Last {rule['label']} came {round(last / 30)} months after the one before"
    if len(gaps) >= 2 and gaps[-1] > gaps[-2] > 0 and last > expected * STRETCH_FACTOR:
        return f"Time between {rule['label']} tests is getting longer"
    return None


def compute_recall(labs: list, rules: Optional[list] = None, today: Optional[date] = None) -> dict:
    """Next recall across every test on file, plus the tests driving it."""
    rules = rules or DEFAULT_RULES
    today = today or date.today()
    items = []
    slip = None
    for rule in rules:
        history = _history(labs, rule["test"])
        if not history:
            continue
        last_day, last_value = history[-1]
        months = rule_months(rule, last_value)
        due = add_months(last_day, months)
        items.append({
            "test": rule["test"], "label": rule["label"], "months": months,
            "last": last_day.isoformat(), "due": due.isoformat(), "overdue_days": max(0, (today - due).days),
        })
        slip = slip or slipping(history, rule)

    if not items:
        return {"next_recall": None, "reason": "", "items": [], "slipping": None}

    items.sort(key=lambda item: item["due"])
    first = items[0]
    due_now = [item["label"] for item in items if as_date(item["due"]) <= today]
    if len(due_now) > 1:
        reason = f"{', '.join(due_now)} due"
    else:
        reason = f"{first['label']} every {first['months']} months, last {display_date(first['last'])}"
    return {"next_recall": first["due"], "reason": reason, "items": items, "slipping": slip}


def validate_rules(rules: list) -> list:
    clean = []
    seen = set()
    for rule in rules:
        test = str(rule.get("test", "")).strip().lower()
        months = int(rule.get("months", 0))
        if not test or test in seen or not 1 <= months <= 36:
            raise ValueError(f"Invalid rule for {test or 'unknown test'}")
        seen.add(test)
        row = {
            "test": test,
            "label": str(rule.get("label") or test),
            "months": months,
            "source": str(rule.get("source") or "Clinic rule"),
        }
        if rule.get("months_off_goal"):
            off = int(rule["months_off_goal"])
            if not 1 <= off <= 36:
                raise ValueError(f"Invalid off-goal interval for {test}")
            row["months_off_goal"] = off
            row["goal_below"] = float(rule.get("goal_below") or 7.0)
        clean.append(row)
    return clean

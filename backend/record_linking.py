import re
from datetime import date

from rapidfuzz import fuzz

LINK_THRESHOLD = 0.75

HONORIFICS = re.compile(r"\b(sri|smt|dr|mr|mrs|ms|shri|srimati)\b", re.IGNORECASE)


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits if len(digits) == 10 else raw


def normalize_name(name: str) -> str:
    name = HONORIFICS.sub("", name.lower()).strip()
    return " ".join(name.split())


def name_similarity(a: str, b: str) -> float:
    a_norm, b_norm = normalize_name(a), normalize_name(b)
    if not a_norm or not b_norm:
        return 0.0
    char_sim = fuzz.ratio(a_norm, b_norm) / 100.0
    token_sim = fuzz.token_sort_ratio(a_norm, b_norm) / 100.0
    return max(char_sim, token_sim)


def link_confidence(rec_a: dict, rec_b: dict) -> float:
    score = 0.0

    phone_a = normalize_phone(rec_a.get("phone_raw", "") or "")
    phone_b = normalize_phone(rec_b.get("phone_raw", "") or "")
    if phone_a and phone_b and phone_a == phone_b:
        score += 0.50

    name_sim = name_similarity(rec_a.get("name_raw", "") or "", rec_b.get("name_raw", "") or "")
    score += 0.35 * name_sim

    age_a, age_b = rec_a.get("age"), rec_b.get("age")
    if age_a and age_b and abs(age_a - age_b) <= 1:
        score += 0.15

    return min(score, 1.0)


def match_record_to_patients(record: dict, patients: list) -> tuple:
    best_id = None
    best_score = 0.0
    for p in patients:
        patient_as_rec = {
            "name_raw": p.get("name", ""),
            "phone_raw": p.get("phone", ""),
            "age": p.get("age"),
        }
        score = link_confidence(record, patient_as_rec)
        if score > best_score:
            best_score = score
            best_id = p["id"]
    if best_score >= LINK_THRESHOLD:
        return best_id, best_score
    return None, best_score


def hba1c_slope(results: list[dict]) -> dict:
    if len(results) < 2:
        return {"direction": "insufficient", "slope_per_month": 0.0, "latest": results[0]["value"] if results else None, "first": results[0]["value"] if results else None}

    dates = []
    values = []
    for r in results:
        d = r.get("result_date")
        if isinstance(d, str):
            d = date.fromisoformat(d)
        dates.append(d)
        values.append(r["value"])

    base = min(dates)
    x = [(d - base).days for d in dates]
    y = values

    n = len(x)
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_x2 = sum(xi ** 2 for xi in x)

    denom = n * sum_x2 - sum_x ** 2
    if denom == 0:
        return {"direction": "flat", "slope_per_month": 0.0, "latest": y[-1], "first": y[0]}

    slope = (n * sum_xy - sum_x * sum_y) / denom
    slope_per_month = slope * 30

    direction = "rising" if slope_per_month > 0.02 else "improving" if slope_per_month < -0.02 else "steady"
    return {"direction": direction, "slope_per_month": round(slope_per_month, 3), "latest": y[-1], "first": y[0]}

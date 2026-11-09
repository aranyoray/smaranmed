"""Record linkage: one patient from many messy lab, billing and EHR entries.

Pipeline per candidate pair:
1. Phone normalisation (+91 / 0 prefixes, punctuation).
2. Bengali-aware name keys: Bengali script is transliterated, then common
   romanisation variants collapse (sh/s, bh/b, v/w/b, o/a, ee/i, oo/u,
   ow/ou/au, final e), so Ghosh/Ghose and Chowdhury/Choudhury/Chaudhuri match.
3. Jaro-Winkler on the keys, token by token, so an extra surname still matches.
4. Sex is a hard gate and birth year a soft one, so family members who share
   one phone do not merge.
5. An ambiguous best match (a close runner-up) is left for human review.
"""

import re
from datetime import date
from typing import Optional

from rapidfuzz.distance import JaroWinkler

LINK_THRESHOLD = 0.80
AMBIGUITY_MARGIN = 0.05
FIRST_NAME_GATE = 0.90

W_PHONE = 0.40
W_NAME = 0.45
W_BIRTH_YEAR = 0.15
BIRTH_YEAR_PENALTY = 0.25

HONORIFICS = re.compile(r"\b(sri|smt|dr|mr|mrs|ms|shri|srimati|late|baby|master)\b\.?", re.IGNORECASE)

ALIASES = {
    "md": "mohammad", "mohd": "mohammad", "mohammed": "mohammad",
    "muhammad": "mohammad", "mohamed": "mohammad", "kr": "kumar",
}

# Bengali script -> Latin. Consonants carry an inherent vowel unless followed
# by a vowel sign, a hasant or the end of the word.
_BN_VOWELS = {
    "অ": "a", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u", "ঋ": "ri",
    "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou",
}
_BN_SIGNS = {
    "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri",
    "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou",
}
_BN_CONSONANTS = {
    "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng", "চ": "ch", "ছ": "chh",
    "জ": "j", "ঝ": "jh", "ঞ": "n", "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh",
    "ণ": "n", "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n", "প": "p",
    "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m", "য": "j", "র": "r", "ল": "l",
    "শ": "sh", "ষ": "sh", "স": "s", "হ": "h", "ড়": "r", "ঢ়": "r", "য়": "y",
}
_BN_OTHER = {"ৎ": "t", "ং": "ng", "ঃ": "h", "ঁ": "", "্": "", "‌": "", "‍": ""}
_HASANT = "্"

# Applied in order to a lowercase Latin token.
_PHONETIC_RULES = [
    (r"que$", "k"), (r"ow|ou|au", "au"), (r"chh", "c"), (r"ch", "c"), (r"sh", "s"), (r"ph", "f"), (r"bh", "b"),
    (r"([kgjtd])h", r"\1"), (r"[vw]", "b"), (r"z", "j"), (r"q", "k"),
    (r"x", "ks"), (r"ck", "k"), (r"y", "i"), (r"ee", "i"), (r"oo", "u"),
    (r"o", "a"), (r"(.{3,})e$", r"\1"),
    (r"(.)\1+", r"\1"),
]

_SEX = {
    "m": "m", "male": "m", "man": "m", "পুরুষ": "m",
    "f": "f", "female": "f", "woman": "f", "মহিলা": "f", "নারী": "f",
}


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits if len(digits) == 10 else raw


def transliterate_bengali(text: str) -> str:
    out = []
    chars = list(text)
    for i, ch in enumerate(chars):
        if ch in _BN_CONSONANTS:
            out.append(_BN_CONSONANTS[ch])
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
            word_ends = not nxt or nxt.isspace() or nxt in _BN_OTHER and nxt != _HASANT
            if nxt not in _BN_SIGNS and nxt != _HASANT and not word_ends:
                out.append("a")
        elif ch in _BN_VOWELS:
            out.append(_BN_VOWELS[ch])
        elif ch in _BN_SIGNS:
            out.append(_BN_SIGNS[ch])
        elif ch in _BN_OTHER:
            out.append(_BN_OTHER[ch])
        else:
            out.append(ch)
    return "".join(out)


def normalize_name(name: str) -> str:
    name = transliterate_bengali(name or "").lower()
    name = HONORIFICS.sub(" ", name)
    name = re.sub(r"[^a-z\s]", " ", name)
    return " ".join(ALIASES.get(t, t) for t in name.split())


def phonetic_key(token: str) -> str:
    for pattern, repl in _PHONETIC_RULES:
        token = re.sub(pattern, repl, token)
    return token


def name_keys(name: str) -> list:
    return [k for k in (phonetic_key(t) for t in normalize_name(name).split()) if k]


def _jw(a: str, b: str) -> float:
    return JaroWinkler.normalized_similarity(a, b)


def name_similarity(a: str, b: str) -> float:
    ka, kb = name_keys(a), name_keys(b)
    if not ka or not kb:
        return 0.0
    short, long_ = (ka, kb) if len(ka) <= len(kb) else (kb, ka)
    token_sim = sum(max(_jw(t, u) for u in long_) for t in short) / len(short)
    whole_sim = _jw(" ".join(sorted(ka)), " ".join(sorted(kb)))
    sim = max(token_sim, whole_sim)
    # Same surname, different first name: a spouse or sibling, not the same person.
    if _jw(ka[0], kb[0]) < FIRST_NAME_GATE:
        sim = min(sim, 0.5)
    return sim


def normalize_sex(raw) -> Optional[str]:
    if raw is None:
        return None
    return _SEX.get(str(raw).strip().lower())


def _as_year(value) -> Optional[int]:
    if not value:
        return None
    if isinstance(value, date):
        return value.year
    match = re.match(r"(\d{4})", str(value))
    return int(match.group(1)) if match else None


def birth_year(rec: dict, today: Optional[date] = None) -> Optional[int]:
    if rec.get("birth_year"):
        return int(rec["birth_year"])
    age = rec.get("age")
    if age in (None, ""):
        return None
    data = rec.get("data") or {}
    seen = _as_year(rec.get("record_date") or data.get("record_date")) or (today or date.today()).year
    return seen - int(age)


def link_evidence(rec_a: dict, rec_b: dict) -> tuple:
    """Return (score 0-1, reasons) for whether two records are the same person."""
    reasons = []
    sex_a = normalize_sex(rec_a.get("sex"))
    sex_b = normalize_sex(rec_b.get("sex"))
    if sex_a and sex_b and sex_a != sex_b:
        return 0.0, ["sex differs"]

    score = 0.0
    phone_a = normalize_phone(rec_a.get("phone_raw", "") or "")
    phone_b = normalize_phone(rec_b.get("phone_raw", "") or "")
    if phone_a and phone_b and phone_a == phone_b:
        score += W_PHONE
        reasons.append("phone")

    name_sim = name_similarity(rec_a.get("name_raw", "") or "", rec_b.get("name_raw", "") or "")
    score += W_NAME * name_sim
    if name_sim >= 0.9:
        reasons.append("phonetic name")

    year_a, year_b = birth_year(rec_a), birth_year(rec_b)
    if year_a and year_b:
        gap = abs(year_a - year_b)
        if gap <= 1:
            score += W_BIRTH_YEAR
            reasons.append("birth year")
        elif gap >= 3:
            score -= BIRTH_YEAR_PENALTY
            reasons.append("birth year differs")
    if sex_a and sex_b:
        reasons.append("sex")

    return max(0.0, min(score, 1.0)), reasons


def link_confidence(rec_a: dict, rec_b: dict) -> float:
    return link_evidence(rec_a, rec_b)[0]


def _patient_as_record(p: dict) -> dict:
    return {
        "name_raw": p.get("name", ""),
        "phone_raw": p.get("phone", ""),
        "age": p.get("age"),
        "birth_year": p.get("birth_year"),
        "sex": p.get("sex"),
    }


def match_details(record: dict, patients: list) -> dict:
    """Best candidate for a record, or none when below threshold or ambiguous."""
    scored = []
    for p in patients:
        score, reasons = link_evidence(record, _patient_as_record(p))
        scored.append((score, p["id"], reasons))
    scored.sort(key=lambda row: row[0], reverse=True)
    if not scored:
        return {"patient_id": None, "score": 0.0, "reasons": [], "ambiguous": False}
    best_score, best_id, reasons = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    ambiguous = best_score >= LINK_THRESHOLD and runner_up >= LINK_THRESHOLD and best_score - runner_up < AMBIGUITY_MARGIN
    linked = best_score >= LINK_THRESHOLD and not ambiguous
    return {
        "patient_id": best_id if linked else None,
        "score": best_score,
        "reasons": reasons,
        "ambiguous": ambiguous,
        "candidate_id": best_id,
    }


def match_record_to_patients(record: dict, patients: list) -> tuple:
    found = match_details(record, patients)
    return found["patient_id"], found["score"]


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

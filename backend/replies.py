"""Read a patient's reply and decide what happens to their place in the queue.

Rules come first and are deterministic: any red-flag phrase escalates to the
doctor, whatever else the message says. An LLM is consulted only when no rule
matches, and it can never downgrade an escalation.
"""

from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from pathlib import Path

KEYWORDS_FILE = Path(__file__).resolve().parent.parent / "cockpit-keywords.json"

# Highest priority first.
INTENT_ORDER = ["escalate", "deceased", "opt_out", "wrong_number", "moved", "elsewhere", "callback", "coming"]

# intent -> (leave the call queue?, queue label)
ACTIONS = {
    "escalate": (False, "Escalated to doctor"),
    "deceased": (True, "Reported deceased"),
    "opt_out": (True, "Asked to stop messages"),
    "wrong_number": (True, "Wrong number"),
    "moved": (True, "Moved away"),
    "elsewhere": (True, "Testing elsewhere"),
    "callback": (False, "Asked for a call back"),
    "coming": (True, "Will come in"),
    "unclear": (False, "Reply needs a person to read"),
}


@lru_cache(maxsize=1)
def keywords() -> dict:
    return json.loads(KEYWORDS_FILE.read_text(encoding="utf-8"))


def _is_word_char(ch: str) -> bool:
    return ch == "_" or unicodedata.category(ch)[0] in "LMN"


def _has_word(text: str, word: str) -> bool:
    # Bengali words take suffixes (ঘা-টা, আসবো), so only anchor their start.
    whole = word.isascii() or word.isdigit()
    start = text.find(word)
    while start != -1:
        end = start + len(word)
        before_ok = start == 0 or not _is_word_char(text[start - 1])
        after_ok = not whole or end == len(text) or not _is_word_char(text[end])
        if before_ok and after_ok:
            return True
        start = text.find(word, start + 1)
    return False


def find_phrase(text: str, words: list):
    lowered = (text or "").lower()
    for word in words:
        if _has_word(lowered, word):
            return word
    return None


def classify_by_rules(text: str) -> dict:
    replies = keywords()["replies"]
    for intent in INTENT_ORDER:
        hit = find_phrase(text, replies[intent]["words"])
        if hit:
            return {"intent": intent, "matched": hit, "by": "rule"}
    return {"intent": "unclear", "matched": None, "by": "rule"}


def plan(intent: str, matched=None, by: str = "rule") -> dict:
    leaves_queue, label = ACTIONS.get(intent, ACTIONS["unclear"])
    return {
        "intent": intent,
        "label": label,
        "leaves_queue": leaves_queue,
        "escalate": intent == "escalate",
        "matched": matched,
        "by": by,
    }


def classify(text: str, llm_classify=None) -> dict:
    """Rules first; optional `llm_classify(text) -> intent` only for unclear replies."""
    found = classify_by_rules(text)
    if found["intent"] == "unclear" and llm_classify:
        try:
            guess = llm_classify(text)
        except Exception:
            guess = None
        if guess in ACTIONS:
            return plan(guess, None, "llm")
    return plan(found["intent"], found["matched"], found["by"])

from __future__ import annotations

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate

from backend import db
from backend.agents.fallbacks import llm_with_fallback
from backend.observability import logger, tracker


class PatientPriority(BaseModel):
    id: str
    score: float = Field(ge=0, le=1, description="Urgency score 0-1")
    reason: str = Field(description="One-line reason for this priority")


class PriorityList(BaseModel):
    patients: list[PatientPriority]


PRIORITY_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a care coordination assistant.
Score each patient's follow-up urgency from 0.0 (no urgency) to 1.0 (critical to contact today).

Scoring factors:
- Days past the recall date (more = higher)
- Missed recall windows
- Time since the last visit

Use scheduling urgency only. Do not mention lab values or clinical severity.
Return a score and one-line reason for each patient."""),
    ("human", "{patient_summaries}"),
])


def run_prioritize() -> list[PatientPriority]:
    patients = db.fetch_patients()
    if not patients:
        return []

    summaries = []
    for p in patients:
        summaries.append(
            f"ID: {p['id']}, Name: {p['name']}, Status: {p['status']}, "
            f"Label: {p.get('label', '')}, Last visit: {p.get('last_visit', 'unknown')}, "
            f"Next recall: {p.get('next_recall', 'unknown')}"
        )

    chain = PRIORITY_PROMPT | llm_with_fallback.with_structured_output(PriorityList)
    try:
        result = chain.invoke(
            {"patient_summaries": "\n".join(summaries)},
            config={"callbacks": [tracker]},
        )
        for pp in result.patients:
            db.update_patient_priority(pp.id, pp.score)
            logger.info("Priority: %s = %.2f (%s)", pp.id, pp.score, pp.reason)
        return result.patients
    except Exception:
        logger.exception("Prioritization failed")
        return []

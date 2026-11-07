from __future__ import annotations

from typing import TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from backend import db
from backend.agents.fallbacks import llm_with_fallback, OutreachError, retry_llm
from backend.models import OutreachDraft, QualityCheck
from backend.observability import logger, tracker
from backend.record_linking import hba1c_slope


class OutreachState(TypedDict, total=False):
    patient_id: str
    patient_context: dict
    lab_history: list
    prior_drafts: list
    policy_ok: bool
    draft: dict
    quality_pass: bool
    retry_count: int
    error: str


DRAFT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an outreach coordinator for Barasat Diabetes & Diagnostics clinic.
Your job: draft a brief, warm follow-up message reminding the patient of their upcoming or overdue visit.

RULES:
- Reference specific dates from their visit history
- Keep it under 3 sentences per language
- DO NOT mention HbA1c values, lab results, or any clinical numbers
- DO NOT give medical advice, suggest treatments, or interpret health data
- DO NOT reference diagnosis or clinical status
- The message should feel personal, not templated
- Use the patient's first name

Generate in both English and Bengali."""),
    ("human", """Patient: {name}
Last visit: {last_visit}
Status: {status}. {label}
Language preference: {lang}
Recall reason: {recall_reason}
Number of prior outreach attempts: {prior_count}

{prior_context}

Generate a follow-up reminder message."""),
])

QUALITY_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a quality checker for clinic outreach messages.
Check the following message and report whether it passes quality standards.

A message FAILS if it:
- Contains medical advice or treatment suggestions
- Mentions lab values, HbA1c, blood sugar, or any clinical numbers
- Uses the wrong patient name
- Is missing either the English or Bengali version
- Sounds robotic or templated

A message PASSES if it is warm, personal, references visit history, and avoids all clinical content."""),
    ("human", """Patient name: {name}
English message: {en}
Bengali message: {bn}

Does this pass quality check?"""),
])

memory = MemorySaver()


def gather_context(state: OutreachState) -> OutreachState:
    pid = state["patient_id"]
    patient = db.fetch_patient(pid)
    labs = db.fetch_labs(pid)
    prior = db.fetch_recent_outreach(pid, limit=3)
    return {
        **state,
        "patient_context": patient,
        "lab_history": labs,
        "prior_drafts": [d["message"] for d in prior],
    }


def check_policy(state: OutreachState) -> OutreachState:
    patient = state.get("patient_context", {})
    ok = bool(patient.get("phone")) and not patient.get("contacted_at")
    if not ok:
        logger.warning("Policy check failed for patient %s", state["patient_id"])
    return {**state, "policy_ok": ok}


@retry_llm
def generate_draft(state: OutreachState) -> OutreachState:
    patient = state.get("patient_context", {})
    prior = state.get("prior_drafts", [])
    prior_context = f"Previous messages sent:\n" + "\n".join(f"- {m}" for m in prior) if prior else "No prior outreach."

    chain = DRAFT_PROMPT | llm_with_fallback.with_structured_output(OutreachDraft)
    try:
        draft = chain.invoke(
            {
                "name": patient.get("name", "Patient"),
                "last_visit": patient.get("last_visit", "unknown"),
                "status": patient.get("status", "due"),
                "label": patient.get("label", ""),
                "lang": patient.get("lang", "en"),
                "recall_reason": patient.get("recall_reason", "routine"),
                "prior_count": len(prior),
                "prior_context": prior_context,
            },
            config={"callbacks": [tracker]},
        )
    except Exception:
        logger.exception("LLM draft generation failed for %s", state["patient_id"])
        return {**state, "draft": None, "error": "AI draft generation failed. Please try again."}
    return {**state, "draft": draft}


@retry_llm
def validate_quality(state: OutreachState) -> OutreachState:
    draft = state.get("draft")
    if not draft:
        return {**state, "quality_pass": False, "retry_count": 99}

    patient = state.get("patient_context", {})
    chain = QUALITY_PROMPT | llm_with_fallback.with_structured_output(QualityCheck)
    try:
        result = chain.invoke(
            {"name": patient.get("name", ""), "en": draft.en, "bn": draft.bn},
            config={"callbacks": [tracker]},
        )
        passes = bool(result.passes) and not draft.contains_medical_advice
    except Exception:
        logger.exception("Quality check failed for %s", state.get("patient_id"))
        passes = False

    retry_count = state.get("retry_count", 0)
    return {**state, "quality_pass": passes, "retry_count": retry_count + (0 if passes else 1)}


def save_draft(state: OutreachState) -> OutreachState:
    draft = state.get("draft")
    pid = state["patient_id"]
    if draft:
        db.save_outreach_draft(pid, "en", draft.en)
        db.save_outreach_draft(pid, "bn", draft.bn)
        logger.info("Saved outreach drafts for %s", pid)
    return state


def route_policy(state: OutreachState) -> str:
    return "generate_draft" if state.get("policy_ok") else "end"


def route_quality(state: OutreachState) -> str:
    if not state.get("draft"):
        return "end"
    if state.get("quality_pass"):
        return "save_draft"
    if state.get("retry_count", 0) >= 2:
        logger.warning("Quality check failed after retries for %s", state.get("patient_id"))
        return "end"
    return "generate_draft"


def build_outreach_graph():
    g = StateGraph(OutreachState)
    g.add_node("gather_context", gather_context)
    g.add_node("check_policy", check_policy)
    g.add_node("generate_draft", generate_draft)
    g.add_node("validate_quality", validate_quality)
    g.add_node("save_draft", save_draft)

    g.set_entry_point("gather_context")
    g.add_edge("gather_context", "check_policy")
    g.add_conditional_edges("check_policy", route_policy, {"generate_draft": "generate_draft", "end": END})
    g.add_edge("generate_draft", "validate_quality")
    g.add_conditional_edges(
        "validate_quality",
        route_quality,
        {"save_draft": "save_draft", "generate_draft": "generate_draft", "end": END},
    )
    g.add_edge("save_draft", END)

    return g.compile(checkpointer=memory)


outreach_graph = build_outreach_graph()


def run_outreach(patient_id: str):
    config = {"configurable": {"thread_id": patient_id}}
    result = outreach_graph.invoke({"patient_id": patient_id, "retry_count": 0}, config=config)
    if result.get("quality_pass") and result.get("draft"):
        return result.get("draft")
    return None

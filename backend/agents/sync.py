from __future__ import annotations

from typing import TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from backend import db
from backend.agents.fallbacks import llm_with_fallback, retry_llm
from backend.models import Signal
from backend.observability import logger, tracker
from backend.record_linking import match_record_to_patients
from backend.schedule import days_past_recall, recall_presentation


class SyncState(TypedDict, total=False):
    sync_run_id: int
    unlinked: list
    patients: list
    links_made: int
    signals_generated: int
    records_processed: int
    error: str


PATTERN_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a clinic records analyst for Barasat Diabetes & Diagnostics.
Analyze the patient's visit and lab history to surface patterns a care coordinator should know about.

RULES:
- Focus on visit frequency, gaps between visits, and trends in attendance
- Note if records from multiple systems were linked
- DO NOT interpret clinical significance of lab values
- DO NOT suggest diagnosis or treatment
- DO NOT give medical advice
- Keep each signal to one clear sentence
- Generate 2-3 signals maximum

Return as a JSON list of objects with "text" field only."""),
    ("human", """Patient: {name} (ID: {patient_id})
Status: {status}
Last visit: {last_visit}
Next recall: {next_recall}
Number of linked source records: {source_count}
Visit dates: {visit_dates}"""),
])


class SignalOutput(BaseModel):
    signals: list[Signal] = Field(description="List of 2-3 pattern signals")


class SignalList(TypedDict):
    signals: list[dict]


def load_data(state: SyncState) -> SyncState:
    patients = db.fetch_patients()
    unlinked = db.fetch_unlinked_records()
    run = db.create_sync_run()
    logger.info("Sync started: %d unlinked records, %d patients", len(unlinked), len(patients))
    return {
        **state,
        "sync_run_id": run["id"] if run else 0,
        "patients": patients,
        "unlinked": unlinked,
        "links_made": 0,
        "signals_generated": 0,
        "records_processed": 0,
    }


def match_records(state: SyncState) -> SyncState:
    patients = state.get("patients", [])
    unlinked = state.get("unlinked", [])
    links = 0

    for rec in unlinked:
        try:
            patient_id, confidence = match_record_to_patients(rec, patients)
            if not patient_id:
                continue
            db.link_record(rec["id"], patient_id, confidence)
            db.insert_signal(
                patient_id,
                f"New record from {rec.get('source_system', 'unknown')} linked with {confidence:.0%} confidence.",
                confidence=confidence,
                sub_text=f"Matched source ID {rec.get('source_id', '?')} on phone + name.",
                source="system",
            )
            links += 1
            logger.info("Linked record %s to patient %s (%.2f)", rec.get("source_id"), patient_id, confidence)
        except Exception:
            logger.exception("Link failed for record %s", rec.get("source_id"))

    return {
        **state,
        "links_made": state.get("links_made", 0) + links,
        "records_processed": state.get("records_processed", 0) + len(unlinked),
    }


@retry_llm
def detect_patterns(state: SyncState) -> SyncState:
    patients = state.get("patients", [])
    signals_count = 0

    for patient in patients:
        pid = patient["id"]
        events = db.fetch_events(pid)
        source_recs = db.get_db().table("source_records").select("id").eq("patient_id", pid).execute()
        visit_dates = ", ".join(str(e.get("event_date", "")) for e in events if e.get("event_type") in ("visit", "lab"))
        db.delete_ai_signals(pid)

        try:
            chain = PATTERN_PROMPT | llm_with_fallback.with_structured_output(SignalOutput)
            result = chain.invoke(
                {
                    "name": patient.get("name", ""),
                    "patient_id": pid,
                    "status": patient.get("status", ""),
                    "last_visit": patient.get("last_visit", "unknown"),
                    "next_recall": patient.get("next_recall", "unknown"),
                    "source_count": len(source_recs.data) if source_recs.data else 0,
                    "visit_dates": visit_dates or "none recorded",
                },
                config={"callbacks": [tracker]},
            )
            for sig in result.signals:
                db.insert_signal(pid, sig.text, source="ai")
                signals_count += 1
        except Exception:
            logger.exception("Pattern detection failed for %s", pid)

    return {**state, "signals_generated": state.get("signals_generated", 0) + signals_count}


def update_priorities(state: SyncState) -> SyncState:
    patients = state.get("patients", [])
    threshold = 90
    try:
        settings = db.fetch_settings()
        if settings and settings.get("overdue_days"):
            threshold = int(settings["overdue_days"])
    except Exception:
        logger.exception("Using the default overdue threshold")

    for patient in patients:
        if patient.get("contacted_at"):
            continue
        status, label = recall_presentation(
            patient.get("next_recall"),
            patient.get("status") or "due",
            threshold,
        )
        days = days_past_recall(patient.get("next_recall"))
        score = 0.0
        if days is not None and days > 0:
            score += min(days / 365, 0.5)
        if status == "overdue":
            score += 0.15
        elif status == "slipping":
            score += 0.10
        db.update_patient_priority(patient["id"], round(min(score, 1.0), 3))
        if label:
            db.update_patient_status(patient["id"], status, label)

    return state


def save_results(state: SyncState) -> SyncState:
    run_id = state.get("sync_run_id", 0)
    processed = state.get("records_processed", 0)
    linked = state.get("links_made", 0)
    signals = state.get("signals_generated", 0)
    if run_id:
        try:
            db.complete_sync_run(run_id, processed, linked, signals)
        except Exception:
            logger.exception("Could not finish sync run %s", run_id)
            try:
                db.complete_sync_run(run_id, processed, linked, signals, status="failed", error="Could not write the sync result.")
            except Exception:
                logger.exception("Could not mark sync run %s failed", run_id)
    logger.info(
        "Sync complete: %d processed, %d linked, %d signals",
        state.get("records_processed", 0),
        state.get("links_made", 0),
        state.get("signals_generated", 0),
    )
    return state


def build_sync_graph():
    g = StateGraph(SyncState)
    g.add_node("load_data", load_data)
    g.add_node("match_records", match_records)
    g.add_node("detect_patterns", detect_patterns)
    g.add_node("update_priorities", update_priorities)
    g.add_node("save_results", save_results)

    g.set_entry_point("load_data")
    g.add_edge("load_data", "match_records")
    g.add_edge("match_records", "detect_patterns")
    g.add_edge("detect_patterns", "update_priorities")
    g.add_edge("update_priorities", "save_results")
    g.add_edge("save_results", END)

    return g.compile()


sync_graph = build_sync_graph()


def run_sync() -> dict:
    result = sync_graph.invoke({})
    return {
        "sync_run_id": result.get("sync_run_id", 0),
        "records_processed": result.get("records_processed", 0),
        "records_linked": result.get("links_made", 0),
        "signals_generated": result.get("signals_generated", 0),
    }

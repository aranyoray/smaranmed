from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from postgrest.exceptions import APIError
from supabase import create_client, Client

from backend.config import settings

_client: Optional[Client] = None


def get_db() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _missing_row(exc: APIError) -> bool:
    text = " ".join(str(part) for part in (getattr(exc, "message", ""), getattr(exc, "details", "")))
    return "0 rows" in text or "PGRST116" in text


def fetch_patients():
    db = get_db()
    rows = (
        db.table("patients")
        .select("*")
        .is_("contacted_at", "null")
        .order("priority_score", desc=True)
        .execute()
    )
    return rows.data


def fetch_patient(patient_id: str):
    db = get_db()
    try:
        row = db.table("patients").select("*").eq("id", patient_id).maybe_single().execute()
    except APIError as exc:
        if _missing_row(exc):
            return None
        raise
    if not row:
        return None
    return row.data


def fetch_labs(patient_id: str):
    db = get_db()
    rows = db.table("lab_results").select("*").eq("patient_id", patient_id).eq("test_type", "hba1c").order("result_date").execute()
    return rows.data


def fetch_events(patient_id: str):
    db = get_db()
    rows = db.table("events").select("*").eq("patient_id", patient_id).order("event_date", desc=True).execute()
    return rows.data


def fetch_signals(patient_id: str):
    db = get_db()
    rows = db.table("signals").select("*").eq("patient_id", patient_id).order("created_at", desc=True).execute()
    return rows.data


_DEFAULT_SETTINGS = {
    "sync_schedule": "06:10",
    "default_lang": "auto",
    "overdue_days": 90,
    "outreach_channel": "whatsapp",
}


def fetch_settings():
    db = get_db()
    try:
        row = db.table("settings").select("*").eq("id", 1).maybe_single().execute()
    except APIError as exc:
        if _missing_row(exc):
            return dict(_DEFAULT_SETTINGS)
        raise
    if not row or not row.data:
        return dict(_DEFAULT_SETTINGS)
    return row.data


def update_settings(data: dict):
    db = get_db()
    row = db.table("settings").update(data).eq("id", 1).execute()
    if row.data:
        return row.data[0]
    return fetch_settings()


def save_outreach_draft(patient_id: str, lang: str, message: str, agent_run_id: Optional[str] = None):
    db = get_db()
    row = db.table("outreach_drafts").insert({
        "patient_id": patient_id,
        "lang": lang,
        "message": message,
        "agent_run_id": agent_run_id,
    }).execute()
    return row.data[0] if row.data else None


def approve_outreach(patient_id: str) -> int:
    db = get_db()
    pending = (
        db.table("outreach_drafts")
        .select("id")
        .eq("patient_id", patient_id)
        .eq("status", "draft")
        .execute()
    )
    rows = pending.data or []
    if not rows:
        return 0
    db.table("outreach_drafts").update({"status": "approved"}).eq("patient_id", patient_id).eq("status", "draft").execute()
    return len(rows)


def fetch_outreach_pair(patient_id: str):
    db = get_db()
    rows = (
        db.table("outreach_drafts")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    found = {"en": None, "bn": None}
    for row in rows.data or []:
        lang = row.get("lang")
        if lang in found and found[lang] is None:
            found[lang] = row.get("message") or ""
    if found["en"] is None and found["bn"] is None:
        return None
    return {
        "en": found["en"] or "",
        "bn": found["bn"] or "",
        "references_visit": True,
        "contains_medical_advice": False,
    }


def mark_contacted(patient_id: str):
    db = get_db()
    db.table("patients").update({"contacted_at": _utc_now()}).eq("id", patient_id).execute()


def delete_ai_signals(patient_id: str):
    db = get_db()
    db.table("signals").delete().eq("patient_id", patient_id).eq("source", "ai").execute()


def fetch_unlinked_records():
    db = get_db()
    rows = db.table("source_records").select("*").is_("patient_id", "null").execute()
    return rows.data


def link_record(record_id: int, patient_id: str, confidence: float):
    db = get_db()
    db.table("source_records").update({
        "patient_id": patient_id,
        "confidence": confidence,
        "linked_at": _utc_now(),
    }).eq("id", record_id).execute()


def insert_signal(patient_id: str, text: str, confidence: Optional[float] = None, sub_text: Optional[str] = None, source: str = "ai"):
    db = get_db()
    db.table("signals").insert({
        "patient_id": patient_id,
        "text": text,
        "confidence": confidence,
        "sub_text": sub_text,
        "source": source,
    }).execute()


def update_patient_status(patient_id: str, status: str, label: str):
    db = get_db()
    db.table("patients").update({"status": status, "label": label}).eq("id", patient_id).execute()


def update_patient_priority(patient_id: str, score: float):
    db = get_db()
    db.table("patients").update({"priority_score": score}).eq("id", patient_id).execute()


def create_sync_run():
    db = get_db()
    row = db.table("sync_runs").insert({"status": "running"}).execute()
    return row.data[0] if row.data else None


def complete_sync_run(run_id: int, records_processed: int, records_linked: int, signals_generated: int, status: str = "completed", error: Optional[str] = None):
    db = get_db()
    db.table("sync_runs").update({
        "completed_at": _utc_now(),
        "records_processed": records_processed,
        "records_linked": records_linked,
        "signals_generated": signals_generated,
        "status": status,
        "error": error,
    }).eq("id", run_id).execute()


def fetch_latest_sync():
    db = get_db()
    rows = db.table("sync_runs").select("*").order("started_at", desc=True).limit(1).execute()
    return rows.data[0] if rows.data else None


def fetch_recent_outreach(patient_id: str, limit: int = 3):
    db = get_db()
    rows = db.table("outreach_drafts").select("*").eq("patient_id", patient_id).order("created_at", desc=True).limit(limit).execute()
    return rows.data


def fetch_labs_by_patient(patient_ids: list, test_type: Optional[str] = "hba1c") -> dict:
    """One query for many patients, keyed by patient id."""
    grouped = {pid: [] for pid in patient_ids}
    if not patient_ids:
        return grouped
    db = get_db()
    query = db.table("lab_results").select("*").in_("patient_id", patient_ids)
    if test_type:
        query = query.eq("test_type", test_type)
    for row in query.order("result_date").execute().data or []:
        grouped.setdefault(row["patient_id"], []).append(row)
    return grouped


def fetch_all_labs(patient_id: str):
    return fetch_labs_by_patient([patient_id], test_type=None)[patient_id]


def count_source_records(patient_id: str) -> int:
    return link_stats(patient_id)[0]


def link_stats(patient_id: str) -> tuple:
    """(number of linked source records, weakest link confidence or None)."""
    db = get_db()
    rows = db.table("source_records").select("confidence").eq("patient_id", patient_id).execute().data or []
    scores = [r["confidence"] for r in rows if r.get("confidence") is not None]
    return len(rows), (min(scores) if scores else None)


def flag_record_for_review(record_id: int):
    db = get_db()
    db.table("source_records").update({"review": True}).eq("id", record_id).execute()


def update_patient_recall(patient_id: str, next_recall: Optional[str], recall_reason: str):
    db = get_db()
    db.table("patients").update({"next_recall": next_recall, "recall_reason": recall_reason}).eq("id", patient_id).execute()


def fetch_recall_rules() -> Optional[list]:
    return fetch_settings().get("recall_rules")


def save_recall_rules(rules: list):
    return update_settings({"recall_rules": rules}).get("recall_rules")


def insert_event(patient_id: str, title: str, detail: str = "", event_type: str = "reply"):
    db = get_db()
    db.table("events").insert({
        "patient_id": patient_id,
        "event_date": datetime.now(timezone.utc).date().isoformat(),
        "title": title,
        "detail": detail,
        "event_type": event_type,
    }).execute()


def record_reply(patient_id: str, text: str, plan: dict):
    db = get_db()
    db.table("patient_replies").insert({
        "patient_id": patient_id,
        "text": text,
        "intent": plan["intent"],
        "matched": plan.get("matched"),
        "classified_by": plan.get("by", "rule"),
    }).execute()

    update = {"outcome": plan["intent"], "label": plan["label"]}
    if plan["leaves_queue"]:
        update["contacted_at"] = _utc_now()
    if plan["escalate"]:
        update["escalated_at"] = _utc_now()
        update["priority_score"] = 1.0
    db.table("patients").update(update).eq("id", patient_id).execute()


def mark_outreach_sent(patient_id: str) -> int:
    db = get_db()
    rows = (
        db.table("outreach_drafts")
        .update({"status": "sent"})
        .eq("patient_id", patient_id)
        .eq("status", "approved")
        .execute()
    )
    return len(rows.data or [])


def fetch_all_patients():
    """Every patient, contacted or not. Record linkage must see all of them."""
    db = get_db()
    return db.table("patients").select("*").execute().data


def fetch_source_records(source_system: str):
    db = get_db()
    return db.table("source_records").select("source_id, data").eq("source_system", source_system).execute().data or []


def insert_source_records(records: list) -> int:
    if not records:
        return 0
    db = get_db()
    inserted = 0
    for start in range(0, len(records), 500):
        rows = db.table("source_records").insert(records[start:start + 500]).execute()
        inserted += len(rows.data or [])
    return inserted


def attach_lab_from_record(record: dict, patient_id: str):
    """Copy a mirrored lab result into lab_results once its record is linked."""
    data = record.get("data") or {}
    if not data.get("test_type") or not data.get("result_date"):
        return
    db = get_db()
    db.table("lab_results").insert({
        "patient_id": patient_id,
        "test_type": data["test_type"],
        "value": data.get("value"),
        "unit": data.get("unit"),
        "result_date": data["result_date"],
        "source_system": record.get("source_system"),
    }).execute()

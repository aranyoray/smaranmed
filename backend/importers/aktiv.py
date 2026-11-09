"""Read-only mirror of an AKTIV lab export into source_records.

    python -m backend.importers.aktiv export.csv            # import
    python -m backend.importers.aktiv export.csv --dry-run  # parse and report only

AKTIV (or any LIS) exports differ by site, so columns are found by alias.
Add a site's header names to COLUMNS below, never edit the export itself.
Nothing is written back to AKTIV. Each row becomes one unlinked
source_record carrying its lab result in `data`; the nightly sync links it
to a patient and copies the result into lab_results.

Re-running is safe: rows already mirrored (same source_id, test and date)
are skipped. Rows without a name or a date are reported and skipped.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import date, datetime
from typing import Optional

COLUMNS = {
    "source_id": ["patient id", "patientid", "pid", "uhid", "reg no", "registration no", "lab no", "mrn", "id"],
    "name": ["patient name", "name", "patient"],
    "phone": ["mobile", "mobile no", "phone", "contact", "contact no", "phone no"],
    "age": ["age", "age (yrs)", "age(y)"],
    "sex": ["sex", "gender"],
    "test": ["test", "test name", "investigation", "parameter", "test code"],
    "value": ["result", "value", "result value", "observed value"],
    "unit": ["unit", "units", "uom"],
    "date": ["report date", "result date", "collection date", "sample date", "date", "reported on"],
}

# Normalised test name -> lab_results.test_type
TESTS = {
    "hba1c": ["hba1c", "glycated haemoglobin", "glycated hemoglobin", "glycosylated haemoglobin", "glycosylated hemoglobin", "a1c"],
    "lipid": ["lipid profile", "lipid", "ldl", "ldl cholesterol", "total cholesterol"],
    "uacr": ["uacr", "urine albumin creatinine ratio", "microalbumin", "urine microalbumin", "acr"],
    "egfr": ["egfr", "creatinine", "serum creatinine"],
    "fbs": ["fbs", "fasting blood sugar", "fasting glucose", "fasting plasma glucose"],
    "ppbs": ["ppbs", "post prandial", "pp blood sugar", "postprandial glucose"],
}

DATE_FORMATS = ["%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%b-%Y", "%d %b %Y", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"]


def _key(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def map_columns(header: list) -> dict:
    found = {}
    lookup = {_key(h): h for h in header}
    for field, aliases in COLUMNS.items():
        for alias in aliases:
            if alias in lookup:
                found[field] = lookup[alias]
                break
    return found


def parse_date(raw: str) -> Optional[date]:
    raw = (raw or "").strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def parse_test(raw: str) -> Optional[str]:
    key = _key(raw)
    for test, names in TESTS.items():
        if any(name == key or name in key for name in names):
            return test
    return None


def parse_value(raw: str) -> Optional[float]:
    match = re.search(r"-?\d+(?:\.\d+)?", raw or "")
    return float(match.group()) if match else None


def parse_age(raw: str) -> Optional[int]:
    match = re.match(r"\s*(\d{1,3})", raw or "")
    return int(match.group(1)) if match else None


def parse_rows(rows: list) -> tuple:
    """Return (records, problems). Pure: no database access."""
    if not rows:
        return [], ["Export is empty"]
    cols = map_columns(list(rows[0].keys()))
    missing = [f for f in ("name", "date") if f not in cols]
    if missing:
        return [], [f"No column found for: {', '.join(missing)}. Add the header to COLUMNS in backend/importers/aktiv.py"]

    records, problems = [], []
    get = lambda row, field: (row.get(cols[field]) or "").strip() if field in cols else ""
    for n, row in enumerate(rows, start=2):
        name, day = get(row, "name"), parse_date(get(row, "date"))
        if not name or not day:
            problems.append(f"Row {n}: missing name or unreadable date")
            continue
        test = parse_test(get(row, "test"))
        source_id = get(row, "source_id") or f"AKT-{n}"
        records.append({
            "source_id": source_id,
            "source_system": "aktiv",
            "name_raw": name,
            "phone_raw": get(row, "phone"),
            "age": parse_age(get(row, "age")),
            "sex": get(row, "sex") or None,
            "record_date": day.isoformat(),
            "data": {
                "test_type": test,
                "test_raw": get(row, "test"),
                "value": parse_value(get(row, "value")) if test else None,
                "unit": get(row, "unit") or None,
                "result_date": day.isoformat(),
            },
        })
    return records, problems


def _fingerprint(rec: dict) -> tuple:
    data = rec.get("data") or {}
    return rec.get("source_id"), data.get("test_raw") or data.get("test_type"), data.get("result_date")


def import_file(path: str, dry_run: bool = False) -> dict:
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    records, problems = parse_rows(rows)
    summary = {"rows": len(rows), "parsed": len(records), "inserted": 0, "skipped_existing": 0, "problems": problems}
    if dry_run or not records:
        return summary

    from backend import db

    existing = {_fingerprint(r) for r in db.fetch_source_records("aktiv")}
    fresh = [r for r in records if _fingerprint(r) not in existing]
    summary["skipped_existing"] = len(records) - len(fresh)
    summary["inserted"] = db.insert_source_records(fresh)
    return summary


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    summary = import_file(args.path, args.dry_run)
    print(f"{summary['rows']} rows, {summary['parsed']} parsed, {summary['inserted']} inserted, "
          f"{summary['skipped_existing']} already mirrored")
    for problem in summary["problems"][:20]:
        print(" -", problem)
    return 1 if summary["problems"] and not summary["parsed"] else 0


if __name__ == "__main__":
    sys.exit(main())

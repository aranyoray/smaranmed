# Smaran

A follow-up cockpit for diabetes care teams in West Bengal. It reads the lab and billing records a clinic already keeps, links the many entries that belong to one person, checks each timeline against published recall intervals, and gives a ranked call list with a ready-to-send Bengali or English message. A person presses send; the doctor decides every clinical question.

- `index.html`: the cockpit (who needs a call today). This is the product.
- `checkin.html`: an optional patient check-in, kept as a separate experiment. The cockpit needs no patient app and no new data entry.

All data in this repo is fictional.

## How it works

| Piece | Where |
|---|---|
| AKTIV lab export, mirrored read-only into `source_records` (columns found by alias; re-runs skip rows already mirrored; results reach `lab_results` once the sync links them) | `backend/importers/aktiv.py`, sample in `eval/samples/aktiv_sample.csv` |
| Record linkage: phone normalisation, Bengali-aware phonetic name keys (Bengali script transliterated; sh/s, bh/b, v/w/b, o/a, ee/i, oo/u, Chowdhury/Choudhury/Chaudhuri collapse), Jaro-Winkler token matching, sex gate, birth-year check, ambiguous matches held for review | `backend/record_linking.py` |
| Linkage evaluation against ground truth | `eval/linkage_eval.py` |
| Recall rules engine (ADA / RSSDI intervals, doctor-editable) | `backend/recall_rules.py`, `GET/PUT /api/recall-rules` |
| Nightly pipeline (LangGraph): re-link new records, AI pattern notes, recompute recalls and priority | `backend/agents/sync.py`, run by `backend/scheduler.py` |
| Plain-language search ("critical and reachable this week") | `backend/search.py`, `POST /api/search` |
| Reply handling: sorts patient replies (moved, testing elsewhere, wrong number, stop, will come, call back) and escalates any symptom or medicine question to the doctor | `backend/replies.py`, `POST /api/patients/{id}/reply` |
| Outreach drafts with clinical-content guard, then WhatsApp / SMS link after approval | `backend/agents/outreach.py`, `POST /api/outreach/{id}/send` |

Reply and search rules live in `cockpit-keywords.json`, read by both the server and the browser (`cockpit-rules.js`), so the static demo behaves like the server. Rules always run first; an LLM is only asked when no rule matches, and it can never downgrade an escalation.

### Recall rules (defaults)

| Test | Interval | Source |
|---|---|---|
| HbA1c | 3 months if last result at or above 7%, else 6 months | ADA Standards of Care, section 6 |
| Lipid profile | 12 months | ADA section 10 |
| Urine albumin (UACR), eGFR | 12 months | ADA section 11 |
| Retinal eye exam, foot exam | 12 months | ADA section 12 |

The earliest due test sets the recall date. "Slipping" means the last gap between tests was more than 1.5 times the interval, or gaps keep stretching. These rules drive scheduling only, never a diagnosis.

### Linkage evaluation

```
python -m eval.linkage_eval                     # synthetic, fictional records
python -m eval.linkage_eval --records real.csv  # a labelled export (kept out of the repo)
```

On the synthetic set (400 people, seed 7): precision 100%, recall 84.5%, against 97.6% / 82.4% for the earlier fuzzy matcher. The synthetic data includes households sharing a phone, namesakes, Bengali script, typos and variants the linker is expected to miss (Bose/Basu, Banerjee/Bandyopadhyay). Synthetic results are not clinic results. Real patient records stay out of this repo; to measure precision on them, run the script with `--records` on a labelled export.

## Run it

```
cp .env.example .env        # fill in Supabase, OpenAI and STAFF_KEY
psql < supabase/schema.sql && psql < supabase/seed.sql
# existing database: psql < supabase/migrations/002_pitch_alignment.sql
pip install -r requirements.txt
uvicorn backend.main:app --port 8000
```

Mirror a lab export, then let the sync link it:

```
python -m backend.importers.aktiv export.csv --dry-run   # check columns first
python -m backend.importers.aktiv export.csv
python -m backend.scheduler --once
```

Open http://localhost:8000 and enter the staff key in Settings. Without a server the page runs on built-in demo data.

### Security

- Every `/api` route except `/api/health` needs the `X-Staff-Key` header. The server refuses to serve data if `STAFF_KEY` is unset.
- CORS allows only `ALLOWED_ORIGINS`.
- Supabase tables have RLS on with no policies: the service-role key used by the API bypasses RLS, and the public anon key can read nothing.
- Convex `draft.generate`, `drafts.latest` and `drafts.approve` check the same key (`npx convex env set STAFF_KEY ...`).

## Tests

```
node --test tests/                    # check-in engine, cockpit rules
python -m unittest discover tests     # linkage, recall rules, replies, search
```

## Weekly check-in (separate experiment)

A branched, contradiction-aware question flow for cardiometabolic (CKM) health, focused on diabetes. It never diagnoses; it tells people which test to do next and when.

- **Max 10 questions per person.** Order is safety first (symptoms, red flags, last test, value), then habits; lower-priority questions drop when the cap is hit.
- **Branches by status:** known diabetes (meds, low-sugar spells, yearly eye / kidney / foot / lipid checks), borderline, told normal, never tested.
- **Contradiction-aware:** conflicting answers trigger a short "Quick check" question, within a session (told normal but picked a high number; told borderline but never tested; very active but breathless) and across weeks (diabetes last week, "normal" today).
- **Continuity:** returning users are asked whether they did the test suggested last time; age and family history are remembered.
- **Next test dates** from ADA intervals (HbA1c every 3 months above target, 6 months at target; yearly kidney, eye, lipids), NP-NCD screening from 30, and the Indian Diabetes Risk Score (Mohan 2005).
- **1-line tips** after answers, e.g. "Testing BP once a month can help catch diabetic hypertension early."
- **Points:** earned once a week (10 per answer, 50 for finishing, streak bonus for consecutive weeks, 100 for getting a suggested test done), plus badges.
- Reminders as a calendar file and a WhatsApp share. Data stays on the phone (localStorage).

Engine (`checkin-engine.js`) is pure JS with no DOM.

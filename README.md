# Smaran

Diabetes continuity-of-care demo for clinics in West Bengal.

- `index.html`: clinic follow-up cockpit (who needs a call today).
- `checkin.html`: patient weekly check-in (English / বাংলা).

## Weekly check-in

A branched, contradiction-aware question flow for cardiometabolic (CKM) health, focused on diabetes. It never diagnoses; it tells people which test to do next and when.

- **Max 10 questions per person.** Order is safety first (symptoms, red flags, last test, value), then habits; lower-priority questions drop when the cap is hit.
- **Branches by status:** known diabetes (meds, low-sugar spells, yearly eye / kidney / foot / lipid checks), borderline, told normal, never tested.
- **Contradiction-aware:** conflicting answers trigger a short "Quick check" question, within a session (told normal but picked a high number; told borderline but never tested; very active but breathless) and across weeks (diabetes last week, "normal" today).
- **Continuity:** returning users are asked whether they did the test suggested last time; age and family history are remembered.
- **Next test dates** from ADA intervals (HbA1c every 3 months above target, 6 months at target; yearly kidney, eye, lipids), NP-NCD screening from 30, and the Indian Diabetes Risk Score (Mohan 2005).
- **1-line tips** after answers, e.g. "Testing BP once a month can help catch diabetic hypertension early."
- **Points:** earned once a week (10 per answer, 50 for finishing, streak bonus for consecutive weeks, 100 for getting a suggested test done), plus badges.
- Reminders as a calendar file and a WhatsApp share. Data stays on the phone (localStorage).

Engine (`checkin-engine.js`) is pure JS with no DOM, tested with `node --test tests/checkin.test.js`.

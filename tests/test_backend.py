# Run: python -m unittest discover tests
import unittest
from datetime import date

import csv
from pathlib import Path

from backend.importers.aktiv import parse_date, parse_rows, parse_test
from backend.recall_rules import DEFAULT_RULES, compute_recall, validate_rules
from backend.record_linking import match_details, name_keys, name_similarity, transliterate_bengali
from backend.replies import classify
from backend.search import run_search

TODAY = date(2026, 11, 9)


def labs(*rows, test="hba1c"):
    return [{"test_type": test, "result_date": d, "value": v} for d, v in rows]


class RecordLinking(unittest.TestCase):
    def test_romanisation_variants_share_a_key(self):
        for a, b in [("Ghosh", "Ghose"), ("Chowdhury", "Chaudhuri"), ("Biswas", "Viswas"),
                     ("Subir", "Shubir"), ("Nasima Khatun", "Nasima Khatoon"), ("Md Rafiq", "Mohammad Rafiq")]:
            self.assertEqual(name_keys(a), name_keys(b), (a, b))

    def test_bengali_script_matches_latin(self):
        self.assertEqual(transliterate_bengali("ঘোষ"), "ghosh")
        self.assertEqual(name_similarity("মধুমিতা ঘোষ", "Madhumita Ghosh"), 1.0)

    def test_extra_surname_still_matches(self):
        self.assertGreaterEqual(name_similarity("Bimal Roy Chowdhury", "Bimal Roy"), 0.99)

    def test_family_sharing_a_phone_does_not_merge(self):
        patients = [{"id": "R", "name": "Rina Das", "phone": "+919830003125", "age": 52, "sex": "F"}]
        sister = {"name_raw": "Rita Das", "phone_raw": "9830003125", "age": 52}
        husband = {"name_raw": "Rina Das", "phone_raw": "9830003125", "age": 58, "sex": "M"}
        self.assertIsNone(match_details(sister, patients)["patient_id"])
        self.assertIsNone(match_details(husband, patients)["patient_id"])

    def test_same_person_new_record_links(self):
        patients = [{"id": "B", "name": "Bimal Roy", "phone": "+919830002380", "age": 71}]
        found = match_details({"name_raw": "Sri Bimal Ray", "phone_raw": "098300 02380", "age": 71}, patients)
        self.assertEqual(found["patient_id"], "B")
        self.assertIn("phone", found["reasons"])

    def test_ambiguous_match_goes_to_review(self):
        patients = [
            {"id": "A", "name": "Amit Sen", "phone": "9830000001", "birth_year": 1980},
            {"id": "B", "name": "Amit Sen", "phone": "9830000001", "birth_year": 1980},
        ]
        found = match_details({"name_raw": "Amit Sen", "phone_raw": "9830000001", "birth_year": 1980}, patients)
        self.assertTrue(found["ambiguous"])
        self.assertIsNone(found["patient_id"])


class RecallRules(unittest.TestCase):
    def test_off_goal_hba1c_is_quarterly(self):
        result = compute_recall(labs(("2025-02-01", 7.8), ("2025-05-16", 8.9)), today=TODAY)
        self.assertEqual(result["next_recall"], "2025-08-16")

    def test_at_goal_hba1c_is_six_monthly(self):
        result = compute_recall(labs(("2026-04-08", 6.9), ("2026-07-03", 6.8)), today=TODAY)
        self.assertEqual(result["next_recall"], "2027-01-03")

    def test_earliest_test_drives_recall(self):
        history = labs(("2026-07-03", 6.8)) + labs(("2025-06-01", 0), test="lipid")
        result = compute_recall(history, today=TODAY)
        self.assertEqual(result["next_recall"], "2026-06-01")
        self.assertIn("Lipid", result["reason"])

    def test_long_gap_is_slipping(self):
        result = compute_recall(labs(("2023-07-01", 7.0), ("2024-10-10", 7.2), ("2026-01-18", 8.1)), today=TODAY)
        self.assertTrue(result["slipping"])

    def test_steady_visits_are_not_slipping(self):
        result = compute_recall(labs(("2025-12-01", 7.0), ("2026-04-08", 6.9), ("2026-07-03", 6.8)), today=TODAY)
        self.assertIsNone(result["slipping"])

    def test_doctor_edits_are_validated(self):
        self.assertEqual(len(validate_rules(DEFAULT_RULES)), len(DEFAULT_RULES))
        with self.assertRaises(ValueError):
            validate_rules([{"test": "hba1c", "months": 0}])


class Replies(unittest.TestCase):
    def test_red_flag_beats_everything(self):
        self.assertEqual(classify("Yes I will come, but chest pain since morning")["intent"], "escalate")
        self.assertEqual(classify("আসবো, কিন্তু বুকে ব্যথা")["intent"], "escalate")

    def test_status_updates(self):
        cases = {
            "We moved to Delhi last year": "moved",
            "Got tested at another lab": "elsewhere",
            "Wrong number": "wrong_number",
            "Please stop": "opt_out",
            "Yes, coming Saturday": "coming",
            "১": "coming",
            "busy, call later": "callback",
            "অন্য ল্যাব থেকে টেস্ট করিয়েছি": "elsewhere",
        }
        for text, intent in cases.items():
            self.assertEqual(classify(text)["intent"], intent, text)

    def test_numbers_need_word_boundaries(self):
        self.assertEqual(classify("10")["intent"], "unclear")

    def test_llm_cannot_downgrade_escalation(self):
        self.assertEqual(classify("insulin dose?", llm_classify=lambda t: "coming")["intent"], "escalate")
        self.assertEqual(classify("hmm", llm_classify=lambda t: "moved")["intent"], "moved")


class Search(unittest.TestCase):
    PATIENTS = [
        {"id": "A", "status": "overdue", "priority_score": 0.9, "phone": "1", "next_recall": "2025-08-16", "lang": "bn", "age": 57},
        {"id": "B", "status": "due", "priority_score": 0.4, "phone": "2", "next_recall": "2026-11-12", "lang": "en", "age": 41},
        {"id": "C", "status": "overdue", "priority_score": 0.95, "phone": "", "next_recall": "2025-06-01", "lang": "en", "age": 71},
        {"id": "D", "status": "slipping", "priority_score": 0.8, "phone": "4", "next_recall": "2026-03-07", "lang": "bn", "age": 52, "outcome": "moved"},
    ]

    def test_pitch_query(self):
        result = run_search(self.PATIENTS, "critical and reachable this week", today=TODAY)
        self.assertEqual(result["ids"], ["A"])
        self.assertIn("reachable by phone", result["applied"])

    def test_language_and_age(self):
        self.assertEqual(run_search(self.PATIENTS, "overdue english over 60", today=TODAY)["ids"], ["C"])
        self.assertEqual(run_search(self.PATIENTS, "due this week", today=TODAY)["ids"], ["B"])


class AktivImport(unittest.TestCase):
    SAMPLE = Path(__file__).resolve().parent.parent / "eval" / "samples" / "aktiv_sample.csv"

    def test_sample_export_parses(self):
        with open(self.SAMPLE, newline="", encoding="utf-8-sig") as fh:
            records, problems = parse_rows(list(csv.DictReader(fh)))
        self.assertEqual(len(records), 4)
        self.assertEqual(len(problems), 1)
        first = records[0]
        self.assertEqual(first["data"]["test_type"], "hba1c")
        self.assertEqual(first["data"]["value"], 8.4)
        self.assertEqual(first["age"], 57)
        self.assertEqual(first["record_date"], "2026-10-03")

    def test_mirrored_record_links_to_patient(self):
        with open(self.SAMPLE, newline="", encoding="utf-8-sig") as fh:
            records, _ = parse_rows(list(csv.DictReader(fh)))
        patients = [
            {"id": "BR-10482", "name": "Madhumita Ghosh", "phone": "+919830001824", "birth_year": 1969, "sex": "f"},
            {"id": "BR-12177", "name": "Rina Das", "phone": "+919830003125", "birth_year": 1974, "sex": "f"},
        ]
        ids = [match_details(r, patients)["patient_id"] for r in records]
        self.assertEqual(ids[:2], ["BR-10482", "BR-10482"])
        self.assertIsNone(ids[3])  # Sujit Das shares Rina's phone

    def test_formats(self):
        self.assertEqual(parse_date("05-10-2026").isoformat(), "2026-10-05")
        self.assertEqual(parse_test("Glycosylated Hemoglobin"), "hba1c")
        self.assertIsNone(parse_test("CBC"))
        missing = parse_rows([{"Foo": "1"}])
        self.assertEqual(missing[0], [])
        self.assertIn("No column found", missing[1][0])


if __name__ == "__main__":
    unittest.main()

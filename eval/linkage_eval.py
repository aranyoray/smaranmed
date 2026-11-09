"""Score record linkage against ground truth.

    python -m eval.linkage_eval                     # synthetic, fictional data
    python -m eval.linkage_eval --records real.csv  # your own labelled export

A records CSV has columns: record_id, person_id, name, phone, age, sex,
record_date. The first row seen for each person_id becomes that person's
master (the patient row); every later row is linked against all masters.

The synthetic set is generated, not real. It mimics the clinic's problems:
romanisation variants, Bengali script, honorifics, phone formats, typos,
households sharing one phone, and namesakes. Some variants (Banerjee vs
Bandyopadhyay, Bose vs Basu, Sk for Sheikh) are deliberately left for the
linker to miss, so recall is not flattered.
"""

import argparse
import csv
import random
import sys
from datetime import date

from rapidfuzz import fuzz

from backend.record_linking import LINK_THRESHOLD, match_details, normalize_phone

MALE = [
    ("Subir", "সুবীর"), ("Arindam", "অরিন্দম"), ("Bimal", "বিমল"), ("Sujit", "সুজিত"),
    ("Partha", "পার্থ"), ("Debashis", "দেবাশিস"), ("Amit", "অমিত"), ("Rafiq", "রফিক"),
    ("Tapan", "তপন"), ("Sanjoy", "সঞ্জয়"), ("Biswajit", "বিশ্বজিৎ"), ("Goutam", "গৌতম"),
    ("Abdul", "আব্দুল"), ("Prasenjit", "প্রসেনজিৎ"), ("Ranjan", "রঞ্জন"),
]
FEMALE = [
    ("Madhumita", "মধুমিতা"), ("Nasima", "নাসিমা"), ("Rina", "রিনা"), ("Rita", "রীতা"),
    ("Shampa", "শম্পা"), ("Mousumi", "মৌসুমী"), ("Sharmila", "শর্মিলা"), ("Ruma", "রুমা"),
    ("Ayesha", "আয়েশা"), ("Sunita", "সুনীতা"), ("Tanushree", "তনুশ্রী"), ("Jharna", "ঝর্ণা"),
    ("Chandana", "চন্দনা"), ("Papiya", "পাপিয়া"), ("Salma", "সালমা"),
]
SURNAMES = [
    ("Ghosh", "ঘোষ"), ("Das", "দাস"), ("Dutta", "দত্ত"), ("Sen", "সেন"), ("Roy", "রায়"),
    ("Chowdhury", "চৌধুরী"), ("Biswas", "বিশ্বাস"), ("Mondal", "মণ্ডল"), ("Sheikh", "শেখ"),
    ("Banerjee", "ব্যানার্জি"), ("Mukherjee", "মুখার্জি"), ("Saha", "সাহা"), ("Pal", "পাল"),
    ("Bose", "বসু"), ("Khatun", "খাতুন"),
]
VARIANTS = {
    "Ghosh": ["Ghose", "Gosh"], "Dutta": ["Datta", "Dutt"],
    "Chowdhury": ["Choudhury", "Chaudhuri", "Chowdhuri"], "Biswas": ["Bishwas", "Viswas"],
    "Mondal": ["Mandal", "Mondol"], "Khatun": ["Khatoon"], "Sheikh": ["Shaikh", "Sk"],
    "Banerjee": ["Banerji", "Bandyopadhyay"], "Mukherjee": ["Mukherji", "Mukerjee"],
    "Bose": ["Basu"], "Roy": ["Ray"], "Subir": ["Shubir"], "Debashis": ["Debasish", "Debasis"],
    "Sanjoy": ["Sanjay"], "Goutam": ["Gautam", "Gotam"], "Mousumi": ["Moushumi", "Mausumi"],
    "Sharmila": ["Sarmila"], "Tanushree": ["Tanusri", "Tanushri"], "Jharna": ["Jharana"],
    "Ayesha": ["Aisha", "Ayasha"], "Rafiq": ["Rafique", "Rofiq"], "Biswajit": ["Bishwajit"],
    "Madhumita": ["Modhumita"], "Partha": ["Parth"], "Nasima": ["Nasimma"],
}
HONORIFIC = {"m": ["Sri", "Mr", "Shri"], "f": ["Smt", "Mrs", "Srimati"]}
TODAY = date(2026, 10, 1)


def _typo(rng, word):
    if len(word) < 4:
        return word
    i = rng.randrange(1, len(word) - 1)
    if rng.random() < 0.5:
        return word[:i] + word[i + 1:]
    return word[:i] + word[i + 1] + word[i] + word[i + 2:]


def _phone_format(rng, digits):
    return rng.choice([digits, "+91" + digits, "0" + digits, "+91 " + digits[:5] + " " + digits[5:], digits[:5] + "-" + digits[5:]])


def _spell(rng, latin, bengali, script_ok):
    if script_ok and rng.random() < 0.15:
        return bengali
    if latin in VARIANTS and rng.random() < 0.45:
        return rng.choice(VARIANTS[latin])
    if rng.random() < 0.06:
        return _typo(rng, latin)
    return latin


def synthetic_records(seed=7, people=400):
    rng = random.Random(seed)
    persons = []
    while len(persons) < people:
        household = rng.choices([1, 2, 3], weights=[65, 25, 10])[0]
        phone = "98" + "".join(str(rng.randrange(10)) for _ in range(8))
        surname = rng.choice(SURNAMES[:-1])
        head_year = rng.randrange(1945, 1990)
        for member in range(household):
            sex = rng.choice("mf") if member == 0 else ("f" if persons[-1]["sex"] == "m" and member == 1 else rng.choice("mf"))
            first = rng.choice(MALE if sex == "m" else FEMALE)
            last = ("Khatun", "খাতুন") if sex == "f" and surname[0] == "Sheikh" and rng.random() < 0.5 else surname
            year = head_year + rng.randrange(-4, 5) if member == 1 else head_year + (rng.randrange(20, 32) if member else 0)
            persons.append({"id": f"P{len(persons):04d}", "first": first, "last": last, "sex": sex, "year": year, "phone": phone})

    rows = []
    for p in persons:
        for n in range(rng.choices([1, 2, 3, 4], weights=[20, 40, 25, 15])[0]):
            master = n == 0
            seen = date(rng.randrange(2021, 2027), rng.randrange(1, 13), rng.randrange(1, 28))
            first = p["first"][0] if master else _spell(rng, *p["first"], script_ok=True)
            last = p["last"][0] if master else _spell(rng, *p["last"], script_ok=first == p["first"][1])
            name = f"{first} {last}"
            if not master and rng.random() < 0.12:
                name = f"{rng.choice(HONORIFIC[p['sex']])}. {name}"
            phone = p["phone"]
            if not master and rng.random() < 0.03:
                i = rng.randrange(2, 10)
                phone = phone[:i] + str((int(phone[i]) + 1) % 10) + phone[i + 1:]
            phone = "" if not master and rng.random() < 0.10 else _phone_format(rng, phone)
            age = seen.year - p["year"] + (rng.choice([-1, 1]) if rng.random() < 0.3 else 0)
            sex = "" if not master and rng.random() < 0.2 else rng.choice({"m": ["M", "Male"], "f": ["F", "Female"]}[p["sex"]])
            rows.append({
                "record_id": f"AKT-{seen:%Y%m}-{rng.randrange(1000, 9999)}",
                "person_id": p["id"], "name": name, "phone": phone, "age": age,
                "sex": sex, "record_date": seen.isoformat(),
            })
    return rows


def load_records(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def split(rows):
    masters, probes = {}, []
    for row in rows:
        if row["person_id"] not in masters:
            masters[row["person_id"]] = row
        else:
            probes.append(row)
    patients = []
    for pid, m in masters.items():
        age = _int(m.get("age"))
        year = int(m["record_date"][:4]) - age if age is not None and m.get("record_date") else None
        patients.append({"id": pid, "name": m["name"], "phone": m["phone"], "birth_year": year, "sex": m.get("sex") or None})
    return patients, probes


def as_record(row):
    return {
        "name_raw": row["name"], "phone_raw": row["phone"], "age": _int(row.get("age")),
        "sex": row.get("sex") or None, "record_date": row.get("record_date"),
    }


def legacy_match(record, patients):
    """The linker before this change: fuzz.ratio + phone + age, threshold 0.75."""
    best_id, best = None, 0.0
    for p in patients:
        score = 0.0
        a, b = normalize_phone(record["phone_raw"] or ""), normalize_phone(p["phone"] or "")
        if a and b and a == b:
            score += 0.50
        x, y = record["name_raw"].lower(), p["name"].lower()
        score += 0.35 * max(fuzz.ratio(x, y), fuzz.token_sort_ratio(x, y)) / 100
        year = int(record["record_date"][:4]) - record["age"] if record["age"] is not None else None
        if year and p["birth_year"] and abs(year - p["birth_year"]) <= 1:
            score += 0.15
        if score > best:
            best, best_id = score, p["id"]
    return best_id if best >= 0.75 else None


def score(rows, matcher):
    patients, probes = split(rows)
    tp = fp = missed = review = 0
    for row in probes:
        predicted, ambiguous = matcher(as_record(row), patients)
        if ambiguous:
            review += 1
        if predicted is None:
            missed += 1
        elif predicted == row["person_id"]:
            tp += 1
        else:
            fp += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / len(probes) if probes else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"records": len(probes), "patients": len(patients), "linked": tp + fp, "correct": tp,
            "wrong": fp, "not_linked": missed, "sent_to_review": review,
            "precision": precision, "recall": recall, "f1": f1}


def _current(record, patients):
    found = match_details(record, patients)
    return found["patient_id"], found["ambiguous"]


def _legacy(record, patients):
    return legacy_match(record, patients), False


def report(name, result):
    print(f"{name:<28} precision {result['precision']:.1%}  recall {result['recall']:.1%}  F1 {result['f1']:.1%}  "
          f"(linked {result['linked']}, wrong {result['wrong']}, not linked {result['not_linked']}, "
          f"review {result['sent_to_review']}) of {result['records']} records")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--records", help="labelled CSV; synthetic data when omitted")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--people", type=int, default=400)
    parser.add_argument("--write", help="write the synthetic records to this CSV and exit")
    args = parser.parse_args(argv)

    rows = load_records(args.records) if args.records else synthetic_records(args.seed, args.people)
    if args.write:
        with open(args.write, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        print(f"Wrote {len(rows)} records to {args.write}")
        return 0

    print(f"Source: {args.records or f'synthetic (seed {args.seed}, {args.people} people, fictional)'}")
    print(f"Threshold {LINK_THRESHOLD}\n")
    report("Smaran linker", score(rows, _current))
    report("Legacy linker (baseline)", score(rows, _legacy))
    return 0


if __name__ == "__main__":
    sys.exit(main())

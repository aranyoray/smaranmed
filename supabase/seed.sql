-- Smaran: demo seed data (all fictional)

insert into patients (id, name, age, phone, phone_last4, lang, status, label, last_visit, next_recall, recall_reason, priority_score) values
  ('BR-10482', 'Madhumita Ghosh',  57, '+919830001824', '1824', 'bn', 'overdue',  'Overdue 148 days',  '2025-05-16', '2025-08-16', '~5 months since last visit', 0.95),
  ('BR-08831', 'Subir Dutta',      64, '+919830004408', '4408', 'en', 'overdue',  'Overdue 121 days',  '2025-06-12', '2025-09-12', 'Overdue · no recent refill', 0.90),
  ('BR-11602', 'Nasima Khatun',    49, '+919830009072', '9072', 'bn', 'slipping', 'Pattern slipping',  '2026-01-18', '2026-04-18', 'Returned after a long gap',  0.75),
  ('BR-09544', 'Arindam Sen',      41, '+919830006619', '6619', 'en', 'due',      'Due in 8 days',     '2026-07-03', '2026-10-11', 'Routine recall',             0.40),
  ('BR-07319', 'Bimal Roy',        71, '+919830002380', '2380', 'en', 'overdue',  'Overdue 96 days',   '2025-06-29', '2025-09-29', 'Multiple missed recalls',    0.92),
  ('BR-12177', 'Rina Das',         52, '+919830003125', '3125', 'bn', 'slipping', 'Pattern slipping',  '2025-12-07', '2026-03-07', '2nd recall missed',          0.78);

-- Lab results (HbA1c)
insert into lab_results (patient_id, test_type, value, unit, result_date, source_system) values
  ('BR-10482', 'hba1c', 7.1, '%', '2024-11-01', 'aktiv'),
  ('BR-10482', 'hba1c', 7.8, '%', '2025-02-01', 'aktiv'),
  ('BR-10482', 'hba1c', 8.9, '%', '2025-05-16', 'ehr'),
  ('BR-08831', 'hba1c', 8.1, '%', '2024-12-01', 'aktiv'),
  ('BR-08831', 'hba1c', 8.7, '%', '2025-03-01', 'aktiv'),
  ('BR-08831', 'hba1c', 9.4, '%', '2025-06-12', 'ehr'),
  ('BR-11602', 'hba1c', 7.0, '%', '2023-07-01', 'aktiv'),
  ('BR-11602', 'hba1c', 7.2, '%', '2024-10-10', 'aktiv'),
  ('BR-11602', 'hba1c', 8.1, '%', '2026-01-18', 'ehr'),
  ('BR-09544', 'hba1c', 7.0, '%', '2025-12-01', 'aktiv'),
  ('BR-09544', 'hba1c', 6.9, '%', '2026-04-08', 'aktiv'),
  ('BR-09544', 'hba1c', 6.8, '%', '2026-07-03', 'ehr'),
  ('BR-07319', 'hba1c', 8.6, '%', '2024-12-01', 'aktiv'),
  ('BR-07319', 'hba1c', 9.1, '%', '2025-03-15', 'aktiv'),
  ('BR-07319', 'hba1c', 10.2, '%', '2025-06-29', 'ehr'),
  ('BR-12177', 'hba1c', 6.9, '%', '2025-04-01', 'aktiv'),
  ('BR-12177', 'hba1c', 7.1, '%', '2025-08-23', 'aktiv'),
  ('BR-12177', 'hba1c', 7.9, '%', '2025-12-07', 'ehr');

-- Timeline events
insert into events (patient_id, event_date, title, detail, event_type) values
  ('BR-10482', '2025-05-16', 'HbA1c · 8.9%',          'Up from 7.8% at the previous check',      'lab'),
  ('BR-10482', '2025-05-16', 'Billing record · OPD visit', 'Returned for medication refill',       'billing'),
  ('BR-10482', '2025-02-12', 'HbA1c · 7.8%',          'Lab result linked from AKTIV',             'lab'),
  ('BR-08831', '2025-06-12', 'HbA1c · 9.4%',          'Above the clinic follow-up threshold',     'lab'),
  ('BR-08831', '2025-06-12', 'Lipid panel · completed', 'LDL 142 mg/dL',                          'lab'),
  ('BR-08831', '2025-03-04', 'HbA1c · 8.7%',          'Lab result linked from AKTIV',             'lab'),
  ('BR-11602', '2026-01-18', 'HbA1c · 8.1%',          'Returned after a 15-month gap',            'lab'),
  ('BR-11602', '2026-01-18', 'Record linked',          'Phone and Bengali name matched',           'link'),
  ('BR-11602', '2024-10-10', 'HbA1c · 7.2%',          'Last completed follow-up',                 'lab'),
  ('BR-09544', '2026-07-03', 'HbA1c · 6.8%',          'Stable at last follow-up',                 'lab'),
  ('BR-09544', '2026-07-03', 'BP · 128/82',            'Routine review',                           'visit'),
  ('BR-09544', '2026-04-08', 'HbA1c · 6.9%',          'Lab result linked from AKTIV',             'lab'),
  ('BR-07319', '2025-06-29', 'HbA1c · 10.2%',         'Highest recorded result',                  'lab'),
  ('BR-07319', '2025-06-29', 'Follow-up missed',       'No billing or lab activity since',         'visit'),
  ('BR-07319', '2025-03-15', 'HbA1c · 9.1%',          'Lab result linked from AKTIV',             'lab'),
  ('BR-12177', '2025-12-07', 'HbA1c · 7.9%',          'Up from 7.1%',                             'lab'),
  ('BR-12177', '2025-12-07', 'Follow-up completed',    'Record linked across two IDs',             'visit'),
  ('BR-12177', '2025-08-23', 'HbA1c · 7.1%',          'Lab result linked from AKTIV',             'lab');

-- Source records (for dedup demo — some unlinked)
insert into source_records (source_id, source_system, name_raw, phone_raw, age, patient_id, confidence, linked_at) values
  ('EHR-10482',  'ehr',     'Madhumita Ghosh',    '9830001824', 57, 'BR-10482', 0.98, now()),
  ('AKT-7821',   'aktiv',   'Modhumita Ghose',    '09830001824', 57, 'BR-10482', 0.98, now()),
  ('EHR-08831',  'ehr',     'Subir Dutta',        '9830004408', 64, 'BR-08831', 0.96, now()),
  ('BIL-08831',  'billing', 'S. Dutta',           '9830004408', 64, 'BR-08831', 0.96, now()),
  ('EHR-11602',  'ehr',     'Nasima Khatun',      '9830009072', 49, 'BR-11602', 0.94, now()),
  ('AKT-9401',   'aktiv',   'Nachima Khatoon',    '09830009072', 49, 'BR-11602', 0.94, now()),
  ('EHR-09544',  'ehr',     'Arindam Sen',        '9830006619', 41, 'BR-09544', 0.99, now()),
  ('EHR-07319',  'ehr',     'Bimal Roy',          '9830002380', 71, 'BR-07319', 0.97, now()),
  ('AKT-5502',   'aktiv',   'Bimal Roy',          '9830002380', 71, 'BR-07319', 0.97, now()),
  ('EHR-12177',  'ehr',     'Rina Das',           '9830003125', 52, 'BR-12177', 0.95, now()),
  ('AKT-8890',   'aktiv',   'Reena Dash',         '09830003125', 52, 'BR-12177', 0.95, now()),
  -- Unlinked records for sync demo
  ('AKT-NEW-01', 'aktiv',   'Madhumita Ghosh',    '9830001824', 57, null, null, null),
  ('BIL-NEW-02', 'billing', 'Subir Datta',        '9830004408', 65, null, null, null),
  ('AKT-NEW-03', 'aktiv',   'Bimal Roy Chowdhury','9830002380', 71, null, null, null);

-- Initial signals (system-generated)
insert into signals (patient_id, text, confidence, sub_text, source) values
  ('BR-10482', 'No clinic activity recorded for about 5 months.',  null, null, 'system'),
  ('BR-10482', 'Two record IDs merged into one patient view.',     0.98, 'Matched on phone number + Bengali name spelling.', 'system'),
  ('BR-10482', '3 HbA1c results on file across the last year.',    null, null, 'system'),
  ('BR-08831', 'No pharmacy refill logged since June 2025.',       null, null, 'system'),
  ('BR-08831', 'Two record IDs merged into one patient view.',     0.96, 'Matched on phone number + name.', 'system'),
  ('BR-08831', 'Past the clinic''s 90-day overdue threshold.',     null, null, 'system'),
  ('BR-11602', 'Returned in January after a 15-month gap.',        null, null, 'system'),
  ('BR-11602', 'Two record IDs merged into one patient view.',     0.94, 'Matched on phone number + Bengali name spelling.', 'system'),
  ('BR-11602', 'Longest interval between visits in this record.',  null, null, 'system'),
  ('BR-09544', 'On schedule — 3 visits in the last 12 months.',    null, null, 'system'),
  ('BR-09544', 'Single record ID — no merge needed.',              0.99, 'High-confidence identity match.', 'system'),
  ('BR-09544', 'Routine recall window opens in about a week.',     null, null, 'system'),
  ('BR-07319', 'Three recall windows have passed with no activity.', null, null, 'system'),
  ('BR-07319', 'Two record IDs merged into one patient view.',     0.97, 'Matched on phone number + name.', 'system'),
  ('BR-07319', 'Oldest overdue entry in today''s queue.',          null, null, 'system'),
  ('BR-12177', 'Second recall missed in a row.',                   null, null, 'system'),
  ('BR-12177', 'Two record IDs merged into one patient view.',     0.95, 'Matched on phone number + Bengali name spelling.', 'system'),
  ('BR-12177', 'Time between visits is getting longer.',           null, null, 'system');

-- Identity fields used by record linkage (sex gate, birth-year check)
update patients set sex = 'f', birth_year = 1969 where id = 'BR-10482';
update patients set sex = 'm', birth_year = 1962 where id = 'BR-08831';
update patients set sex = 'f', birth_year = 1977 where id = 'BR-11602';
update patients set sex = 'm', birth_year = 1985 where id = 'BR-09544';
update patients set sex = 'm', birth_year = 1955 where id = 'BR-07319';
update patients set sex = 'f', birth_year = 1974 where id = 'BR-12177';

-- More unlinked records for the sync demo: Bengali script, and a relative
-- who shares a phone (must stay unlinked).
insert into source_records (source_id, source_system, name_raw, phone_raw, age, sex, record_date) values
  ('AKT-NEW-04', 'aktiv',   'নাসিমা খাতুন',        '+91 98300 09072', 49, 'F', '2026-10-02'),
  ('AKT-NEW-05', 'aktiv',   'Sujit Das',          '9830003125', 56, 'M', '2026-10-05');

-- Other annual tests, so recall rules use more than HbA1c
insert into lab_results (patient_id, test_type, value, unit, result_date, source_system) values
  ('BR-09544', 'lipid', null, null, '2025-09-20', 'aktiv'),
  ('BR-09544', 'uacr',  null, null, '2026-07-03', 'aktiv'),
  ('BR-12177', 'lipid', null, null, '2025-08-23', 'aktiv');

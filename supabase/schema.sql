-- Smaran: diabetes follow-up cockpit schema

create table patients (
  id            text primary key,
  name          text not null,
  age           int,
  phone         text,
  phone_last4   text,
  lang          text default 'bn' check (lang in ('bn', 'en')),
  status        text default 'due' check (status in ('overdue', 'slipping', 'due')),
  label         text,
  last_visit    date,
  next_recall   date,
  recall_reason text,
  priority_score real default 0,
  contacted_at  timestamptz,
  sex           text check (sex in ('m', 'f')),
  birth_year    int,
  outcome       text,
  escalated_at  timestamptz,
  created_at    timestamptz default now()
);

create table source_records (
  id            serial primary key,
  source_id     text not null,
  source_system text not null check (source_system in ('ehr', 'aktiv', 'billing')),
  name_raw      text,
  phone_raw     text,
  age           int,
  patient_id    text references patients(id),
  linked_at     timestamptz,
  confidence    real,
  sex           text,
  birth_year    int,
  record_date   date,
  review        boolean default false,
  data          jsonb
);

create table lab_results (
  id            serial primary key,
  patient_id    text references patients(id) not null,
  test_type     text not null,
  value         real,
  unit          text,
  result_date   date not null,
  source_system text
);
create index idx_labs_patient_date on lab_results(patient_id, result_date desc);

create table events (
  id            serial primary key,
  patient_id    text references patients(id) not null,
  event_date    date not null,
  title         text not null,
  detail        text,
  event_type    text check (event_type in ('lab', 'visit', 'billing', 'link', 'reply', 'outreach'))
);
create index idx_events_patient on events(patient_id, event_date desc);

create table signals (
  id            serial primary key,
  patient_id    text references patients(id) not null,
  text          text not null,
  confidence    real,
  sub_text      text,
  source        text default 'ai' check (source in ('ai', 'system')),
  created_at    timestamptz default now()
);

create table outreach_drafts (
  id            serial primary key,
  patient_id    text references patients(id) not null,
  lang          text not null,
  message       text not null,
  status        text default 'draft' check (status in ('draft', 'approved', 'sent')),
  agent_run_id  text,
  created_at    timestamptz default now()
);

create table patient_replies (
  id            serial primary key,
  patient_id    text references patients(id) not null,
  text          text not null,
  intent        text not null,
  matched       text,
  classified_by text default 'rule',
  created_at    timestamptz default now()
);
create index idx_replies_patient on patient_replies(patient_id, created_at desc);

create table sync_runs (
  id                serial primary key,
  started_at        timestamptz default now(),
  completed_at      timestamptz,
  records_processed int default 0,
  records_linked    int default 0,
  signals_generated int default 0,
  status            text default 'running' check (status in ('running', 'completed', 'failed')),
  error             text
);

create table settings (
  id               int primary key default 1 check (id = 1),
  sync_schedule    text default '06:10',
  default_lang     text default 'auto',
  overdue_days     int default 90,
  outreach_channel text default 'whatsapp',
  recall_rules     jsonb
);
insert into settings default values;

-- RLS: enabled with no policies. The API uses the service-role key, which
-- bypasses RLS; the public anon key can read or write nothing.
alter table patients enable row level security;
alter table source_records enable row level security;
alter table lab_results enable row level security;
alter table events enable row level security;
alter table signals enable row level security;
alter table outreach_drafts enable row level security;
alter table patient_replies enable row level security;
alter table sync_runs enable row level security;
alter table settings enable row level security;

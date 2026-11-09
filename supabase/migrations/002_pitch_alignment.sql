-- Smaran: recall rules, reply handling, linkage fields, locked-down RLS.
-- Safe to run on a database created from the earlier schema.sql.

alter table patients add column if not exists sex          text check (sex in ('m', 'f'));
alter table patients add column if not exists birth_year   int;
alter table patients add column if not exists outcome      text;
alter table patients add column if not exists escalated_at timestamptz;

alter table source_records add column if not exists sex         text;
alter table source_records add column if not exists birth_year  int;
alter table source_records add column if not exists record_date date;
alter table source_records add column if not exists review      boolean default false;

alter table settings add column if not exists recall_rules jsonb;

alter table events drop constraint if exists events_event_type_check;
alter table events add constraint events_event_type_check
  check (event_type in ('lab', 'visit', 'billing', 'link', 'reply', 'outreach'));

create table if not exists patient_replies (
  id          serial primary key,
  patient_id  text references patients(id) not null,
  text        text not null,
  intent      text not null,
  matched     text,
  classified_by text default 'rule',
  created_at  timestamptz default now()
);
create index if not exists idx_replies_patient on patient_replies(patient_id, created_at desc);
alter table patient_replies enable row level security;

-- The API uses the service-role key, which bypasses RLS. With no policies,
-- the public anon key can read or write nothing.
drop policy if exists "service_all" on patients;
drop policy if exists "service_all" on source_records;
drop policy if exists "service_all" on lab_results;
drop policy if exists "service_all" on events;
drop policy if exists "service_all" on signals;
drop policy if exists "service_all" on outreach_drafts;
drop policy if exists "service_all" on sync_runs;
drop policy if exists "service_all" on settings;

-- Health Companion AI: initial schema.
-- Every health table is keyed by profile_id (the person), not the login, so
-- family profiles can be added later. RLS: a profile's rows are visible only
-- to its owner. See SPEC.md §2, §10.

-- ---------------------------------------------------------------- enums
create type record_status   as enum ('draft', 'confirmed', 'discarded');
create type record_source   as enum ('document_extraction', 'user_entered', 'ai_proposed');
create type document_type   as enum ('lab_report', 'prescription', 'doctor_report', 'discharge_summary', 'imaging_report', 'other');
create type document_status as enum ('uploaded', 'processing', 'needs_review', 'confirmed', 'discarded', 'failed', 'duplicate_blocked');
create type dose_status     as enum ('pending', 'taken', 'skipped', 'snoozed', 'not_recorded');
create type reminder_kind   as enum ('medication', 'lab_test', 'appointment', 'prescription_renewal', 'follow_up', 'custom');
create type reminder_status as enum ('proposed', 'active', 'completed', 'cancelled');
create type insight_level   as enum ('informational', 'follow_up', 'urgent');
create type insight_status  as enum ('active', 'acknowledged', 'dismissed', 'superseded');
create type delivery_channel as enum ('push', 'email', 'whatsapp', 'in_app');
create type delivery_status as enum ('queued', 'sent', 'failed', 'delivered_confirmed');

-- ---------------------------------------------------------------- helpers
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table health_profiles (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users(id) on delete cascade,
  relationship           text not null default 'self' check (relationship in ('self')),
  is_demo                boolean not null default false,
  display_name           text check (char_length(display_name) <= 120),
  date_of_birth          date check (date_of_birth >= date '1900-01-01'), -- 18+ enforced in onboarding
  sex                    text check (sex in ('female', 'male', 'intersex', 'prefer_not_to_say')),
  country                text not null default 'EG' check (country in ('EG', 'US')),
  ui_language            text not null default 'en' check (ui_language in ('en', 'ar')),
  explanation_language   text not null default 'en' check (explanation_language in ('en', 'ar')),
  time_zone              text not null default 'Africa/Cairo',
  health_goals           text[] not null default '{}',
  physician_name         text,
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- MVP: one real profile and at most one demo profile per account.
create unique index health_profiles_one_self on health_profiles(owner_id, is_demo);

create or replace function is_profile_owner(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from health_profiles where id = p_profile_id and owner_id = auth.uid())
$$;
revoke all on function is_profile_owner(uuid) from public;
grant execute on function is_profile_owner(uuid) to authenticated;

-- ---------------------------------------------------------------- consents
create table user_consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  consent_type  text not null check (consent_type in
                  ('terms', 'privacy', 'health_data_processing', 'ai_processing', 'notifications_email', 'notifications_whatsapp')),
  version       text not null,
  granted       boolean not null,
  created_at    timestamptz not null default now()
);
create index on user_consents(user_id, consent_type, created_at desc);

create or replace function has_consent(p_user_id uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from user_consents
                   where user_id = p_user_id and consent_type = p_type
                   order by created_at desc limit 1), false)
$$;

-- ---------------------------------------------------------------- documents
create table medical_documents (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references health_profiles(id) on delete cascade,
  document_type   document_type,
  status          document_status not null default 'uploaded',
  storage_path    text not null,
  mime_type       text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  size_bytes      integer not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  page_count      integer check (page_count between 1 and 20),
  sha256          text not null,
  document_date   date,
  title           text,
  failure_reason  text,
  duplicate_of    uuid references medical_documents(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, sha256)
);
create index on medical_documents(profile_id, created_at desc);

create table document_extractions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references health_profiles(id) on delete cascade,
  document_id      uuid not null references medical_documents(id) on delete cascade,
  provider         text not null,
  model            text not null,
  prompt_version   text not null,
  raw_text         text,
  structured       jsonb not null,
  created_at       timestamptz not null default now()
);
create index on document_extractions(document_id);

-- Columns shared by every extracted/entered clinical fact.
-- (Repeated per table rather than inherited, to keep RLS and FKs simple.)

-- ---------------------------------------------------------------- labs
create table laboratory_reports (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references health_profiles(id) on delete cascade,
  document_id      uuid references medical_documents(id) on delete set null,
  extraction_id    uuid references document_extractions(id) on delete set null,
  status           record_status not null default 'draft',
  source           record_source not null,
  lab_name         text,
  collected_at     date,
  reported_at      date,
  collected_date_is_fallback boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint confirmed_report_has_date check (status <> 'confirmed' or collected_at is not null)
);
create index on laboratory_reports(profile_id, collected_at desc);

create table laboratory_results (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references health_profiles(id) on delete cascade,
  report_id          uuid not null references laboratory_reports(id) on delete cascade,
  document_id        uuid references medical_documents(id) on delete set null,
  extraction_id      uuid references document_extractions(id) on delete set null,
  status             record_status not null default 'draft',
  source             record_source not null,
  test_code          text,               -- catalog id (app/src/domain/labs/catalog.ts); null = unmatched
  loinc              text,
  reported_name      text not null,
  value_numeric      numeric,
  value_comparator   text check (value_comparator in ('<', '<=', '>', '>=')),
  value_text         text,               -- non-numeric results, e.g. "Negative"
  unit               text,
  ref_low            numeric,
  ref_high           numeric,
  ref_text           text,
  lab_flag           text check (lab_flag in ('low', 'high', 'abnormal', 'critical_low', 'critical_high', 'critical')),
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  needs_confirmation text[] not null default '{}', -- fields the reviewer must confirm
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint has_value check (value_numeric is not null or value_text is not null)
);
create index on laboratory_results(profile_id, test_code);
create index on laboratory_results(report_id);

-- ---------------------------------------------------------------- conditions, allergies, symptoms
create table medical_conditions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  document_id   uuid references medical_documents(id) on delete set null,
  status        record_status not null default 'confirmed',
  source        record_source not null,
  name          text not null,
  diagnosed_on  date,
  resolved_on   date,
  is_family_history boolean not null default false,
  family_relation text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on medical_conditions(profile_id);

create table allergies (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  status        record_status not null default 'confirmed',
  source        record_source not null,
  substance     text not null,
  reaction      text,
  severity      text check (severity in ('mild', 'moderate', 'severe', 'unknown')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on allergies(profile_id);

create table symptoms (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  description   text not null,
  severity      smallint check (severity between 1 and 10),
  started_at    timestamptz not null,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on symptoms(profile_id, started_at desc);

-- ---------------------------------------------------------------- medications
create table medications (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references health_profiles(id) on delete cascade,
  document_id       uuid references medical_documents(id) on delete set null,
  extraction_id     uuid references document_extractions(id) on delete set null,
  status            record_status not null default 'draft',
  source            record_source not null,
  brand_name        text not null,
  active_ingredient text,
  strength          text,              -- kept as printed, e.g. "20 mg"
  formulation       text,
  route             text,
  prescriber        text,
  instructions      text,
  needs_confirmation text[] not null default '{}',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on medications(profile_id, is_active);

-- One row per regimen version. Changing a dose closes the current row (valid_to)
-- and inserts a new one, so history is never overwritten.
create table medication_schedules (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references health_profiles(id) on delete cascade,
  medication_id   uuid not null references medications(id) on delete cascade,
  status          record_status not null default 'draft',
  dose_amount     numeric check (dose_amount > 0),
  dose_unit       text,
  frequency       text not null check (frequency in ('daily', 'weekly', 'every_n_days', 'as_needed')),
  every_n_days    smallint check (every_n_days between 2 and 90),
  days_of_week    smallint[] check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  times_of_day    time[] not null default '{}',
  time_zone       text not null,
  valid_from      date not null,
  valid_to        date,
  supply_quantity numeric,
  supply_ends_on  date,
  reminders_enabled boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint valid_range check (valid_to is null or valid_to >= valid_from),
  -- Reminders only on a confirmed schedule with explicit dose and times (SPEC §9).
  constraint reminders_need_confirmed check (
    not reminders_enabled or (status = 'confirmed' and dose_amount is not null and (frequency = 'as_needed' or cardinality(times_of_day) > 0))
  ),
  constraint every_n_days_set check (frequency <> 'every_n_days' or every_n_days is not null),
  constraint weekly_days_set check (frequency <> 'weekly' or cardinality(days_of_week) > 0)
);
create index on medication_schedules(medication_id, valid_from desc);
-- At most one open (current) confirmed regimen per medication.
create unique index medication_schedules_one_open on medication_schedules(medication_id)
  where valid_to is null and status = 'confirmed';

create table medication_dose_logs (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references health_profiles(id) on delete cascade,
  schedule_id     uuid not null references medication_schedules(id) on delete cascade,
  scheduled_for   timestamptz not null,
  status          dose_status not null default 'pending',
  recorded_at     timestamptz,
  snoozed_until   timestamptz,
  self_reported   boolean not null default true,  -- adherence is user-reported, not verified
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (schedule_id, scheduled_for)
);
create index on medication_dose_logs(profile_id, scheduled_for);

-- ---------------------------------------------------------------- appointments, follow-ups, reminders
create table appointments (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  title         text not null,
  clinician     text,
  location      text,
  starts_at     timestamptz not null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on appointments(profile_id, starts_at);

create table follow_up_plans (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references health_profiles(id) on delete cascade,
  document_id     uuid references medical_documents(id) on delete set null,
  status          record_status not null default 'draft',
  source          record_source not null,
  is_clinician_instruction boolean not null default false, -- true only when stated in a clinician document
  description     text not null,
  test_codes      text[] not null default '{}',
  due_date        date,
  completed_at    timestamptz,
  completed_by_report_id uuid references laboratory_reports(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ai_is_never_clinician check (not (source = 'ai_proposed' and is_clinician_instruction))
);
create index on follow_up_plans(profile_id, due_date);

create table reminders (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references health_profiles(id) on delete cascade,
  kind            reminder_kind not null,
  status          reminder_status not null default 'proposed',
  title           text not null,
  schedule_id     uuid references medication_schedules(id) on delete cascade,
  follow_up_id    uuid references follow_up_plans(id) on delete cascade,
  appointment_id  uuid references appointments(id) on delete cascade,
  due_at          timestamptz not null,
  time_zone       text not null,
  repeat_rule     text check (repeat_rule in ('none', 'daily', 'weekly', 'monthly', 'yearly')) default 'none',
  snoozed_until   timestamptz,
  next_fire_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on reminders(next_fire_at) where status = 'active';
create index on reminders(profile_id, due_at);

create table reminder_deliveries (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  reminder_id   uuid references reminders(id) on delete cascade,
  dose_log_id   uuid references medication_dose_logs(id) on delete cascade,
  channel       delivery_channel not null,
  status        delivery_status not null default 'queued',
  error         text,
  created_at    timestamptz not null default now()
);
create index on reminder_deliveries(profile_id, created_at desc);

create table notification_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create table notification_preferences (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  push_enabled     boolean not null default false,
  email_enabled    boolean not null default true,
  whatsapp_enabled boolean not null default false,
  whatsapp_number  text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  quiet_start      time,
  quiet_end        time,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- timeline, AI
create table health_events (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  event_type    text not null check (event_type in
                  ('lab_report', 'medication_started', 'medication_changed', 'medication_stopped', 'symptom',
                   'appointment', 'diagnosis', 'follow_up', 'reminder_completed', 'insight', 'document')),
  occurred_on   date not null,
  title         text not null,
  ref_table     text not null,
  ref_id        uuid not null,
  created_at    timestamptz not null default now()
);
create index on health_events(profile_id, occurred_on desc);

create table ai_conversations (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  title         text,
  summary       text,
  summary_fact_ids uuid[] not null default '{}',
  summary_stale boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on ai_conversations(profile_id, updated_at desc);

create table ai_messages (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references health_profiles(id) on delete cascade,
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system_notice')),
  content         text not null,
  citations       jsonb not null default '[]',   -- [{table, id}] of the user's own records
  references_ext  jsonb not null default '[]',   -- external medical sources
  safety_flags    text[] not null default '{}',
  model           text,
  created_at      timestamptz not null default now()
);
create index on ai_messages(conversation_id, created_at);

create table ai_feedback (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  message_id    uuid not null references ai_messages(id) on delete cascade,
  kind          text not null check (kind in ('inaccurate', 'unsafe', 'helpful', 'not_helpful')),
  comment       text,
  created_at    timestamptz not null default now()
);

create table ai_insights (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  level         insight_level not null,
  status        insight_status not null default 'active',
  rule_id       text not null,
  rule_version  text not null,
  dedupe_key    text not null,
  title         text not null,
  explanation   text not null,
  next_action   text,
  evidence      jsonb not null,               -- {result_ids, document_ids, dates}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (profile_id, dedupe_key)
);
create index on ai_insights(profile_id, status, level);

create table usage_counters (
  profile_id    uuid not null references health_profiles(id) on delete cascade,
  period        date not null,                -- first day of month
  extractions   integer not null default 0,
  advisor_messages integer not null default 0,
  primary key (profile_id, period)
);

-- ---------------------------------------------------------------- audit
create table audit_events (
  id            bigserial primary key,
  profile_id    uuid references health_profiles(id) on delete cascade,
  actor_id      uuid,
  table_name    text not null,
  record_id     uuid not null,
  action        text not null check (action in ('insert', 'update', 'delete')),
  old_values    jsonb,
  new_values    jsonb,
  created_at    timestamptz not null default now()
);
create index on audit_events(profile_id, created_at desc);

create or replace function audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_events(profile_id, actor_id, table_name, record_id, action, old_values, new_values)
  values (
    (rec->>'profile_id')::uuid,
    auth.uid(),
    tg_table_name,
    (rec->>'id')::uuid,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------- triggers + RLS
do $$
declare
  t text;
  profile_tables text[] := array[
    'medical_documents', 'document_extractions', 'laboratory_reports', 'laboratory_results',
    'medical_conditions', 'allergies', 'symptoms', 'medications', 'medication_schedules',
    'medication_dose_logs', 'appointments', 'follow_up_plans', 'reminders', 'reminder_deliveries',
    'health_events', 'ai_conversations', 'ai_messages', 'ai_feedback', 'ai_insights', 'usage_counters'];
  audited text[] := array[
    'laboratory_reports', 'laboratory_results', 'medical_conditions', 'allergies', 'medications',
    'medication_schedules', 'follow_up_plans', 'medical_documents'];
  updatable text[] := array[
    'health_profiles', 'medical_documents', 'laboratory_reports', 'laboratory_results', 'medical_conditions',
    'allergies', 'symptoms', 'medications', 'medication_schedules', 'medication_dose_logs', 'appointments',
    'follow_up_plans', 'reminders', 'ai_conversations', 'ai_insights'];
begin
  foreach t in array profile_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated
                    using (is_profile_owner(profile_id)) with check (is_profile_owner(profile_id))', t);
  end loop;
  foreach t in array audited loop
    execute format('create trigger audit after insert or update or delete on %I
                    for each row execute function audit_change()', t);
  end loop;
  foreach t in array updatable loop
    execute format('create trigger touch before update on %I
                    for each row execute function set_updated_at()', t);
  end loop;
end $$;

alter table health_profiles enable row level security;
create policy owner_all on health_profiles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table user_consents enable row level security;
-- Consents are append-only for the user: read and insert, never edit history.
create policy own_read on user_consents for select to authenticated using (user_id = auth.uid());
create policy own_insert on user_consents for insert to authenticated with check (user_id = auth.uid());

alter table notification_subscriptions enable row level security;
create policy owner_all on notification_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table notification_preferences enable row level security;
create policy owner_all on notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Audit log: owner can read, nobody can write directly (only the trigger).
alter table audit_events enable row level security;
create policy owner_read on audit_events for select to authenticated using (is_profile_owner(profile_id));

-- Usage counters are written by edge functions (service role) only.
drop policy owner_all on usage_counters;
create policy owner_read on usage_counters for select to authenticated using (is_profile_owner(profile_id));

-- Extractions are written by the extraction function only.
drop policy owner_all on document_extractions;
create policy owner_read on document_extractions for select to authenticated using (is_profile_owner(profile_id));

-- ---------------------------------------------------------------- storage
-- Private bucket. Object path: {profile_id}/{document_id}/original.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-documents', 'medical-documents', false, 20 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy medical_docs_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and is_profile_owner(((storage.foldername(name))[1])::uuid));
create policy medical_docs_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and is_profile_owner(((storage.foldername(name))[1])::uuid));
create policy medical_docs_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and is_profile_owner(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------- grants
-- Explicit, so we don't depend on project default privileges. Signed-in users
-- get table access (still filtered by RLS above); anonymous visitors get none.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on function is_profile_owner(uuid), has_consent(uuid, text) to authenticated;

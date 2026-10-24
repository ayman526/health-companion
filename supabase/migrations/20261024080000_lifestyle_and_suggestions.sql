-- Life changes the user records (exercise, diet, smoking…), and their decisions
-- on suggested checkups. Both feed the timeline, test history and the advisor.

-- ---------------------------------------------------------------- life changes
create table lifestyle_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references health_profiles(id) on delete cascade,
  category    text not null check (category in ('exercise', 'diet', 'weight', 'smoking', 'alcohol', 'sleep', 'stress', 'other')),
  title       text not null check (char_length(title) between 1 and 200),
  details     text check (char_length(details) <= 1000),
  started_on  date not null,
  ended_on    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lifestyle_dates check (ended_on is null or ended_on >= started_on)
);
create index on lifestyle_events(profile_id, started_on desc);
alter table lifestyle_events enable row level security;
create policy owner_all on lifestyle_events for all to authenticated
  using (is_profile_owner(profile_id)) with check (is_profile_owner(profile_id));
revoke all on lifestyle_events from anon;
grant select, insert, update, delete on lifestyle_events to authenticated, service_role;
create trigger touch before update on lifestyle_events for each row execute function set_updated_at();

alter table health_events drop constraint health_events_event_type_check;
alter table health_events add constraint health_events_event_type_check check (event_type in
  ('lab_report', 'medication_started', 'medication_changed', 'medication_stopped', 'symptom', 'appointment',
   'diagnosis', 'follow_up', 'reminder_completed', 'insight', 'document', 'lifestyle'));

-- Keeps the timeline in step with the life-changes log.
create or replace function sync_lifestyle_event() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from health_events where ref_table = 'lifestyle_events' and ref_id = old.id;
    return old;
  elsif tg_op = 'INSERT' then
    insert into health_events (profile_id, event_type, occurred_on, title, ref_table, ref_id)
    values (new.profile_id, 'lifestyle', new.started_on, new.title, 'lifestyle_events', new.id);
  else
    update health_events set occurred_on = new.started_on, title = new.title
    where ref_table = 'lifestyle_events' and ref_id = new.id;
  end if;
  return new;
end $$;
create trigger sync_timeline after insert or update or delete on lifestyle_events
  for each row execute function sync_lifestyle_event();

-- ---------------------------------------------------------------- suggested checkups
-- Which tests a reminder is for, so the same checkup isn't suggested twice.
alter table reminders add column test_codes text[] not null default '{}';

-- Accepted or dismissed suggestions (a suggestion's key includes the date it is
-- based on, so a new result produces a fresh suggestion later).
create table suggestion_decisions (
  profile_id     uuid not null references health_profiles(id) on delete cascade,
  suggestion_key text not null check (char_length(suggestion_key) between 1 and 200),
  decision       text not null check (decision in ('accepted', 'dismissed')),
  created_at     timestamptz not null default now(),
  primary key (profile_id, suggestion_key)
);
alter table suggestion_decisions enable row level security;
create policy owner_all on suggestion_decisions for all to authenticated
  using (is_profile_owner(profile_id)) with check (is_profile_owner(profile_id));
revoke all on suggestion_decisions from anon;
grant select, insert, update, delete on suggestion_decisions to authenticated, service_role;

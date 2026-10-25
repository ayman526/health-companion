-- 1. Reading cards: short summaries of pages from trusted health organisations,
--    shown in context (next to a result, a reading or an advisor answer).
--    Written by the library-build function; everyone signed in can read them.
-- 2. Reactions to cards (helpful / not relevant), per person.
-- 3. Anonymous daily usage counts (which features get used) - no user, no
--    health data, just "event X happened N times on day D".
-- 4. Doctor visits: a reminder the day before and a follow-up after.
-- 5. Checkups the person says they've already had (with the date).

-- ---------------------------------------------------------------- reading cards
create table library_items (
  id               uuid primary key default gen_random_uuid(),
  source_name      text not null,
  source_url       text not null unique,
  title_en         text not null,
  title_ar         text not null,
  summary_en       text not null,
  summary_ar       text not null,
  points_en        text[] not null default '{}',
  points_ar        text[] not null default '{}',
  primary_tags     text[] not null default '{}',
  related_tags     text[] not null default '{}',
  reading_minutes  smallint,
  content_hash     text,
  model            text,
  retrieved_at     timestamptz not null default now(),
  status           text not null default 'published' check (status in ('published', 'hidden')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on library_items using gin (primary_tags);
alter table library_items enable row level security;
create policy read_published on library_items for select to authenticated using (status = 'published');
revoke all on library_items from anon;
grant select on library_items to authenticated;
grant select, insert, update, delete on library_items to service_role;
create trigger touch before update on library_items for each row execute function set_updated_at();

create table library_feedback (
  profile_id  uuid not null references health_profiles(id) on delete cascade,
  item_id     uuid not null references library_items(id) on delete cascade,
  reaction    text not null check (reaction in ('helpful', 'not_relevant')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, item_id)
);
alter table library_feedback enable row level security;
create policy owner_all on library_feedback for all to authenticated
  using (is_profile_owner(profile_id) and is_active_profile(profile_id))
  with check (is_profile_owner(profile_id) and is_active_profile(profile_id));
revoke all on library_feedback from anon;
grant select, insert, update, delete on library_feedback to authenticated, service_role;

-- ---------------------------------------------------------------- anonymous usage counts
create table usage_daily (
  event  text not null,
  day    date not null default current_date,
  count  integer not null default 0,
  primary key (event, day)
);
alter table usage_daily enable row level security; -- no policies: users can't read or write it directly
revoke all on usage_daily from anon, authenticated;
grant select on usage_daily to service_role;

create or replace function track_event(p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event not in (
    'card_shown', 'card_source_opened', 'card_helpful', 'card_not_relevant',
    'install_prompt_shown', 'install_prompt_done', 'install_prompt_dismissed',
    'voice_started', 'voice_saved', 'voice_failed',
    'visit_added', 'visit_prep_opened', 'visit_followup_done',
    'summary_printed', 'summary_shared', 'checkup_accepted', 'checkup_done',
    'reading_logged', 'reading_photo_used', 'checkin_saved', 'advisor_asked', 'report_scanned'
  ) then
    return; -- unknown events are ignored, never stored
  end if;
  insert into usage_daily (event, day, count) values (p_event, current_date, 1)
  on conflict (event, day) do update set count = usage_daily.count + 1;
end $$;
revoke all on function track_event(text) from public, anon;
grant execute on function track_event(text) to authenticated;

-- ---------------------------------------------------------------- doctor visits
alter type reminder_kind add value if not exists 'visit_prep';
alter type reminder_kind add value if not exists 'visit_followup';
alter table appointments add column followup_done_at timestamptz;

-- ---------------------------------------------------------------- checkups already done
alter table suggestion_decisions drop constraint suggestion_decisions_decision_check;
alter table suggestion_decisions add constraint suggestion_decisions_decision_check
  check (decision in ('accepted', 'dismissed', 'done'));
alter table suggestion_decisions add column done_on date;

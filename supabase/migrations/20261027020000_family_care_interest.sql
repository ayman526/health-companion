-- Family Care interest test: nobody is charged. People who tap "Join early
-- access" (or ask for a scan pack) are listed so the team can contact them at
-- launch; the offer cards and the page are counted in usage_daily.

create table plan_interest (
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan        text not null check (plan in ('family_annual', 'family_monthly', 'scan_pack')),
  source      text not null check (source in ('page', 'second_person', 'scans', 'missed_dose', 'visit', 'settings')),
  country     text check (country in ('EG', 'US')),
  created_at  timestamptz not null default now(),
  primary key (user_id, plan)
);
alter table plan_interest enable row level security;
create policy own_rows on plan_interest for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on plan_interest from anon;
grant select, insert, update, delete on plan_interest to authenticated;

create or replace function track_event(p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event not in (
    'card_shown', 'card_source_opened', 'card_helpful', 'card_not_relevant',
    'install_prompt_shown', 'install_prompt_done', 'install_prompt_dismissed',
    'voice_started', 'voice_saved', 'voice_failed',
    'visit_added', 'visit_prep_opened', 'visit_followup_done',
    'summary_printed', 'summary_shared', 'checkup_accepted', 'checkup_done',
    'reading_logged', 'reading_photo_used', 'checkin_saved', 'advisor_asked', 'report_scanned',
    'push_prompt_shown', 'push_prompt_enabled', 'push_prompt_dismissed', 'push_test_sent',
    'onboarding_done', 'first_action_report', 'first_action_prescription', 'first_action_medicine',
    'first_action_reading', 'first_action_explore',
    'profile_nudge_shown', 'profile_nudge_opened', 'profile_nudge_dismissed',
    'family_care_viewed', 'family_care_join_annual', 'family_care_join_monthly', 'scan_pack_interest',
    'offer_shown_second_person', 'offer_shown_scans', 'offer_shown_missed_dose', 'offer_shown_visit',
    'offer_opened_second_person', 'offer_opened_scans', 'offer_opened_missed_dose', 'offer_opened_visit',
    'offer_dismissed'
  ) then
    return; -- unknown events are ignored, never stored
  end if;
  insert into usage_daily (event, day, count) values (p_event, current_date, 1)
  on conflict (event, day) do update set count = usage_daily.count + 1;
end $$;
revoke all on function track_event(text) from public, anon;
grant execute on function track_event(text) to authenticated;

-- Dashboard: people on the early-access list, by plan and country (counts only).
create or replace function plan_interest_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_team_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('plan', plan, 'country', coalesce(country, '?'), 'people', n) order by n desc)
    from (select plan, country, count(*)::int as n from plan_interest group by plan, country) x
  ), '[]'::jsonb);
end $$;
revoke all on function plan_interest_counts() from public, anon;
grant execute on function plan_interest_counts() to authenticated;

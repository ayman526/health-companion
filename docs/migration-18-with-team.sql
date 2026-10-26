-- Team usage dashboard. Only accounts listed in team_members can read it.
-- Everything returned is a count or a percentage: no user ids, emails or
-- health data ever leave the database through it.
--
-- Add yourself once (SQL Editor), with the email you sign in with:
--   insert into team_members (user_id) select id from auth.users where email = 'you@example.com';

create table team_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now()
);
alter table team_members enable row level security; -- no policies: managed in the SQL Editor only
revoke all on team_members from anon, authenticated;

create or replace function is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = auth.uid())
$$;
revoke all on function is_team_member() from public, anon;
grant execute on function is_team_member() to authenticated;

create or replace function usage_dashboard(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  v_result jsonb;
begin
  if not is_team_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  with people as (
    -- Each account's own (non-demo) profile, created when they agree to the terms.
    select p.id, p.owner_id, p.created_at, p.onboarding_completed_at
    from health_profiles p
    where p.relationship = 'self' and not p.is_demo and p.created_at >= v_from
  ),
  first_record as (
    select pe.id,
      least(
        (select min(d.created_at) from medical_documents d join health_profiles hp on hp.id = d.profile_id where hp.owner_id = pe.owner_id),
        (select min(m.created_at) from medications m join health_profiles hp on hp.id = m.profile_id where hp.owner_id = pe.owner_id),
        (select min(v.created_at) from vital_readings v join health_profiles hp on hp.id = v.profile_id where hp.owner_id = pe.owner_id)
      ) as at
    from people pe
  ),
  came_back as (
    -- Did anything again on day 2-7 after starting (a reading, check-in, dose logged or document).
    select pe.id,
      exists (select 1 from vital_readings v join health_profiles hp on hp.id = v.profile_id where hp.owner_id = pe.owner_id and v.created_at between pe.created_at + interval '1 day' and pe.created_at + interval '7 days')
      or exists (select 1 from daily_checkins c join health_profiles hp on hp.id = c.profile_id where hp.owner_id = pe.owner_id and c.created_at between pe.created_at + interval '1 day' and pe.created_at + interval '7 days')
      or exists (select 1 from medication_dose_logs l join health_profiles hp on hp.id = l.profile_id where hp.owner_id = pe.owner_id and l.recorded_at between pe.created_at + interval '1 day' and pe.created_at + interval '7 days')
      or exists (select 1 from medical_documents d join health_profiles hp on hp.id = d.profile_id where hp.owner_id = pe.owner_id and d.created_at between pe.created_at + interval '1 day' and pe.created_at + interval '7 days')
      as yes
    from people pe
    where pe.created_at <= now() - interval '7 days'
  )
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 365)),
    'signed_in', (select count(*) from auth.users u where u.created_at >= v_from),
    'started', (select count(*) from people),
    'onboarded', (select count(*) from people where onboarding_completed_at is not null),
    'first_record_1d', (select count(*) from people pe join first_record f on f.id = pe.id where f.at <= pe.created_at + interval '1 day'),
    'first_record_any', (select count(*) from first_record where at is not null),
    'came_back_eligible', (select count(*) from came_back),
    'came_back', (select count(*) from came_back where yes),
    'all_accounts', (select count(*) from health_profiles where relationship = 'self' and not is_demo),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('event', e.event, 'total', e.total) order by e.total desc)
      from (select event, sum(count)::int as total from usage_daily where day >= v_from::date group by event) e
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'total', d.total) order by d.day)
      from (select day, sum(count)::int as total from usage_daily where day >= v_from::date group by day) d
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object('title', c.title, 'helpful', c.helpful, 'not_relevant', c.not_relevant) order by c.helpful + c.not_relevant desc)
      from (
        select i.title_en as title,
          count(*) filter (where f.reaction = 'helpful')::int as helpful,
          count(*) filter (where f.reaction = 'not_relevant')::int as not_relevant
        from library_feedback f join library_items i on i.id = f.item_id
        where f.created_at >= v_from
        group by i.title_en
        order by count(*) desc
        limit 10
      ) c
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function usage_dashboard(integer) from public, anon;
grant execute on function usage_dashboard(integer) to authenticated;

-- Add yourself to the team: put your sign-in email between the quotes.
insert into team_members (user_id) select id from auth.users where email = 'YOUR-EMAIL-HERE';

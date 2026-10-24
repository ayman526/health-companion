-- Phase 5: medications, dose tracking and reminders (SPEC.md §9).
-- Schedules are local wall-clock times + an IANA time zone, so DST and travel
-- don't shift doses. Unlogged doses become "not_recorded", never "missed".

alter table medication_dose_logs add column notified_at timestamptz;
alter table reminders add column last_notified_at timestamptz;
create index on medication_dose_logs(status, scheduled_for);

-- ---------------------------------------------------------------- helpers
create or replace function schedule_row_from_json(p jsonb) returns medication_schedules
language plpgsql immutable as $$
declare
  r medication_schedules;
begin
  r.dose_amount := (p->>'dose_amount')::numeric;
  r.dose_unit := nullif(p->>'dose_unit', '');
  r.frequency := p->>'frequency';
  r.every_n_days := (p->>'every_n_days')::smallint;
  r.days_of_week := case when p ? 'days_of_week' and jsonb_typeof(p->'days_of_week') = 'array'
                         then array(select jsonb_array_elements_text(p->'days_of_week')::smallint) end;
  r.times_of_day := case when p ? 'times_of_day' and jsonb_typeof(p->'times_of_day') = 'array'
                         then array(select jsonb_array_elements_text(p->'times_of_day')::time order by 1) else '{}' end;
  r.time_zone := p->>'time_zone';
  r.supply_quantity := (p->>'supply_quantity')::numeric;
  r.supply_ends_on := nullif(p->>'supply_ends_on', '')::date;
  r.reminders_enabled := coalesce((p->>'reminders_enabled')::boolean, false);
  r.valid_to := nullif(p->>'valid_to', '')::date; -- end of a fixed course, if prescribed
  return r;
end $$;

-- ---------------------------------------------------------------- medications
-- Creates a confirmed medication and its first regimen in one transaction.
-- Called only after the user has reviewed name, strength and schedule.
create or replace function save_medication(p_profile_id uuid, p_med jsonb, p_schedule jsonb, p_valid_from date, p_document_id uuid default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_med_id uuid;
  s medication_schedules := schedule_row_from_json(p_schedule);
begin
  if coalesce(trim(p_med->>'brand_name'), '') = '' then
    raise exception 'medication name is required' using errcode = '22023';
  end if;
  if s.time_zone is null or s.frequency is null then
    raise exception 'schedule is incomplete' using errcode = '22023';
  end if;

  insert into medications (profile_id, document_id, status, source, brand_name, active_ingredient, strength,
                           formulation, route, prescriber, instructions, is_active)
  values (p_profile_id, p_document_id, 'confirmed',
          case when p_document_id is null then 'user_entered' else 'document_extraction' end::record_source,
          trim(p_med->>'brand_name'), nullif(p_med->>'active_ingredient', ''), nullif(p_med->>'strength', ''),
          nullif(p_med->>'formulation', ''), nullif(p_med->>'route', ''), nullif(p_med->>'prescriber', ''),
          nullif(p_med->>'instructions', ''), true)
  returning id into v_med_id;

  insert into medication_schedules (profile_id, medication_id, status, dose_amount, dose_unit, frequency, every_n_days,
                                    days_of_week, times_of_day, time_zone, valid_from, valid_to, supply_quantity, supply_ends_on, reminders_enabled)
  values (p_profile_id, v_med_id, 'confirmed', s.dose_amount, s.dose_unit, s.frequency, s.every_n_days,
          s.days_of_week, s.times_of_day, s.time_zone, p_valid_from, s.valid_to, s.supply_quantity, s.supply_ends_on, s.reminders_enabled);

  insert into health_events (profile_id, event_type, occurred_on, title, ref_table, ref_id)
  values (p_profile_id, 'medication_started', p_valid_from, trim(p_med->>'brand_name'), 'medications', v_med_id);

  perform generate_my_doses();
  return v_med_id;
end $$;

-- Changes the dose or timing from a date. History is kept: the current regimen
-- is closed the day before and a new one starts. A change effective on the
-- regimen's own start day is a correction and edits it in place (audited).
create or replace function change_regimen(p_medication_id uuid, p_schedule jsonb, p_effective date)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_open medication_schedules;
  v_med medications;
  s medication_schedules := schedule_row_from_json(p_schedule);
begin
  select * into v_med from medications where id = p_medication_id;
  if not found or not v_med.is_active then
    raise exception 'active medication not found' using errcode = 'P0002';
  end if;
  select * into v_open from medication_schedules
  where medication_id = p_medication_id and status = 'confirmed' and valid_to is null for update;
  if not found then
    raise exception 'no current regimen' using errcode = 'P0002';
  end if;

  -- Future doses of the old regimen that nobody logged are removed.
  delete from medication_dose_logs
  where schedule_id = v_open.id and status = 'pending'
    and scheduled_for >= (p_effective::timestamp at time zone v_open.time_zone);

  if p_effective <= v_open.valid_from then
    update medication_schedules set dose_amount = s.dose_amount, dose_unit = s.dose_unit, frequency = s.frequency,
      every_n_days = s.every_n_days, days_of_week = s.days_of_week, times_of_day = s.times_of_day, time_zone = s.time_zone,
      supply_quantity = s.supply_quantity, supply_ends_on = s.supply_ends_on, reminders_enabled = s.reminders_enabled
    where id = v_open.id;
  else
    update medication_schedules set valid_to = p_effective - 1 where id = v_open.id;
    insert into medication_schedules (profile_id, medication_id, status, dose_amount, dose_unit, frequency, every_n_days,
                                      days_of_week, times_of_day, time_zone, valid_from, supply_quantity, supply_ends_on, reminders_enabled)
    values (v_med.profile_id, p_medication_id, 'confirmed', s.dose_amount, s.dose_unit, s.frequency, s.every_n_days,
            s.days_of_week, s.times_of_day, s.time_zone, p_effective, s.supply_quantity, s.supply_ends_on, s.reminders_enabled);
    insert into health_events (profile_id, event_type, occurred_on, title, ref_table, ref_id)
    values (v_med.profile_id, 'medication_changed', p_effective, v_med.brand_name, 'medications', p_medication_id);
  end if;

  perform generate_my_doses();
end $$;

-- Records that the user stopped a medication (as told by their doctor). Kept in history.
create or replace function stop_medication(p_medication_id uuid, p_end date) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_med medications;
  v_open medication_schedules;
begin
  select * into v_med from medications where id = p_medication_id for update;
  if not found or not v_med.is_active then
    raise exception 'active medication not found' using errcode = 'P0002';
  end if;
  select * into v_open from medication_schedules
  where medication_id = p_medication_id and status = 'confirmed' and valid_to is null for update;
  if found then
    update medication_schedules set valid_to = greatest(p_end, valid_from), reminders_enabled = false where id = v_open.id;
    delete from medication_dose_logs
    where schedule_id = v_open.id and status = 'pending'
      and scheduled_for >= ((greatest(p_end, v_open.valid_from) + 1)::timestamp at time zone v_open.time_zone);
  end if;
  update medications set is_active = false where id = p_medication_id;
  insert into health_events (profile_id, event_type, occurred_on, title, ref_table, ref_id)
  values (v_med.profile_id, 'medication_stopped', p_end, v_med.brand_name, 'medications', p_medication_id);
end $$;

-- ---------------------------------------------------------------- doses
-- Creates the expected doses for the next p_hours (idempotent). Local times are
-- turned into instants in each schedule's own time zone.
create or replace function generate_dose_instances_for(p_profile_id uuid, p_hours integer default 48)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with active as (
    select s.*
    from medication_schedules s
    join medications m on m.id = s.medication_id and m.is_active and m.status = 'confirmed'
    where s.status = 'confirmed' and s.frequency <> 'as_needed' and cardinality(s.times_of_day) > 0
      and (p_profile_id is null or s.profile_id = p_profile_id)
  ),
  candidates as (
    select a.id as schedule_id, a.profile_id,
           ((d::date + t) at time zone a.time_zone) as scheduled_for
    from active a
    cross join lateral generate_series(
      ((now() at time zone a.time_zone)::date - 1)::timestamp,
      ((now() + make_interval(hours => p_hours)) at time zone a.time_zone)::date::timestamp,
      interval '1 day') as d
    cross join lateral unnest(a.times_of_day) as t
    where d::date >= a.valid_from
      and (a.valid_to is null or d::date <= a.valid_to)
      and (a.frequency <> 'weekly' or extract(dow from d)::smallint = any (a.days_of_week))
      and (a.frequency <> 'every_n_days' or ((d::date - a.valid_from) % a.every_n_days) = 0)
  )
  insert into medication_dose_logs (profile_id, schedule_id, scheduled_for)
  select profile_id, schedule_id, scheduled_for from candidates
  where scheduled_for >= now() - interval '12 hours' and scheduled_for <= now() + make_interval(hours => p_hours)
  on conflict (schedule_id, scheduled_for) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function generate_dose_instances_for(uuid, integer) from public, anon, authenticated;

-- The signed-in user's own doses (called after saving, so Today is filled at once).
create or replace function generate_my_doses() returns integer
language sql security definer set search_path = public as $$
  select coalesce(sum(generate_dose_instances_for(id, 48)), 0)::integer from health_profiles where owner_id = auth.uid()
$$;
revoke execute on function generate_my_doses() from public, anon;
grant execute on function generate_my_doses() to authenticated;

-- Doses nobody logged within 8 hours become "not recorded" (not "missed").
create or replace function mark_unrecorded_doses() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update medication_dose_logs set status = 'not_recorded'
  where status in ('pending', 'snoozed') and scheduled_for < now() - interval '8 hours';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function mark_unrecorded_doses() from public, anon, authenticated;

-- taken | skipped | snoozed (with minutes) | pending (undo). Self-reported.
create or replace function log_dose(p_dose_id uuid, p_status text, p_snooze_minutes integer default null) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_status not in ('taken', 'skipped', 'snoozed', 'pending') then
    raise exception 'invalid dose status' using errcode = '22023';
  end if;
  update medication_dose_logs set
    status = p_status::dose_status,
    recorded_at = case when p_status = 'pending' then null else now() end,
    snoozed_until = case when p_status = 'snoozed' then now() + make_interval(mins => coalesce(p_snooze_minutes, 30)) end,
    notified_at = case when p_status = 'snoozed' then null else notified_at end,
    self_reported = true
  where id = p_dose_id;
  if not found then
    raise exception 'dose not found' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function log_dose(uuid, text, integer) from public, anon;
grant execute on function log_dose(uuid, text, integer) to authenticated;

-- An "as needed" dose taken now.
create or replace function log_as_needed_dose(p_schedule_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_profile uuid;
begin
  select profile_id into v_profile from medication_schedules where id = p_schedule_id and frequency = 'as_needed' and valid_to is null;
  if not found then
    raise exception 'as-needed schedule not found' using errcode = 'P0002';
  end if;
  insert into medication_dose_logs (profile_id, schedule_id, scheduled_for, status, recorded_at)
  values (v_profile, p_schedule_id, date_trunc('minute', now()), 'taken', now())
  on conflict (schedule_id, scheduled_for) do nothing;
end $$;
revoke execute on function log_as_needed_dose(uuid) from public, anon;
grant execute on function log_as_needed_dose(uuid) to authenticated;

-- ---------------------------------------------------------------- reminders
-- Completes a reminder; repeating ones move to their next date instead.
create or replace function complete_reminder(p_reminder_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  r reminders;
  v_next timestamptz;
begin
  select * into r from reminders where id = p_reminder_id for update;
  if not found then
    raise exception 'reminder not found' using errcode = 'P0002';
  end if;
  v_next := case r.repeat_rule
    when 'daily' then r.due_at + interval '1 day'
    when 'weekly' then r.due_at + interval '1 week'
    when 'monthly' then ((r.due_at at time zone r.time_zone) + interval '1 month') at time zone r.time_zone
    when 'yearly' then ((r.due_at at time zone r.time_zone) + interval '1 year') at time zone r.time_zone
    else null end;
  if v_next is null then
    update reminders set status = 'completed', completed_at = now(), next_fire_at = null, snoozed_until = null where id = r.id;
  else
    update reminders set due_at = v_next, next_fire_at = v_next, snoozed_until = null, last_notified_at = null where id = r.id;
  end if;
  if r.follow_up_id is not null and v_next is null then
    update follow_up_plans set completed_at = now() where id = r.follow_up_id;
  end if;
  insert into health_events (profile_id, event_type, occurred_on, title, ref_table, ref_id)
  values (r.profile_id, 'reminder_completed', (now() at time zone r.time_zone)::date, r.title, 'reminders', r.id);
end $$;
revoke execute on function complete_reminder(uuid) from public, anon;
grant execute on function complete_reminder(uuid) to authenticated;

-- ---------------------------------------------------------------- delivery (server only)
-- Doses and reminders that are due and not yet notified. Used by send-reminders.
create or replace function due_notifications(p_limit integer default 200)
returns table (kind text, item_id uuid, profile_id uuid, owner_id uuid, due_at timestamptz)
language sql stable security definer set search_path = public as $$
  (select 'dose', l.id, l.profile_id, p.owner_id, coalesce(l.snoozed_until, l.scheduled_for)
   from medication_dose_logs l
   join medication_schedules s on s.id = l.schedule_id and s.reminders_enabled
   join health_profiles p on p.id = l.profile_id
   where l.status in ('pending', 'snoozed')
     and coalesce(l.snoozed_until, l.scheduled_for) <= now()
     and coalesce(l.snoozed_until, l.scheduled_for) > now() - interval '2 hours'
     and (l.notified_at is null or l.notified_at < coalesce(l.snoozed_until, l.scheduled_for))
   limit p_limit)
  union all
  (select 'reminder', r.id, r.profile_id, p.owner_id, coalesce(r.snoozed_until, r.next_fire_at)
   from reminders r
   join health_profiles p on p.id = r.profile_id
   where r.status = 'active' and r.kind <> 'medication'
     and coalesce(r.snoozed_until, r.next_fire_at) <= now()
     and (r.last_notified_at is null or r.last_notified_at < coalesce(r.snoozed_until, r.next_fire_at))
   limit p_limit)
$$;
revoke execute on function due_notifications(integer) from public, anon, authenticated;

grant execute on function generate_dose_instances_for(uuid, integer), mark_unrecorded_doses(), due_notifications(integer) to service_role;

-- ---------------------------------------------------------------- scheduled jobs
-- Uses pg_cron when the database has it (Supabase does; the test database doesn't).
-- The send-reminders job is set up separately (supabase/setup/reminders_cron.sql)
-- because it needs the function URL and a secret.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('hc-generate-doses', '*/30 * * * *', 'select public.generate_dose_instances_for(null, 48)');
    perform cron.schedule('hc-unrecorded-doses', '*/30 * * * *', 'select public.mark_unrecorded_doses()');
  end if;
end $$;

-- Phone notifications, part A:
--  * one gentle follow-up when a dose is still not logged 30 minutes after its
--    notification (can be turned off in Settings);
--  * usage counts for the notification prompt, test button and notification buttons.

alter table medication_dose_logs add column if not exists followup_sent_at timestamptz;
alter table notification_preferences add column if not exists dose_followup boolean not null default true;

-- Doses notified 30+ minutes ago, still pending (not taken, skipped or snoozed),
-- no follow-up yet, scheduled within the last 3 hours. Used by send-reminders.
create or replace function due_followups(p_limit integer default 200)
returns table (item_id uuid, profile_id uuid, owner_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id, l.profile_id, p.owner_id
  from medication_dose_logs l
  join medication_schedules s on s.id = l.schedule_id and s.reminders_enabled
  join health_profiles p on p.id = l.profile_id
  left join notification_preferences np on np.user_id = p.owner_id
  where l.status = 'pending'
    and l.notified_at is not null
    and l.notified_at <= now() - interval '30 minutes'
    and l.followup_sent_at is null
    and l.scheduled_for > now() - interval '3 hours'
    and coalesce(np.dose_followup, true)
    and coalesce(np.push_enabled, false)
  limit p_limit
$$;
revoke execute on function due_followups(integer) from public, anon, authenticated;
grant execute on function due_followups(integer) to service_role;

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
    'push_prompt_shown', 'push_prompt_enabled', 'push_prompt_dismissed', 'push_test_sent'
  ) then
    return; -- unknown events are ignored, never stored
  end if;
  insert into usage_daily (event, day, count) values (p_event, current_date, 1)
  on conflict (event, day) do update set count = usage_daily.count + 1;
end $$;
revoke all on function track_event(text) from public, anon;
grant execute on function track_event(text) to authenticated;

-- Counts of notification button taps (taken / snooze) come from the server, not the app.
create or replace function track_server_event(p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('push_action_taken', 'push_action_snoozed', 'push_followup_sent') then
    return;
  end if;
  insert into usage_daily (event, day, count) values (p_event, current_date, 1)
  on conflict (event, day) do update set count = usage_daily.count + 1;
end $$;
revoke all on function track_server_event(text) from public, anon, authenticated;
grant execute on function track_server_event(text) to service_role;

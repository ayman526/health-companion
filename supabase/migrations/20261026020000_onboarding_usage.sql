-- Shorter sign-up: count how many people finish it, which first action they
-- pick, and how the "complete your profile" card is used. Counts only.

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
    'profile_nudge_shown', 'profile_nudge_opened', 'profile_nudge_dismissed'
  ) then
    return; -- unknown events are ignored, never stored
  end if;
  insert into usage_daily (event, day, count) values (p_event, current_date, 1)
  on conflict (event, day) do update set count = usage_daily.count + 1;
end $$;
revoke all on function track_event(text) from public, anon;
grant execute on function track_event(text) to authenticated;

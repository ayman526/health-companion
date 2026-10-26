-- Counts from the signed-out screens (the example walkthrough and the sign-in
-- page), so the team can see whether the example helps people sign up.
-- Counts only, no user and no device id; a short fixed list of events.

create or replace function track_public_event(p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event not in (
    'example_opened', 'example_step_2', 'example_step_3', 'example_step_4',
    'example_start_clicked', 'signin_code_requested'
  ) then
    return;
  end if;
  insert into usage_daily (event, day, count) values (p_event, current_date, 1)
  on conflict (event, day) do update set count = usage_daily.count + 1;
end $$;
revoke all on function track_public_event(text) from public;
grant execute on function track_public_event(text) to anon, authenticated;

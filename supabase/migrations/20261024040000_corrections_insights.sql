-- Phase 3: correcting confirmed records, and storing insights.
-- Corrections never overwrite history silently: the audit trigger keeps the
-- old values, and every later comparison is computed from the corrected row.

-- Corrects one confirmed result. p_patch may contain any of:
--   test_code, reported_name, value_numeric, value_comparator, value_text, unit,
--   ref_low, ref_high, ref_text, lab_flag, note
-- or {"remove": true} to take the result out of the record (kept for audit).
create or replace function correct_lab_result(p_result_id uuid, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_row laboratory_results;
begin
  select * into v_row from laboratory_results where id = p_result_id for update;
  if not found then
    raise exception 'result not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'only confirmed results can be corrected' using errcode = 'P0001';
  end if;

  if coalesce((p_patch->>'remove')::boolean, false) then
    update laboratory_results set status = 'discarded' where id = p_result_id;
    return;
  end if;

  update laboratory_results set
    test_code        = case when p_patch ? 'test_code' then nullif(p_patch->>'test_code', '') else test_code end,
    reported_name    = case when p_patch ? 'reported_name' then coalesce(nullif(p_patch->>'reported_name', ''), reported_name) else reported_name end,
    value_numeric    = case when p_patch ? 'value_numeric' then (p_patch->>'value_numeric')::numeric else value_numeric end,
    value_comparator = case when p_patch ? 'value_comparator' then nullif(p_patch->>'value_comparator', '') else value_comparator end,
    value_text       = case when p_patch ? 'value_text' then nullif(p_patch->>'value_text', '') else value_text end,
    unit             = case when p_patch ? 'unit' then nullif(p_patch->>'unit', '') else unit end,
    ref_low          = case when p_patch ? 'ref_low' then (p_patch->>'ref_low')::numeric else ref_low end,
    ref_high         = case when p_patch ? 'ref_high' then (p_patch->>'ref_high')::numeric else ref_high end,
    ref_text         = case when p_patch ? 'ref_text' then nullif(p_patch->>'ref_text', '') else ref_text end,
    lab_flag         = case when p_patch ? 'lab_flag' then nullif(p_patch->>'lab_flag', '') else lab_flag end,
    note             = case when p_patch ? 'note' then nullif(p_patch->>'note', '') else note end
  where id = p_result_id;
end $$;
revoke execute on function correct_lab_result(uuid, jsonb) from public, anon;
grant execute on function correct_lab_result(uuid, jsonb) to authenticated;

-- Corrects a confirmed report's lab name or dates; keeps the timeline in step.
create or replace function correct_lab_report(p_report_id uuid, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_report laboratory_reports;
begin
  select * into v_report from laboratory_reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_report.status <> 'confirmed' then
    raise exception 'only confirmed reports can be corrected' using errcode = 'P0001';
  end if;

  update laboratory_reports set
    lab_name     = case when p_patch ? 'lab_name' then nullif(p_patch->>'lab_name', '') else lab_name end,
    collected_at = case when p_patch ? 'collected_at' then (p_patch->>'collected_at')::date else collected_at end,
    reported_at  = case when p_patch ? 'reported_at' then nullif(p_patch->>'reported_at', '')::date else reported_at end,
    collected_date_is_fallback = case when p_patch ? 'collected_at' then false else collected_date_is_fallback end
  where id = p_report_id;

  update health_events set
    occurred_on = (select collected_at from laboratory_reports where id = p_report_id),
    title = coalesce((select lab_name from laboratory_reports where id = p_report_id), title)
  where ref_table = 'laboratory_reports' and ref_id = p_report_id;
end $$;
revoke execute on function correct_lab_report(uuid, jsonb) from public, anon;
grant execute on function correct_lab_report(uuid, jsonb) to authenticated;

-- Insights: which test they concern and the values used to render them, so the
-- text can be shown in the user's current language (SPEC §7).
alter table ai_insights add column test_key text;
alter table ai_insights add column template text;
alter table ai_insights add column params jsonb not null default '{}';
create index on ai_insights(profile_id, status, created_at desc);

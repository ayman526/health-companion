-- Phase 2b: learned test names. When a user matches a printed test name to a
-- catalog test by hand, the match is remembered for their future reports.

create table test_aliases (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references health_profiles(id) on delete cascade,
  alias_key   text not null check (char_length(alias_key) between 1 and 200), -- normalized printed name
  test_code   text not null check (char_length(test_code) between 1 and 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (profile_id, alias_key)
);
alter table test_aliases enable row level security;
create policy owner_all on test_aliases for all to authenticated
  using (is_profile_owner(profile_id)) with check (is_profile_owner(profile_id));
grant select, insert, update, delete on test_aliases to authenticated;
grant select, insert, update, delete on test_aliases to service_role;

-- confirm_lab_report, now also saving learned aliases.
--   p_results: [{id?, test_code, loinc, reported_name, value_numeric, value_comparator,
--                value_text, unit, ref_low, ref_high, ref_text, lab_flag, note, learn_alias?}]
create or replace function confirm_lab_report(p_report_id uuid, p_report jsonb, p_results jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_report laboratory_reports;
  v_row jsonb;
  v_keep uuid[] := '{}';
  v_id uuid;
begin
  select * into v_report from laboratory_reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_report.status <> 'draft' then
    raise exception 'report is not a draft' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) = 0 then
    raise exception 'at least one result is required' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_results) loop
    v_id := nullif(v_row->>'id', '')::uuid;
    if v_id is null then
      insert into laboratory_results (profile_id, report_id, document_id, status, source, test_code, loinc,
        reported_name, value_numeric, value_comparator, value_text, unit, ref_low, ref_high, ref_text, lab_flag, note)
      values (v_report.profile_id, p_report_id, v_report.document_id, 'confirmed', 'user_entered',
        nullif(v_row->>'test_code', ''), nullif(v_row->>'loinc', ''), v_row->>'reported_name',
        (v_row->>'value_numeric')::numeric, nullif(v_row->>'value_comparator', ''), nullif(v_row->>'value_text', ''),
        nullif(v_row->>'unit', ''), (v_row->>'ref_low')::numeric, (v_row->>'ref_high')::numeric,
        nullif(v_row->>'ref_text', ''), nullif(v_row->>'lab_flag', ''), nullif(v_row->>'note', ''))
      returning id into v_id;
    else
      update laboratory_results set
        status = 'confirmed',
        test_code = nullif(v_row->>'test_code', ''),
        loinc = nullif(v_row->>'loinc', ''),
        reported_name = v_row->>'reported_name',
        value_numeric = (v_row->>'value_numeric')::numeric,
        value_comparator = nullif(v_row->>'value_comparator', ''),
        value_text = nullif(v_row->>'value_text', ''),
        unit = nullif(v_row->>'unit', ''),
        ref_low = (v_row->>'ref_low')::numeric,
        ref_high = (v_row->>'ref_high')::numeric,
        ref_text = nullif(v_row->>'ref_text', ''),
        lab_flag = nullif(v_row->>'lab_flag', ''),
        note = nullif(v_row->>'note', ''),
        needs_confirmation = '{}'
      where id = v_id and report_id = p_report_id;
      if not found then
        raise exception 'result % does not belong to this report', v_id using errcode = '22023';
      end if;
    end if;
    v_keep := v_keep || v_id;

    -- A manual match the user made is remembered for their next reports.
    if nullif(v_row->>'learn_alias', '') is not null and nullif(v_row->>'test_code', '') is not null then
      insert into test_aliases (profile_id, alias_key, test_code)
      values (v_report.profile_id, v_row->>'learn_alias', v_row->>'test_code')
      on conflict (profile_id, alias_key) do update set test_code = excluded.test_code, updated_at = now();
    end if;
  end loop;

  update laboratory_results set status = 'discarded'
  where report_id = p_report_id and status = 'draft' and not (id = any (v_keep));

  update laboratory_reports set
    status = 'confirmed',
    lab_name = nullif(p_report->>'lab_name', ''),
    collected_at = (p_report->>'collected_at')::date,
    reported_at = nullif(p_report->>'reported_at', '')::date,
    collected_date_is_fallback = coalesce((p_report->>'collected_date_is_fallback')::boolean, false)
  where id = p_report_id;

  if v_report.document_id is not null then
    update medical_documents set status = 'confirmed', document_date = coalesce(document_date, (p_report->>'collected_at')::date)
    where id = v_report.document_id;
  end if;

  insert into health_events (profile_id, event_type, occurred_on, title, ref_table, ref_id)
  values (v_report.profile_id, 'lab_report', (p_report->>'collected_at')::date,
          coalesce(nullif(p_report->>'lab_name', ''), 'Lab report'), 'laboratory_reports', p_report_id);
end $$;

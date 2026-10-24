-- Phase 2: document pipeline functions. SPEC.md §3, §11.

-- has_consent takes any user id, so only server code may call it.
-- (Functions are executable by PUBLIC by default, which includes anon.)
revoke execute on function has_consent(uuid, text) from public, anon, authenticated;
revoke execute on function audit_change() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;

-- Consent of the signed-in user, for the app UI.
create or replace function my_consent(p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_consent(auth.uid(), p_type)
$$;
revoke execute on function my_consent(text) from public, anon;
grant execute on function my_consent(text) to authenticated;

-- Atomically counts one use against a monthly quota. Server-side only.
create or replace function consume_quota(p_profile_id uuid, p_kind text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_used integer;
begin
  if p_kind not in ('extractions', 'advisor_messages') then
    raise exception 'unknown quota kind %', p_kind;
  end if;
  insert into usage_counters (profile_id, period) values (p_profile_id, v_period)
  on conflict (profile_id, period) do nothing;
  execute format('update usage_counters set %1$I = %1$I + 1
                  where profile_id = $1 and period = $2 and %1$I < $3 returning %1$I', p_kind)
    into v_used using p_profile_id, v_period, p_limit;
  return v_used is not null;
end $$;
revoke execute on function consume_quota(uuid, text, integer) from public, anon, authenticated;

-- Confirms a reviewed lab report in one transaction (SPEC §3 step 7).
-- Runs with the caller's rights, so RLS applies to every statement.
--   p_report:  {lab_name, collected_at, reported_at, collected_date_is_fallback}
--   p_results: [{id?, test_code, loinc, reported_name, value_numeric, value_comparator,
--                value_text, unit, ref_low, ref_high, ref_text, lab_flag, note}]
--   Draft rows missing from p_results are discarded (kept for audit, never used).
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
revoke execute on function confirm_lab_report(uuid, jsonb, jsonb) from public, anon;
grant execute on function confirm_lab_report(uuid, jsonb, jsonb) to authenticated;

-- Discards a document and every draft fact extracted from it.
create or replace function discard_document(p_document_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update medical_documents set status = 'discarded' where id = p_document_id and status <> 'confirmed';
  if not found then
    raise exception 'document not found or already confirmed' using errcode = 'P0002';
  end if;
  update laboratory_results set status = 'discarded' where document_id = p_document_id and status = 'draft';
  update laboratory_reports set status = 'discarded' where document_id = p_document_id and status = 'draft';
end $$;
revoke execute on function discard_document(uuid) from public, anon;
grant execute on function discard_document(uuid) to authenticated;

-- A draft manual report (no document) can be discarded the same way.
create or replace function discard_report(p_report_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update laboratory_reports set status = 'discarded' where id = p_report_id and status = 'draft';
  if not found then
    raise exception 'report not found or not a draft' using errcode = 'P0002';
  end if;
  update laboratory_results set status = 'discarded' where report_id = p_report_id and status = 'draft';
end $$;
revoke execute on function discard_report(uuid) from public, anon;
grant execute on function discard_report(uuid) to authenticated;

-- HEIC can't be read by the extraction model; browsers convert camera photos to JPEG.
alter table medical_documents drop constraint medical_documents_mime_type_check;
alter table medical_documents add constraint medical_documents_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'medical-documents';

-- Server code (edge functions) uses service_role; grant explicitly rather than
-- relying on project default privileges.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
grant execute on function has_consent(uuid, text), consume_quota(uuid, text, integer) to service_role;

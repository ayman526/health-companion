-- Per-lab memory of printed test names.
--
-- Labs name the same test differently, and the same short name ("Glucose",
-- "Colour") means different tests under different headings. When two
-- different accounts match the same printed name, from the same lab and the
-- same sample (blood, urine, stool...), to the same test, that lab's name is
-- known for everyone who uploads from that lab. Only the lab name, the printed
-- test name, the sample and the test code are shared; never values or who
-- matched it.

-- One key per lab: lowercase, letters and digits only ("Al-Borg Lab." → "al borg lab").
create or replace function lab_key(p_name text) returns text
language sql immutable set search_path = public as $$
  select nullif(left(trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9؀-ۿ]+', ' ', 'g')), 120), '')
$$;

create table lab_test_names (
  lab_key     text not null check (char_length(lab_key) between 1 and 120),
  sample      text not null default '' check (sample in ('', 'urine', 'stool', 'semen', 'csf', 'fluid')),
  alias_key   text not null check (char_length(alias_key) between 1 and 200),
  test_code   text not null check (test_code ~ '^[a-z0-9_]{1,60}$'),
  created_at  timestamptz not null default now(),
  primary key (lab_key, sample, alias_key)
);
alter table lab_test_names enable row level security;
create policy read_all on lab_test_names for select to authenticated using (true);
revoke all on lab_test_names from anon;
grant select on lab_test_names to authenticated;

-- One vote per account per lab, sample and printed name (server only; never shown to anyone).
create table lab_test_name_votes (
  lab_key    text not null,
  sample     text not null,
  alias_key  text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  test_code  text not null,
  voted_at   timestamptz not null default now(),
  primary key (lab_key, sample, alias_key, owner_id)
);
alter table lab_test_name_votes enable row level security;
revoke all on lab_test_name_votes from anon, authenticated;

create or replace function vote_lab_test_name(p_profile_id uuid, p_lab_name text, p_sample text, p_alias text, p_test_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_lab text := lab_key(p_lab_name);
begin
  -- Only for your own profiles, with a lab name, and a name that looks like a test name (no IDs, emails or numbers).
  if not is_profile_owner(p_profile_id) or v_lab is null or char_length(v_lab) < 2 then return; end if;
  if p_alias is null or p_alias !~ '[a-z؀-ۿ]' or p_alias ~ '\d{5,}' or p_alias ~ '@' or char_length(p_alias) > 200 then return; end if;
  if coalesce(p_sample, '') not in ('', 'urine', 'stool', 'semen', 'csf', 'fluid') or p_test_code !~ '^[a-z0-9_]{1,60}$' then return; end if;
  select owner_id into v_owner from health_profiles where id = p_profile_id;
  if v_owner is null then return; end if;

  insert into lab_test_name_votes (lab_key, sample, alias_key, owner_id, test_code)
  values (v_lab, coalesce(p_sample, ''), p_alias, v_owner, p_test_code)
  on conflict (lab_key, sample, alias_key, owner_id) do update set test_code = excluded.test_code, voted_at = now();

  if (select count(*) from lab_test_name_votes
      where lab_key = v_lab and sample = coalesce(p_sample, '') and alias_key = p_alias and test_code = p_test_code) >= 2 then
    insert into lab_test_names (lab_key, sample, alias_key, test_code)
    values (v_lab, coalesce(p_sample, ''), p_alias, p_test_code)
    on conflict (lab_key, sample, alias_key) do nothing;
  end if;
end $$;
revoke execute on function vote_lab_test_name(uuid, text, text, text, text) from public, anon;
grant execute on function vote_lab_test_name(uuid, text, text, text, text) to authenticated;

-- The names known for one lab (the review screen asks with the lab name as read from the report).
create or replace function lab_test_names_for(p_lab_name text)
returns table (sample text, alias_key text, test_code text)
language sql stable security invoker set search_path = public as $$
  select sample, alias_key, test_code from lab_test_names where lab_key = lab_key(p_lab_name)
$$;
revoke execute on function lab_test_names_for(text) from public, anon;
grant execute on function lab_test_names_for(text) to authenticated;

-- confirm_lab_report: same as before, plus the lab vote for names the user matched by hand.
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

    -- Unrecognized names are counted anonymously so the catalog can grow.
    if nullif(v_row->>'test_code', '') is null and nullif(v_row->>'name_key', '') is not null then
      perform note_unrecognized_test(v_row->>'name_key');
    end if;

    -- A manual match the user made is remembered for their next reports.
    if nullif(v_row->>'learn_alias', '') is not null and nullif(v_row->>'test_code', '') is not null then
      insert into test_aliases (profile_id, alias_key, test_code)
      values (v_report.profile_id, v_row->>'learn_alias', v_row->>'test_code')
      on conflict (profile_id, alias_key) do update set test_code = excluded.test_code, updated_at = now();
      -- And counts toward this lab's own names (shared once two accounts agree).
      perform vote_lab_test_name(v_report.profile_id, p_report->>'lab_name', coalesce(v_row->>'sample', ''), v_row->>'learn_alias', v_row->>'test_code');
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

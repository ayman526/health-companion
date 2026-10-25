-- More home readings: heart rate, blood oxygen (SpO2) and temperature, and
-- readings filled in from a photo of the monitor's screen (confirmed by the
-- person before saving).

alter table vital_readings add column spo2 smallint check (spo2 between 50 and 100);
alter table vital_readings add column temperature_c numeric check (temperature_c between 30 and 45);

alter table vital_readings drop constraint vital_readings_kind_check;
alter table vital_readings add constraint vital_readings_kind_check
  check (kind in ('blood_pressure', 'glucose', 'weight', 'heart_rate', 'oxygen', 'temperature'));

alter table vital_readings drop constraint vital_shape;
alter table vital_readings add constraint vital_shape check (
  (kind = 'blood_pressure' and systolic is not null and diastolic is not null and systolic > diastolic)
  or (kind = 'glucose' and glucose_mg_dl is not null)
  or (kind = 'weight' and weight_kg is not null)
  or (kind = 'heart_rate' and pulse is not null)
  or (kind = 'oxygen' and spo2 is not null)
  or (kind = 'temperature' and temperature_c is not null));

alter table vital_readings drop constraint vital_readings_source_check;
alter table vital_readings add constraint vital_readings_source_check
  check (source in ('user_entered', 'device', 'photo'));

-- Monthly limit for reading monitor photos, per account like the others.
alter table usage_counters add column monitor_reads integer not null default 0;

create or replace function consume_quota(p_profile_id uuid, p_kind text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_used integer;
begin
  if p_kind not in ('extractions', 'advisor_messages', 'monitor_reads') then
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

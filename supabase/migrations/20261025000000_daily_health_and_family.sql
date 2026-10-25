-- Daily health and family profiles:
--   1. Family profiles: one account can keep records for several people
--      (e.g. a parent). The app says which person is selected with the
--      x-profile-id request header, and every row-level security rule only
--      returns that person's rows, so screens can't mix people up.
--   2. Vital readings: blood pressure, blood sugar, weight.
--   3. Daily check-ins: how you feel, sleep, symptoms.
--   4. Reminder kinds for reading checks and the weekly summary.

-- ---------------------------------------------------------------- family profiles
alter table health_profiles drop constraint health_profiles_relationship_check;
alter table health_profiles add constraint health_profiles_relationship_check
  check (relationship in ('self', 'parent', 'spouse', 'child', 'sibling', 'grandparent', 'other'));

-- Still exactly one "self" profile (and at most one demo) per account; family members are extra.
drop index health_profiles_one_self;
create unique index health_profiles_one_self on health_profiles(owner_id) where relationship = 'self' and not is_demo;
create unique index health_profiles_one_demo on health_profiles(owner_id) where is_demo;

create or replace function limit_family_size() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from health_profiles where owner_id = new.owner_id) >= 10 then
    raise exception 'profile limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function limit_family_size() from public, anon, authenticated;
create trigger limit_family_size before insert on health_profiles for each row execute function limit_family_size();

-- The person selected in the app, from the x-profile-id header. No header
-- (server jobs, older app versions) means no extra restriction.
create or replace function is_active_profile(p_profile_id uuid) returns boolean
language sql stable set search_path = public as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::json->>'x-profile-id', ''),
    p_profile_id::text
  ) = p_profile_id::text
$$;
grant execute on function is_active_profile(uuid) to authenticated;

-- ---------------------------------------------------------------- vital readings
create table vital_readings (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references health_profiles(id) on delete cascade,
  kind           text not null check (kind in ('blood_pressure', 'glucose', 'weight')),
  measured_at    timestamptz not null default now(),
  systolic       smallint check (systolic between 50 and 300),
  diastolic      smallint check (diastolic between 30 and 200),
  pulse          smallint check (pulse between 20 and 250),
  glucose_mg_dl  numeric check (glucose_mg_dl between 10 and 1000),
  glucose_context text check (glucose_context in ('fasting', 'before_meal', 'after_meal', 'bedtime', 'random')),
  weight_kg      numeric check (weight_kg between 2 and 400),
  note           text check (char_length(note) <= 500),
  source         text not null default 'user_entered' check (source in ('user_entered', 'device')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint vital_shape check (
    (kind = 'blood_pressure' and systolic is not null and diastolic is not null and systolic > diastolic)
    or (kind = 'glucose' and glucose_mg_dl is not null)
    or (kind = 'weight' and weight_kg is not null))
);
create index on vital_readings(profile_id, kind, measured_at desc);

-- ---------------------------------------------------------------- daily check-ins
create table daily_checkins (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references health_profiles(id) on delete cascade,
  day          date not null,
  mood         smallint check (mood between 1 and 5),
  sleep_hours  numeric check (sleep_hours between 0 and 24),
  symptoms     text[] not null default '{}',
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (profile_id, day)
);

do $$
declare t text;
begin
  foreach t in array array['vital_readings', 'daily_checkins'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated
                    using (is_profile_owner(profile_id)) with check (is_profile_owner(profile_id))', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated, service_role', t);
    execute format('create trigger touch before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- scope every rule to the selected person
-- Every policy that checks profile ownership also checks that the row belongs
-- to the person selected in the app.
do $$
declare p record;
begin
  for p in
    select tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public' and tablename <> 'health_profiles'
      and (qual like '%is_profile_owner(profile_id)%' or with_check like '%is_profile_owner(profile_id)%')
  loop
    if p.qual is not null then
      execute format('alter policy %I on %I using (is_profile_owner(profile_id) and is_active_profile(profile_id))', p.policyname, p.tablename);
    end if;
    if p.with_check is not null then
      execute format('alter policy %I on %I with check (is_profile_owner(profile_id) and is_active_profile(profile_id))', p.policyname, p.tablename);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- reminders
alter type reminder_kind add value if not exists 'vital_check';
alter type reminder_kind add value if not exists 'weekly_summary';

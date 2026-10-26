-- Sharing records between accounts, with the owner's approval.
--
--  * invite:   the owner shares one of their profiles with someone's email.
--  * request:  someone asks the owner (by email) to see their records; the
--              owner approves, choosing the profile and the access level.
--  * transfer: hand-over of a profile you keep for someone (e.g. a parent who
--              now has their own account); they accept and become its owner.
--
-- Access levels: 'view' (read only) or 'help' (also log doses, add readings,
-- scan reports). 'alerts' adds missed-dose alerts to the helper's phone.
-- Owners can change or stop sharing at any time; helpers can leave. Nothing is
-- visible before the owner approves. Everything is logged for the owner.

create table profile_shares (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('invite', 'request', 'transfer')),
  status         text not null default 'pending' check (status in ('pending', 'active', 'declined', 'revoked', 'done')),
  profile_id     uuid references health_profiles(id) on delete cascade,
  owner_id       uuid references auth.users(id) on delete cascade,
  owner_email    text check (owner_email = lower(owner_email)),
  grantee_id     uuid references auth.users(id) on delete cascade,
  grantee_email  text check (grantee_email = lower(grantee_email)),
  access         text not null default 'view' check (access in ('view', 'help')),
  alerts         boolean not null default false,
  keep_access    text check (keep_access in ('view', 'help')), -- transfer: access the sender keeps if the recipient agrees
  expires_at     timestamptz,
  created_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  check (kind <> 'invite' or (profile_id is not null and owner_id is not null and grantee_email is not null)),
  check (kind <> 'request' or (grantee_id is not null and owner_email is not null)),
  check (kind <> 'transfer' or (profile_id is not null and owner_id is not null and grantee_email is not null))
);
create index on profile_shares(grantee_id) where status = 'active';
create index on profile_shares(profile_id) where status = 'active';
create unique index profile_shares_one_active on profile_shares(profile_id, grantee_id) where status = 'active';
alter table profile_shares enable row level security; -- no policies: only through the functions below
revoke all on profile_shares from anon, authenticated;

-- Views of a shared profile by a helper, at most one row per helper per day.
create table share_views (
  profile_id  uuid not null references health_profiles(id) on delete cascade,
  viewer_id   uuid not null references auth.users(id) on delete cascade,
  day         date not null default current_date,
  primary key (profile_id, viewer_id, day)
);
alter table share_views enable row level security;
revoke all on share_views from anon, authenticated;

alter table medication_dose_logs add column if not exists helper_alerted_at timestamptz;

-- ---------------------------------------------------------------- access checks
create or replace function my_email() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  return (select lower(email) from auth.users where id = auth.uid());
end $$;
revoke all on function my_email() from public, anon;

-- 'owner' | 'help' | 'view' | null for the signed-in account.
create or replace function profile_access(p_profile_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from health_profiles where id = p_profile_id and owner_id = auth.uid()) then 'owner'
    else (select s.access from profile_shares s
          where s.profile_id = p_profile_id and s.grantee_id = auth.uid() and s.status = 'active'
            and s.kind <> 'transfer' and (s.expires_at is null or s.expires_at > now())
          order by s.access = 'help' desc limit 1)
  end
$$;
revoke all on function profile_access(uuid) from public, anon;
grant execute on function profile_access(uuid) to authenticated;

-- "Can change this person's records": the owner, or a helper with 'help' access.
-- Every existing rule already uses this for reading and writing records.
create or replace function is_profile_owner(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(profile_access(p_profile_id) in ('owner', 'help'), false)
$$;

-- "View" access: reading only, added next to every existing rule.
do $$
declare t text;
begin
  for t in
    select distinct tablename from pg_policies
    where schemaname = 'public' and tablename not in ('health_profiles', 'audit_events', 'usage_counters', 'ai_conversations', 'ai_messages', 'ai_feedback')
      and (qual like '%is_profile_owner(profile_id)%' or with_check like '%is_profile_owner(profile_id)%')
  loop
    execute format('create policy shared_read on %I for select to authenticated
                    using (profile_access(profile_id) is not null and is_active_profile(profile_id))', t);
  end loop;
end $$;

-- Advisor conversations stay private to the owner, whatever the access level.
do $$
declare p record;
begin
  for p in
    select tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public' and tablename in ('ai_conversations', 'ai_messages', 'ai_feedback')
      and (qual like '%is_profile_owner(profile_id)%' or with_check like '%is_profile_owner(profile_id)%')
  loop
    if p.qual is not null then
      execute format('alter policy %I on %I using (profile_access(profile_id) = %L and is_active_profile(profile_id))', p.policyname, p.tablename, 'owner');
    end if;
    if p.with_check is not null then
      execute format('alter policy %I on %I with check (profile_access(profile_id) = %L and is_active_profile(profile_id))', p.policyname, p.tablename, 'owner');
    end if;
  end loop;
end $$;

-- The shared person's profile itself: readable; only its owner can change or delete it.
create policy shared_read on health_profiles for select to authenticated using (profile_access(id) is not null);

-- Change history stays with the owner.
drop policy owner_read on audit_events;
create policy owner_read on audit_events for select to authenticated using (profile_access(profile_id) = 'owner');

-- Original documents: viewers can open them; helpers can also add them (insert/delete use is_profile_owner).
create policy medical_docs_shared_select on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and profile_access(((storage.foldername(name))[1])::uuid) is not null);

-- ---------------------------------------------------------------- sharing actions
-- Share one of your profiles with an email (they accept in the app).
create or replace function share_invite(p_profile_id uuid, p_email text, p_access text, p_alerts boolean, p_days integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_id uuid;
begin
  if profile_access(p_profile_id) is distinct from 'owner' then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if v_email = my_email() then raise exception 'cannot share with yourself' using errcode = '22023'; end if;
  if p_access not in ('view', 'help') then raise exception 'invalid access' using errcode = '22023'; end if;
  update profile_shares set status = 'revoked', responded_at = now()
  where profile_id = p_profile_id and grantee_email = v_email and kind = 'invite' and status = 'pending';
  insert into profile_shares (kind, profile_id, owner_id, grantee_email, access, alerts, expires_at, created_by)
  values ('invite', p_profile_id, auth.uid(), v_email, p_access, coalesce(p_alerts, false),
          case when p_days is null or p_days <= 0 then null else now() + make_interval(days => least(p_days, 365)) end, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Ask someone (by email) to share their records with you.
create or replace function share_request(p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_id uuid;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_email = my_email() then raise exception 'invalid email' using errcode = '22023'; end if;
  if (select count(*) from profile_shares where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many requests' using errcode = '54000';
  end if;
  update profile_shares set status = 'revoked', responded_at = now()
  where kind = 'request' and grantee_id = auth.uid() and owner_email = v_email and status = 'pending';
  insert into profile_shares (kind, grantee_id, owner_email, created_by)
  values ('request', auth.uid(), v_email, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Hand a profile you keep for someone over to their own account.
create or replace function share_transfer(p_profile_id uuid, p_email text, p_keep_access text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_id uuid;
begin
  if profile_access(p_profile_id) is distinct from 'owner' then raise exception 'not allowed' using errcode = '42501'; end if;
  if (select relationship from health_profiles where id = p_profile_id) = 'self' then raise exception 'cannot hand over your own profile' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_email = my_email() then raise exception 'invalid email' using errcode = '22023'; end if;
  update profile_shares set status = 'revoked', responded_at = now() where profile_id = p_profile_id and kind = 'transfer' and status = 'pending';
  insert into profile_shares (kind, profile_id, owner_id, grantee_email, access, keep_access, created_by)
  values ('transfer', p_profile_id, auth.uid(), v_email, 'view', nullif(p_keep_access, ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Accept or decline something addressed to you.
--  invite:   you become a viewer/helper.
--  request:  you are the owner; choose which profile and what access.
--  transfer: the profile becomes your own (only if your own profile has no records yet).
create or replace function share_respond(p_share_id uuid, p_accept boolean, p_profile_id uuid default null,
  p_access text default null, p_alerts boolean default null, p_keep boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare s profile_shares; v_me text := my_email(); v_self uuid; v_profile uuid;
begin
  select * into s from profile_shares where id = p_share_id and status = 'pending' for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;

  if s.kind in ('invite', 'transfer') and s.grantee_email is distinct from v_me then raise exception 'not allowed' using errcode = '42501'; end if;
  if s.kind = 'request' and s.owner_email is distinct from v_me then raise exception 'not allowed' using errcode = '42501'; end if;

  if not p_accept then
    update profile_shares set status = 'declined', responded_at = now() where id = s.id;
    return null;
  end if;

  if s.kind = 'invite' then
    update profile_shares set status = 'revoked', responded_at = now()
    where profile_id = s.profile_id and grantee_id = auth.uid() and status = 'active';
    update profile_shares set status = 'active', grantee_id = auth.uid(), responded_at = now() where id = s.id;
    return s.profile_id;
  end if;

  if s.kind = 'request' then
    v_profile := coalesce(p_profile_id, (select id from health_profiles where owner_id = auth.uid() and relationship = 'self' and not is_demo));
    if v_profile is null or profile_access(v_profile) is distinct from 'owner' then raise exception 'not allowed' using errcode = '42501'; end if;
    update profile_shares set status = 'revoked', responded_at = now()
    where profile_id = v_profile and grantee_id = s.grantee_id and status = 'active';
    update profile_shares set status = 'active', profile_id = v_profile, owner_id = auth.uid(),
      access = case when p_access in ('view', 'help') then p_access else 'view' end, alerts = coalesce(p_alerts, false), responded_at = now()
    where id = s.id;
    return v_profile;
  end if;

  -- transfer
  select id into v_self from health_profiles where owner_id = auth.uid() and relationship = 'self' and not is_demo;
  if v_self is not null and (
       exists (select 1 from medical_documents where profile_id = v_self)
    or exists (select 1 from medications where profile_id = v_self)
    or exists (select 1 from vital_readings where profile_id = v_self)
    or exists (select 1 from laboratory_reports where profile_id = v_self)
    or exists (select 1 from daily_checkins where profile_id = v_self)
    or exists (select 1 from appointments where profile_id = v_self)) then
    raise exception 'your profile already has records' using errcode = '23505';
  end if;
  if v_self is not null then delete from health_profiles where id = v_self; end if;
  update health_profiles set owner_id = auth.uid(), relationship = 'self',
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = s.profile_id;
  -- Earlier shares of this profile came from the previous owner: they end here.
  update profile_shares set status = 'revoked', responded_at = now() where profile_id = s.profile_id and status = 'active';
  update profile_shares set status = 'done', grantee_id = auth.uid(), responded_at = now() where id = s.id;
  if p_keep and s.keep_access is not null then
    insert into profile_shares (kind, status, profile_id, owner_id, grantee_id, grantee_email, access, created_by, responded_at)
    values ('invite', 'active', s.profile_id, auth.uid(), s.owner_id, (select lower(email) from auth.users where id = s.owner_id), s.keep_access, auth.uid(), now());
  end if;
  return s.profile_id;
end $$;

-- Owner: change the access level, alerts or expiry of an active share.
create or replace function share_update(p_share_id uuid, p_access text, p_alerts boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profile_shares set access = case when p_access in ('view', 'help') then p_access else access end, alerts = coalesce(p_alerts, alerts)
  where id = p_share_id and owner_id = auth.uid() and status in ('active', 'pending') and kind <> 'transfer';
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
end $$;

-- Stop sharing (owner), leave (helper), or cancel something you sent.
create or replace function share_revoke(p_share_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profile_shares set status = 'revoked', responded_at = now()
  where id = p_share_id and status in ('active', 'pending')
    and (owner_id = auth.uid() or grantee_id = auth.uid() or created_by = auth.uid());
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
end $$;

-- Everything about sharing that involves you, for the app's screens.
create or replace function my_shares() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me text := my_email();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'kind', s.kind, 'status', s.status, 'access', s.access, 'alerts', s.alerts, 'keep_access', s.keep_access,
      'expires_at', s.expires_at, 'created_at', s.created_at, 'profile_id', s.profile_id,
      'direction', case
        when s.kind = 'request' and s.status = 'pending' then (case when s.grantee_id = auth.uid() then 'sent' else 'received' end)
        when s.owner_id = auth.uid() or (s.kind <> 'request' and s.created_by = auth.uid()) then 'given'
        else 'received' end,
      'profile_name', (select coalesce(p.display_name, '') from health_profiles p where p.id = s.profile_id),
      'owner_name', (select coalesce(p.display_name, '') from health_profiles p where p.owner_id = coalesce(s.owner_id, s.created_by) and p.relationship = 'self' and not p.is_demo),
      'owner_email', coalesce(s.owner_email, (select lower(u.email) from auth.users u where u.id = s.owner_id)),
      'grantee_email', coalesce(s.grantee_email, (select lower(u.email) from auth.users u where u.id = s.grantee_id)),
      'grantee_name', (select coalesce(p.display_name, '') from health_profiles p where p.owner_id = s.grantee_id and p.relationship = 'self' and not p.is_demo)
    ) order by s.created_at desc)
    from profile_shares s
    where (s.status in ('pending', 'active') and (s.expires_at is null or s.expires_at > now()))
      and (s.owner_id = auth.uid() or s.grantee_id = auth.uid() or s.created_by = auth.uid()
           or (s.status = 'pending' and (s.grantee_email = v_me or s.owner_email = v_me)))
  ), '[]'::jsonb);
end $$;

-- Helper opened a shared profile (shown to the owner as activity).
create or replace function log_shared_view(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if profile_access(p_profile_id) in ('view', 'help') then
    insert into share_views (profile_id, viewer_id) values (p_profile_id, auth.uid()) on conflict do nothing;
  end if;
end $$;

-- Owner: recent activity by people you share with (views and changes), newest first.
create or replace function share_activity(p_profile_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if profile_access(p_profile_id) is distinct from 'owner' then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(a order by a->>'at' desc) from (
      select jsonb_build_object('at', v.day::timestamptz, 'action', 'viewed', 'what', '', 'who', lower(u.email)) as a
      from share_views v join auth.users u on u.id = v.viewer_id
      where v.profile_id = p_profile_id and v.day > current_date - 30
      union all
      select jsonb_build_object('at', e.created_at, 'action', e.action, 'what', e.table_name, 'who', lower(u.email))
      from audit_events e join auth.users u on u.id = e.actor_id
      join health_profiles p on p.id = e.profile_id
      where e.profile_id = p_profile_id and e.actor_id <> p.owner_id and e.created_at > now() - interval '30 days'
      limit 200
    ) x(a)
  ), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['share_invite(uuid, text, text, boolean, integer)', 'share_request(text)', 'share_transfer(uuid, text, text)',
    'share_respond(uuid, boolean, uuid, text, boolean, boolean)', 'share_update(uuid, text, boolean)', 'share_revoke(uuid)',
    'my_shares()', 'log_shared_view(uuid)', 'share_activity(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers' changes in the owner's activity
-- Tables without a full audit trail still record changes made by a helper
-- (not the owner, not the server), so the owner can see who did what.
create or replace function audit_helper_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  if auth.uid() is not null and not exists (
    select 1 from health_profiles where id = (rec->>'profile_id')::uuid and owner_id = auth.uid()) then
    insert into audit_events(profile_id, actor_id, table_name, record_id, action, old_values, new_values)
    values ((rec->>'profile_id')::uuid, auth.uid(), tg_table_name, (rec->>'id')::uuid, lower(tg_op),
            case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
            case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function audit_helper_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['vital_readings', 'daily_checkins', 'medication_dose_logs', 'lifestyle_events', 'symptoms', 'appointments', 'medical_documents', 'reminders'] loop
    if not exists (select 1 from pg_trigger where tgrelid = t::regclass and tgname = 'audit') then
      execute format('create trigger audit_helper after insert or update or delete on %I for each row execute function audit_helper_change()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- alerts for helpers (server only)
-- Doses still not logged an hour after their time, for profiles shared with alerts on.
create or replace function due_helper_alerts(p_limit integer default 200)
returns table (item_id uuid, profile_id uuid, helper_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id, l.profile_id, s.grantee_id
  from medication_dose_logs l
  join medication_schedules ms on ms.id = l.schedule_id and ms.reminders_enabled
  join profile_shares s on s.profile_id = l.profile_id and s.status = 'active' and s.alerts and s.kind <> 'transfer'
    and (s.expires_at is null or s.expires_at > now())
  where l.status in ('pending', 'snoozed')
    and l.scheduled_for <= now() - interval '60 minutes'
    and l.scheduled_for > now() - interval '3 hours'
    and l.helper_alerted_at is null
  limit p_limit
$$;
revoke execute on function due_helper_alerts(integer) from public, anon, authenticated;
grant execute on function due_helper_alerts(integer) to service_role;

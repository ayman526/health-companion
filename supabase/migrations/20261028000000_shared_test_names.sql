-- Better matching of printed test names.
--
-- 1. Shared names: when 3 or more different accounts match the same printed
--    name to the same test, that name becomes known for everyone. Only the
--    name and the test code are shared, never values or who matched it.
-- 2. The team can add names straight from the list of unmatched names.
-- 3. Match rate for the team dashboard (counts only).

create table global_test_aliases (
  alias_key   text primary key check (char_length(alias_key) between 1 and 200),
  test_code   text not null check (test_code ~ '^[a-z0-9_]{1,60}$'),
  source      text not null check (source in ('community', 'team')),
  created_at  timestamptz not null default now()
);
alter table global_test_aliases enable row level security;
create policy read_all on global_test_aliases for select to authenticated using (true);
revoke all on global_test_aliases from anon;
grant select on global_test_aliases to authenticated;

-- One vote per account per printed name (server only; never shown to anyone).
create table alias_votes (
  alias_key  text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  test_code  text not null,
  voted_at   timestamptz not null default now(),
  primary key (alias_key, owner_id)
);
alter table alias_votes enable row level security;
revoke all on alias_votes from anon, authenticated;

create or replace function share_learned_alias() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from health_profiles where id = new.profile_id;
  if v_owner is null or new.alias_key !~ '[a-z؀-ۿ]' or new.alias_key ~ '\d{5,}' or new.alias_key ~ '@' then
    return new;
  end if;
  insert into alias_votes (alias_key, owner_id, test_code) values (new.alias_key, v_owner, new.test_code)
  on conflict (alias_key, owner_id) do update set test_code = excluded.test_code, voted_at = now();
  if (select count(*) from alias_votes where alias_key = new.alias_key and test_code = new.test_code) >= 3 then
    insert into global_test_aliases (alias_key, test_code, source) values (new.alias_key, new.test_code, 'community')
    on conflict (alias_key) do nothing;
    delete from unrecognized_test_names where name_key = new.alias_key;
  end if;
  return new;
end $$;
revoke execute on function share_learned_alias() from public, anon, authenticated;

create trigger share_learned_alias after insert or update on test_aliases
  for each row execute function share_learned_alias();

-- ---------------------------------------------------------------- team tools
create or replace function unrecognized_names_top(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_team_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', name_key, 'seen', seen_count, 'last', last_seen_at) order by seen_count desc, last_seen_at desc)
    from (select * from unrecognized_test_names order by seen_count desc, last_seen_at desc limit greatest(1, least(p_limit, 200))) u
  ), '[]'::jsonb);
end $$;

create or replace function team_add_alias(p_name text, p_test_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_team_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into global_test_aliases (alias_key, test_code, source) values (p_name, p_test_code, 'team')
  on conflict (alias_key) do update set test_code = excluded.test_code, source = 'team', created_at = now();
  delete from unrecognized_test_names where name_key = p_name;
end $$;

create or replace function team_dismiss_unrecognized(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_team_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from unrecognized_test_names where name_key = p_name;
end $$;

-- Share of confirmed lab results matched to a known test, this period vs the one before.
create or replace function match_rate(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days integer := greatest(1, least(p_days, 365));
begin
  if not is_team_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'total', count(*) filter (where created_at >= now() - make_interval(days => v_days)),
      'matched', count(*) filter (where created_at >= now() - make_interval(days => v_days) and test_code is not null),
      'prev_total', count(*) filter (where created_at < now() - make_interval(days => v_days) and created_at >= now() - make_interval(days => v_days * 2)),
      'prev_matched', count(*) filter (where created_at < now() - make_interval(days => v_days) and created_at >= now() - make_interval(days => v_days * 2) and test_code is not null),
      'shared_names', (select count(*) from global_test_aliases)
    )
    from laboratory_results where status = 'confirmed'
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array['unrecognized_names_top(integer)', 'team_add_alias(text, text)', 'team_dismiss_unrecognized(text)', 'match_rate(integer)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

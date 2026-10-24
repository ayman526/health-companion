-- Account deletion: deleting the auth user cascades to the health profile and
-- every record. The audit trigger used to log each cascaded delete against the
-- profile being removed, which broke the cascade (foreign key violation). When
-- the whole profile is going away there is nothing to audit for, so skip it.

create or replace function audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'DELETE' and not exists (select 1 from health_profiles where id = (rec->>'profile_id')::uuid) then
    return old;
  end if;
  insert into audit_events(profile_id, actor_id, table_name, record_id, action, old_values, new_values)
  values (
    (rec->>'profile_id')::uuid,
    auth.uid(),
    tg_table_name,
    (rec->>'id')::uuid,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

revoke execute on function audit_change() from public, anon, authenticated;

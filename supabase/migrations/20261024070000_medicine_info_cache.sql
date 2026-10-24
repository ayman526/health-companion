-- AI-generated "commonly used for" notes for medicines that aren't in the app's
-- bundled list, cached by normalized medicine name so each name is looked up
-- once. Holds no user, profile or dose information. Only the medicine-info
-- function (service role) reads and writes it.

create table medicine_info_cache (
  name_key          text primary key check (char_length(name_key) between 2 and 80),
  recognized        boolean not null,
  active_ingredient text,
  uses_en           text,
  uses_ar           text,
  model             text not null,
  created_at        timestamptz not null default now()
);
alter table medicine_info_cache enable row level security;
revoke all on medicine_info_cache from public, anon, authenticated;
grant select, insert, update, delete on medicine_info_cache to service_role;

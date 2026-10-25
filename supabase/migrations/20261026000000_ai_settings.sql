-- AI settings per feature: which model each feature uses, its monthly limit
-- per account, and an on/off switch. Edited by the team in the Supabase Table
-- Editor; the Edge Functions pick up changes within about a minute and fall
-- back to their built-in defaults if a row is missing or a value is invalid.
--
-- Only the service role reads it (RLS on, no policies): users never see it.

create table public.ai_settings (
  feature       text primary key,
  model         text not null,
  backup_model  text,
  monthly_limit integer check (monthly_limit is null or monthly_limit between 0 and 100000),
  enabled       boolean not null default true,
  notes         text,
  updated_at    timestamptz not null default now()
);

alter table public.ai_settings enable row level security;
revoke all on public.ai_settings from anon, authenticated;

create or replace function public.ai_settings_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger ai_settings_touch before update on public.ai_settings
  for each row execute function public.ai_settings_touch();

insert into public.ai_settings (feature, model, backup_model, monthly_limit, notes) values
  ('scan',           'claude-sonnet-5-5', 'claude-opus-5-5', 15,
   'Scanning reports and prescriptions. backup_model reads the document again when the first read is unsure (handwriting, unclear values). Empty backup_model = no second look.'),
  ('advisor',        'claude-sonnet-5-5', null, 100, 'AI advisor questions per account per month.'),
  ('voice',          'claude-haiku-5-5',  null, 100, 'Voice logging. Shares one monthly counter with monitor_photo.'),
  ('monitor_photo',  'claude-haiku-5-5',  null, 100, 'Reading a device screen from a photo. Shares one monthly counter with voice.'),
  ('medicine_info',  'claude-haiku-5-5',  null, null, '"Commonly used for" medicine notes; saved after the first lookup, so no limit.'),
  ('library',        'claude-sonnet-5-5', null, null, 'Reading library build/refresh (team only).');

comment on table public.ai_settings is
  'Per-feature AI model, monthly limit and on/off switch. Allowed models: claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5. Set enabled = false to pause a feature.';

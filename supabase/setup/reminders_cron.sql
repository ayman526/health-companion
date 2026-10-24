-- Schedules the send-reminders function every minute.
-- Run once in the SQL Editor AFTER replacing <CRON_SECRET> with the same value
-- stored in Edge Function secrets as CRON_SECRET. Never commit the real value.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'hc-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://tbrjbiowutfzpemqwlgf.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

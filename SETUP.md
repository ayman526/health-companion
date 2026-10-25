# Setup

## 1. Create the Supabase project

1. At [supabase.com/dashboard](https://supabase.com/dashboard), click **New project**.
2. **Region: Central EU (Frankfurt)** (`eu-central-1`). The privacy consent text says Frankfurt, so keep this region.
3. Generate a strong database password and store it in your password manager. You don't need to share it.

## 2. Create the database tables

Run every file in [`supabase/migrations/`](supabase/migrations/) **once each, in filename order**:

1. `20261024000000_init.sql`: tables, security rules, file storage
2. `20261024010000_documents.sql`: report confirm/discard functions, quotas
3. `20261024020000_learned_aliases.sql`: remembers test names you match by hand
4. `20261024030000_unrecognized_names.sql`: anonymous count of test names the app doesn't know yet (see below)
5. `20261024040000_corrections_insights.sql`: correcting confirmed results, stored insights
6. `20261024050000_medications_reminders.sql`: medications, doses, reminders, scheduled jobs
7. `20261024060000_medication_photos.sql`: photo of your own medicine
8. `20261024070000_medicine_info_cache.sql`: shared cache of AI "commonly used for" notes
9. `20261024080000_lifestyle_and_suggestions.sql`: life changes log, suggested-checkup decisions
10. `20261024090000_profile_details.sql`: optional profile details from sign-up (height, weight, pregnancy, smoking, onboarding progress)
11. `20261024100000_account_deletion.sql`: lets "Delete my account" remove everything (fixes the change log blocking it)
12. `20261025000000_daily_health_and_family.sql`: home readings, daily check-ins, family profiles (each person's records kept separate)
13. `20261025010000_more_readings.sql`: heart rate, oxygen and temperature readings; reading a monitor from a photo
14. `20261025020000_library_visits_usage.sql`: reading cards, anonymous usage counts, doctor-visit reminders, checkups marked as done

Pick one way:

- **SQL Editor (simplest):** Dashboard → SQL Editor → New query → paste the file → Run → "Success. No rows returned". If Supabase warns about destructive operations or RLS, choose **Run and enable RLS**: the scripts only tighten access.
- **CLI:** in your own terminal, run `npx supabase login`, then `npx supabase link --project-ref <your-ref>` and `npx supabase db push` from the project root. Docker isn't needed for these commands.

## 3. Configure sign-in (magic link)

Dashboard → **Authentication**:

1. **Sign In / Providers → Email**: enabled. Leave "Confirm email" on.
2. **URL Configuration**:
   - Site URL: `http://localhost:5173` for now (change it to the production URL at launch).
   - Redirect URLs: add `http://localhost:5173/**`.
3. **Emails → SMTP**: the built-in email sender only allows a few emails per hour, which is fine for testing on your own. Before inviting beta users, connect a custom SMTP provider (for example Resend, with your own domain).

## 4. Connect the app

Dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon** (or **publishable**) key into `app/.env.local`:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key>
```

The anon key is meant to be public: row-level security decides what each user can see. **Never** put the `service_role` / secret key in the app or share it in chat. It goes only into Edge Function secrets, later.

## 5. Run

```bash
npm --prefix app run dev
```

Open http://localhost:5173, enter your email and click the link in the email you receive. You'll go through consent and profile setup, then land on Home.

## Tests

```bash
npm --prefix app test
```

The database tests run the real migration on an in-memory Postgres (PGlite), so they need no Supabase project.

## 6. Report reading (Phase 2)

1. **Anthropic API key:** create one at console.anthropic.com → API keys. Then in Supabase: Dashboard → **Edge Functions → Secrets** → add `ANTHROPIC_API_KEY`. Don't paste the key into chat or into `app/.env.local`; it must live only on the server.
2. **Deploy the function** (from the project root, after `npx supabase@2.122.0 login` once):

```bash
npx supabase@2.122.0 functions deploy extract-document --project-ref tbrjbiowutfzpemqwlgf --use-api
```

Until the key is set, uploads still work and the app says report reading isn't set up yet.

## 7. Reminders (Phase 5)

- Secrets set on the server: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. The public VAPID key is also in `app/.env.local` as `VITE_VAPID_PUBLIC_KEY`.
- Functions: `extract-document`, `send-reminders`, `advisor`, `medicine-info`, `delete-account`, `read-monitor`, `parse-voice`, `library-build` (team only, see supabase/library/README.md) (deploy with `npx supabase@2.122.0 functions deploy <name> --project-ref tbrjbiowutfzpemqwlgf --use-api`).
- Run [`supabase/setup/reminders_cron.sql`](supabase/setup/reminders_cron.sql) once, with `<CRON_SECRET>` replaced by the real value (never commit it). It calls `send-reminders` every minute.
- Optional fallbacks: email needs `RESEND_API_KEY` + `EMAIL_FROM` (a verified Resend domain); WhatsApp needs `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` and an approved template name in `WHATSAPP_TEMPLATE`. Until set, Settings shows them as "not set up yet".
- iPhone/iPad: push works only after Share → Add to Home Screen (iOS 16.4+).

## Growing the test catalog

Dashboard → Table Editor → `unrecognized_test_names` lists test names users confirmed that the catalog didn't recognize, with how often each was seen. It holds no user, value or date. Add the most frequent ones to `app/src/domain/labs/catalog.ts` (with a source for any clinical rule), then run `npm --prefix app test`. The catalog-sync test tells you to update the copy in `supabase/functions/extract-document/index.ts`.

## Coming later (credentials needed)

| Service | Used for | When |
|---|---|---|
| Anthropic API key | AI advisor (same key as report reading) | Phase 4 |
| Resend account + domain | Magic-link email (SMTP), email reminders | Before beta users |
| Meta WhatsApp Business + approved template | WhatsApp reminders | Phase 5 |
| VAPID key pair (generated locally) | Web push | Phase 5 |

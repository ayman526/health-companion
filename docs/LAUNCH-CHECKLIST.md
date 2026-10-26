# Phase 6: what's left before others use Health Journal

Tick items off as you go. **A** must be done before anyone else uses the app. **B** before inviting beta users. **C** before going public.

## A. Must do before anyone else uses it

- [ ] **Put the project on GitHub** (section 1 below).
- [ ] **Host the app on Vercel** (section 2 below) and update the Supabase sign-in addresses.
- [ ] **Custom email sender (SMTP).** The built-in Supabase sender allows only a few emails an hour, so magic links will start failing with more than a handful of users.
  1. Create a Resend account and add your domain. Resend gives you DNS records (SPF, DKIM) to add at your domain registrar.
  2. In Supabase: **Authentication → Emails → SMTP Settings**. Turn on custom SMTP with host `smtp.resend.com`, port `465`, user `resend`, and your Resend API key as the password.
  3. Use a sender like `no-reply@yourdomain.com`.

  This also unlocks the email reminder fallback.
  3. Then edit the **Magic Link** and **Confirm signup** templates (Authentication → Emails): paste
     `docs/email-templates/sign-in-code.html` and set the subject to `Your Health Journal code: {{ .Token }} | رمز الدخول`.
     Until then the emails carry only the link; the sign-in screen accepts either. Check Email OTP length is 6.
- [x] **Download my data + Delete my account**: built in the Privacy Center (needs migration 11). Test delete once with a spare email account before launch.
- [ ] **Rotate `CRON_SECRET`**, because it appeared in a screenshot:
  1. Set a new secret in Supabase Edge Function secrets.
  2. Run `select cron.unschedule('hc-send-reminders');`.
  3. Re-run `supabase/setup/reminders_cron.sql` with the new value.

## B. Quality checks before beta users

- [ ] **Arabic review** of every screen by a native speaker (wording, right-to-left layout, Egyptian medical terms).
- [ ] **Real phone testing:**
  - iPhone Safari, including "Add to Home Screen", which iPhone needs for notifications.
  - Android Chrome.
  - Check: the camera scan, notifications arriving on time, and sign-in links opening the app.
- [ ] **Security review:**
  - Re-check every table's row-level security.
  - Restrict the Edge Functions' allowed origin from `*` to your real web address.
  - Confirm no secret is in the GitHub repository.
- [x] **Speed:** screens load on demand, libraries cached separately, test explanations per language (first download about 30% smaller).
- [ ] **Test the AI advisor** with real questions in both languages, including an emergency-sounding one.

## C. Before going public

- [ ] **Clinician / pharmacist review:**
  - the medical rules (SPEC §6);
  - the 87 test explanations (`app/src/content/testInfo/`);
  - the medicine "commonly used for" notes (`app/src/content/medicineUses.ts`);
  - the suggested-checkup rules (`app/src/domain/testSuggestions.ts`).
- [ ] **Legal review:**
  - **Egypt:** Personal Data Protection Law, including the licence for storing data outside Egypt (Frankfurt).
  - **US:** state health-data laws (for example Washington's My Health My Data Act) and FTC health-breach rules.
  - Final terms of use and privacy policy. Users will be asked to agree again; bump `CONSENT_VERSION` in `app/src/lib/consent.ts`.
- [ ] **WhatsApp reminders:** a Meta Business account, a verified number and an approved message template.
- [ ] **Design pass** from `docs/DESIGN-PROPOSAL.md`.

---

## 1. Connect the project to GitHub

You need a free GitHub account (github.com). The repository must be **private**.

**Option 1: on the website (simplest)**

1. On github.com click **New repository**.
   - Name: `health-companion`.
   - Visibility: **Private**.
   - Don't add a README, .gitignore or licence; the project already has them.
2. In Terminal, from the project folder, run each line:

```bash
cd "/Users/aymansaad/NEW SAAS/AI Health"
```
```bash
git init -b main
```
```bash
git add .
```
```bash
git status
```

   **Check the list before continuing.** You must **not** see `app/.env.local`, `supabase/.temp` or any file with a key or secret in it. The `.gitignore` files already exclude them.

```bash
git commit -m "Health Companion beta"
```
```bash
git remote add origin https://github.com/YOUR-USERNAME/health-companion.git
```
```bash
git push -u origin main
```

GitHub will ask you to sign in in the browser the first time.

**Option 2: with the GitHub command-line tool**

After `brew install gh` and `gh auth login`, and after the `git init`, `git add` and `git commit` steps above:

```bash
gh repo create health-companion --private --source . --push
```

From then on, after each change: `git add .`, `git commit -m "what changed"`, `git push`. Vercel redeploys automatically on every push.

## 2. Host the app on Vercel

Vercel only serves the app's screens (HTML, JavaScript, images). Health records never pass through Vercel: the browser talks directly to Supabase in Frankfurt.

1. Go to vercel.com and choose **Sign up → Continue with GitHub**. The free Hobby plan is fine for a beta.
2. Click **Add New… → Project**, then pick the `health-companion` repository. Allow Vercel access to that repository only.
3. Set up the project:
   - **Root Directory:** `app`. This is important, because the web app lives in that subfolder.
   - **Framework Preset:** Vite (usually detected automatically).
   - **Build Command:** `npm run build`.
   - **Output Directory:** `dist`.
4. Under **Environment Variables**, add the same three values as in `app/.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (the publishable key, which is safe in the browser)
   - `VITE_VAPID_PUBLIC_KEY` (the **public** key only)

   **Never add** the Supabase service-role key, `ANTHROPIC_API_KEY`, `CRON_SECRET` or the VAPID private key. Those stay in Supabase secrets.
5. Click **Deploy**. After about a minute you get an address like `https://health-companion-xyz.vercel.app`.
6. **Tell Supabase about the new address** so sign-in links work. In Supabase go to **Authentication → URL Configuration**:
   - **Site URL:** your Vercel address.
   - **Redirect URLs:** add `https://health-companion-xyz.vercel.app/**`. Keep `http://localhost:5173/**` for testing on your Mac.
7. Open the Vercel address on your phone, sign in, and turn on notifications. Notifications are tied to each address, so turn them on again there.
8. Optional custom domain:
   1. In Vercel go to **Settings → Domains** and add, for example, `app.yourdomain.com`.
   2. Add the DNS record Vercel shows you.
   3. Repeat step 6 with the new domain.
9. In Vercel, under **Settings → Analytics / Speed Insights**, leave both **off**. They aren't needed and would add another company to the privacy policy.

`app/vercel.json` is already in the project. It makes links like `/medications/123` open correctly, and it adds standard security headers.

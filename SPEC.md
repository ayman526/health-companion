# Health Journal (formerly Health Companion AI) — MVP Specification

Status: draft v1 · 2026-10-24 · Source of truth for business logic. The original mega prompt describes the product vision; where they differ, this file wins.

## 1. Decisions

| Topic | Decision |
|---|---|
| Build | Claude Code, this repo. React + TypeScript + Vite + Tailwind (`app/`), Supabase (Auth, Postgres, Storage, Edge Functions, pg_cron) |
| Business model | Free beta. Per-user quotas still enforced (see §9) |
| AI provider | Claude for document extraction (vision) and the advisor, behind `ExtractionProvider` and `LlmProvider` interfaces |
| Markets | Egypt and USA. Emergency numbers: Egypt 123 (ambulance), USA 911 |
| Sign-in | Supabase magic link (email). Custom SMTP required (Supabase default SMTP is rate-limited) |
| Reminders | Web push first; fallbacks email and WhatsApp |
| Drug interactions | Not automated in MVP. Two or more active medications → "Review your medication list with your pharmacist" prompt |
| Clinical rules | Sourced from published guidelines (§6). No clinician has reviewed them yet; every rule carries `clinicianReview: 'pending'` and this must change before public launch |
| Languages | English and Arabic, interface and explanation language set separately. Medical values always in Western digits, Gregorian dates |
| Age | Adults 18+ |

## 2. Core concepts

- **Account** = a login (Supabase `auth.users`).
- **Health profile** = the person whose health data is stored. MVP: exactly one profile per account (`relationship = 'self'`). All health tables reference `profile_id`, never `user_id`, so family profiles and caregiver access later need no migration.
- **Provenance** on every clinical fact: `source` ∈ `document_extraction | user_entered | ai_proposed`, plus `document_id` / `extraction_id` when applicable. `clinician_verified` is never set by the app.
- **Record status** on extracted facts: `draft → confirmed`, or `draft → discarded`. Only `confirmed` facts feed comparisons, charts, insights, reminders and AI context.

## 3. Document pipeline (state machine)

`medical_documents.status`:

```
uploaded → processing → needs_review → confirmed
                     ↘ failed (retryable)          ↘ discarded
uploaded → duplicate_blocked (exact file hash already exists for this profile)
```

1. Client validates type (JPEG, PNG, HEIC, WebP, PDF), size ≤ 20 MB, pages ≤ 20. Requires the `ai_processing` consent; without it the user can store the file and enter values manually.
2. File goes to private bucket `medical-documents/{profile_id}/{document_id}/original.ext`. SHA-256 hash stored; exact duplicate → `duplicate_blocked`.
3. Edge function `extract-document` sends the file to Claude with a fixed extraction schema. Document text is wrapped as untrusted data, never as instructions.
4. Output saved to `document_extractions` (raw JSON, model, prompt version) and fanned out into draft rows (`laboratory_reports`/`laboratory_results`, `medications` + `medication_schedules`, `follow_up_plans`, `medical_conditions`), each with `extraction_confidence` and `needs_confirmation` flags for unclear decimals, units, dates, names and strengths.
5. **Near-duplicate check**: same profile + same collection date + ≥ 80% of matched tests with identical value and unit → warn with Merge / Keep both / Skip.
6. Review screen: every flagged field must be confirmed or edited. Collection date is required (fallback: report date, flagged; if neither, the user must enter it).
7. Confirm → rows become `confirmed`, `health_events` written, insight engine runs (§7).
8. Abandoned reviews stay in a "Needs review" queue on Home. Drafts are never used for analysis.

## 4. Lab matching and comparison (deterministic, `app/src/domain/labs`)

- **Catalog**: curated tests with LOINC codes, English and Arabic names, aliases. Extraction proposes a `test_code`; unmatched tests stay `test_code = null` and are listed but never compared until the user links them.
- **Units**: each test has one canonical unit and a whitelist of convertible units with fixed formulas (e.g. cholesterol mmol/L × 38.67 → mg/dL; HbA1c IFCC mmol/mol → NGSP %). Anything else is `not_comparable` with the reason shown. Reference ranges convert with the value.
- **Censored values** (`<5`, `>1000`) are displayed but excluded from numeric change calculations.
- **Computed on read**: comparisons are never stored, so a correction changes every later view immediately.
- **Change significance**: reference change value RCV = 1.96 × √2 × √(CVa² + CVi²), with CVi from the EFLM Biological Variation Database and CVa = desirable imprecision (CVi/2), since the lab's own CVa is unknown. A change is significant only if |% change| > RCV.
- **Trend label** (latest vs previous):
  - `not_comparable` — unit or identity mismatch, censored value, or missing date.
  - `stable` — change within RCV.
  - `improving` / `worsening` — significant change. For `lower_better` and `higher_better` tests, only when the newer or older value is outside the reported range. Otherwise `changed_within_range` (neutral wording, no colour).
  - `in_range` tests (e.g. potassium, hemoglobin, TSH): `improving` when moving toward or into range, `worsening` when moving away or out of range.
- **Range position**: `below | within | above | no_range`. No range reported → no position and no default range is invented.
- **Liver enzymes** (ALT/AST): elevation graded by fold of the reported ULN per ACG 2017: borderline < 2×, mild 2–5×, moderate 5–15×, severe > 15×, massive > 10,000 U/L.

## 5. Status labels (per measurement, never an overall score)

`within_range`, `outside_range`, `follow_up_recommended`, `urgent` + trend labels above. `urgent` comes only from (a) a critical flag printed on the lab report, or (b) the critical-value rules in §6. Never from the LLM alone.

## 6. Clinical rules and sources (all `clinicianReview: pending`)

| Rule | Threshold | Source |
|---|---|---|
| Diabetes range | HbA1c ≥ 6.5% (48 mmol/mol); FPG ≥ 126 mg/dL (7.0 mmol/L) | ADA Standards of Care 2025, §2, Table 2.1 |
| Prediabetes range | HbA1c 5.7–6.4% (39–47 mmol/mol); FPG 100–125 mg/dL | ADA 2025 §2, Table 2.2 |
| Single result is not a diagnosis | Requires confirmation by repeat or second test | ADA 2025 §2 |
| Hypoglycemia level 2 (urgent) | Glucose < 54 mg/dL (3.0 mmol/L) | ADA Standards of Care 2025 (§6, §16) |
| Severe LDL elevation | LDL-C ≥ 190 mg/dL → follow-up recommended | 2018 AHA/ACC Cholesterol Guideline |
| eGFR categories | G1 ≥ 90, G2 60–89, G3a 45–59, G3b 30–44, G4 15–29, G5 < 15 | KDIGO CKD classification (via National Kidney Foundation) |
| Liver enzyme grading | §4 bands | ACG Clinical Guideline: Evaluation of Abnormal Liver Chemistries (Kwo et al., Am J Gastroenterol 2017) |
| Critical values (urgent) | K⁺ < 2.8 or > 6.2 mmol/L; Na⁺ < 120 or > 160 mmol/L; glucose < 54 or > 400 mg/dL; Hb < 7.0 g/dL | Hospital laboratory critical-value policies (UChicago Medicine, Meritus Health), which follow the CLSI GP47 approach. **Limits differ between labs**; the reporting lab's own critical flag always wins |
| Within-subject variation (CVi) | per test in catalog | EFLM Biological Variation Database (2021 + updates, as tabulated by Bio-Rad Q-1680) |
| Patient education links | by LOINC | MedlinePlus Connect (NLM), no personal data sent |

The rules live in versioned code (`app/src/domain/labs/catalog.ts`) with a source ID on every rule. Insights store the rule version that produced them.

## 7. Insights engine

- Triggered on report confirmation, correction, medication change and a daily job.
- Types: `informational`, `follow_up`, `urgent` (kept separate in the UI; only urgent uses red).
- Each insight stores: rule ID + version, evidence (result IDs, document IDs, dates), explanation, next action, and a `dedupe_key` (rule + test + latest result ID). The same key never fires twice.
- When evidence is corrected or deleted, the insight becomes `superseded` and the engine re-evaluates.
- Dismissing an insight hides it; the underlying result is untouched.
- The LLM can phrase insights; it cannot create urgent ones or set thresholds.

## 8. AI advisor

1. **Emergency pre-screen** (deterministic, EN + Egyptian Arabic patterns: chest pain, can't breathe, stroke signs, suicidal intent, severe bleeding, etc.) runs before the LLM. On a match: emergency card with the local number (123 Egypt / 911 USA, by profile country; 988 crisis line for USA mental health). The LLM is a second layer.
2. **Retrieval**: intent → minimal context (relevant tests' confirmed series with computed comparisons, active and recent medications with regimen dates, conditions, allergies, follow-ups, relevant prior summaries). Never the full record.
3. **Generation**: Claude with system rules (no diagnosis, no medication changes, cite record IDs, state uncertainty, answer in the chosen explanation language). Numbers come from the retrieval payload, never computed by the LLM.
4. **Validation**: every cited record ID must exist in the payload; every number in the answer must match one; banned patterns (dose changes, "stop taking", "you have [diagnosis]") are blocked or rewritten as "discuss with your doctor".
5. Conversation summaries are stored dated, linked to the facts they used, and marked stale when those facts change.
6. Facts stated in chat ("I started atorvastatin in June") become `ai_proposed` drafts the user confirms.
7. If the AI is down, records, charts and reminders still work; the advisor shows an honest error and never a fabricated answer.
8. "Report this answer" on every response → `ai_feedback`.

## 9. Medications and reminders

- `medications` (identity) + `medication_schedules` (versioned regimen: dose, unit, frequency, times, start/end). A change closes the current schedule (`valid_to`) and opens a new one. Nothing is overwritten.
- Reminders activate only when name, strength and schedule are user-confirmed. No dose is inferred from a brand name.
- Dose instances are generated server-side 48 h ahead. States: `pending → taken | skipped | snoozed → not_recorded` (after the window closes). Never auto-classified as "missed".
- Optional `supply_quantity` / `supply_ends_on` for renewal reminders.
- Schedules are stored as local wall time + IANA time zone (handles DST and travel).
- **Delivery**: pg_cron every minute → `send-reminders` edge function → web push (VAPID), else email (Resend), else WhatsApp (Meta Cloud API, approved template). Message bodies contain no health details by default ("You have a reminder in Health Journal"). `reminder_deliveries` records `sent | failed`; we never claim "delivered" unless the channel confirms it.
- Follow-ups extracted from documents are proposed reminders until the user confirms the date. AI-suggested intervals are labelled as suggestions, never as clinician orders. A newly confirmed report containing the requested test suggests completing the follow-up.

## 10. Privacy, security, consent

- RLS on every health table via `is_profile_owner(profile_id)`; storage policies keyed on the first path segment. Edge functions re-check ownership with the user's JWT; the service role is used only by cron jobs.
- Consents (`user_consents`, versioned): `terms`, `privacy`, `health_data_processing`, `ai_processing` (Anthropic), `notifications_email`, `notifications_whatsapp`. Withdrawing `ai_processing` disables extraction and the advisor only.
- No health data in logs, analytics, URLs or notification bodies. No ads. No model training.
- Export (JSON + original files ZIP) and account deletion (hard delete DB rows and storage objects; backups age out within the documented window).
- Support staff have no health-data access in MVP.
- **Legal items to clear before public launch** (not engineering-verifiable): Egypt PDPL (Law 151/2020) — sensitive data consent and cross-border transfer licence, since no Supabase region is in Egypt (planned region: eu-central-1 Frankfurt); USA — FTC Health Breach Notification Rule and state consumer-health-data laws (e.g. Washington My Health My Data Act); medical-device classification review (Egypt EDA, US FDA CDS guidance).

## 11. Quotas (free beta)

Per profile per month: 30 document extractions (≤ 20 pages each), 300 advisor messages. Counted in `usage_counters`; clear message when reached.

## 12. Demo mode

"Explore with sample data" opens a sandbox profile (`is_demo = true`) seeded with the fictional May/October scenario, visibly labelled fictional on every screen, excluded from analytics and never merged with real data.

## 13. Open items

- [ ] Supabase project choice: hosted (eu-central-1) or local Docker
- [ ] Anthropic API key, Resend account + domain, Meta WhatsApp Business account + approved template, VAPID keys
- [ ] Clinician review of §6 rules
- [ ] Legal review of §10 items
- [ ] Clinician review of the 87 test explanations (`app/src/content/testInfo/`), the medicine "commonly used for" notes (`app/src/content/medicineUses.ts`) and the suggested-checkup rules (`app/src/domain/testSuggestions.ts`)
- [ ] Rotate `CRON_SECRET` before launch (it appeared in a screenshot during setup): set a new secret, then `select cron.unschedule('hc-send-reminders');` and re-run `supabase/setup/reminders_cron.sql`
- [ ] Email (Resend + domain) and WhatsApp (Meta Business + approved template) reminder fallbacks

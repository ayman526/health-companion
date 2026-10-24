# Design proposal: a health app people trust with their records

**Goal:** every screen should make three things obvious without the person having to read a policy:

1. **It's private.** Only you can see your records, and you can see where they go.
2. **It's credible.** Every number shows where it came from, and every piece of advice shows its source.
3. **You're in control.** You can export, delete, hide or stop sharing at any time, in one or two taps.

The rule behind all of it is **show, don't claim**. A lock icon and the word "secure" convince nobody. A screen that lists what was shared with whom, and when, does.

---

## 1. Visual direction

| | Today | Proposed |
|---|---|---|
| Primary colour | Bright teal `#0F766E` | Deep **ink-teal** `#0B4F5C` for headers and primary buttons, with teal kept as an accent only. Darker and less "wellness app" in tone, closer to the look of a bank or a hospital. |
| Background | Light grey-green | Warm **paper white** `#FAFAF7` with pure white cards, a 1px hairline border and no heavy shadows. It reads like a medical record, not a social feed. |
| Status colours | Muted green / amber / red | Keep them muted, and always pair them with an icon and a word ("Within range ✓", "Above range ↑"). Never colour alone. Red only for genuinely urgent results. |
| Numbers | Body font | **Tabular figures** (`font-variant-numeric: tabular-nums`), slightly larger and semibold, so values line up in tables and look precise. |
| Type | Inter + IBM Plex Sans Arabic | Keep both. They are neutral and very readable in both languages. Increase the base size to 17px for older users. |
| Imagery | None | Keep it that way: no stock photos of smiling doctors. Use simple line icons only. Credibility comes from content, not pictures. |
| Motion | Minimal | Keep it minimal: no confetti or gamification. Use a calm progress bar and subtle check marks. |

---

## 2. Trust patterns (the core of the proposal)

### 2.1 Privacy badge in the header
A small, persistent chip at the top of every screen: **🔒 Private to you**. Tapping it opens the **Privacy Center**. It acts as a constant, quiet reminder, and as a way out for anyone who feels uneasy.

### 2.2 Privacy Center (new screen, replaces the privacy part of Settings)
One place that answers "what happens to my data?" in plain words, with live facts rather than marketing:

- **Who can see your records:** "Only you." Later, when sharing with a doctor exists, this lists each person with a "Stop sharing" button.
- **Where it's stored:** "Supabase, Frankfurt, Germany · encrypted in transit and at rest."
- **What's sent to AI:** one row per feature (reading documents, answering questions, medicine notes), each with an on/off switch. "Anthropic (Claude) · not used for training."
- **Consent history:** a dated list from `user_consents`, e.g. "24 Oct 2026: you agreed to AI reading".
- **Recent activity:** from the audit log, e.g. "Today 09:12: you confirmed a lab report", "Yesterday: you signed in on iPhone". This makes the invisible visible.
- **Download my data** (JSON + original files) and **Delete my account**. Both are promised in the consent text and are already on the must-do list.
- **Sign out on all devices.**

### 2.3 "What will be shared" line before every AI action
Under the Scan button and the advisor's send box, a one-line notice: *"This document will be read by Claude (Anthropic). Not used for training. [Details]"*. Show it every time, not only on first use. It costs one line and removes the biggest fear.

### 2.4 Source chip on every value
Every result, medicine and condition shows where it came from:

- 📄 **From report · 12 Mar 2026 · Alfa Lab** (tap to open the original page)
- ✍️ **You entered**
- ✨ **Suggested by AI, not confirmed** (dashed border until the person confirms it)

The data model already stores `source` for this, so it only needs a consistent chip component.

### 2.5 Evidence chip on every explanation and suggestion
- Ranges, suggested checkups and insights show **"Based on ADA 2026"**, **"AHA/ACC"**, **"KDIGO"**, and so on. Tapping a chip shows the full source name and year.
- Once the clinician review is done, add **"Reviewed by Dr. … on …"**. That review is the single strongest credibility signal the app can have.
- An **"About our medical content"** page lists every source, the review status and the last-updated date.

### 2.6 Advisor answers that show their homework
- The citation chips ("LDL · 3 Mar") are already there. Make them more visible, and add a header line: *"Based on 4 results and 2 medicines in your records."*
- Keep the "not a diagnosis" note, but as a calm footer, not a scary banner.

### 2.7 Discreet mode
An eye icon on Home that blurs all values until the person taps. This helps on public transport or at work. Use the same blur when the app goes to the background (multitasking preview) and on shared screens.

### 2.8 Optional app lock
A Face ID / fingerprint / device PIN lock via WebAuthn passkeys, which never touch the server as passwords. Offer it once, after the first confirmed report: *"Your records are growing. Add a lock?"*

### 2.9 Consent screen, layered
The screenshot check showed that the **Agree** button sits below the fold on a phone. Proposed changes:

- A short summary of three icon rows ("Private to you", "Stored in Germany", "AI reads documents, not used for training").
- A **sticky** "Agree to all and continue" button that is always visible.
- Each item expands to show the full text. The "Choose individually" option stays.

### 2.10 Sign-in screen, trust strip
Under the email field, three small items:

- **No passwords**
- **Encrypted**
- **Delete anytime**

Add footer links to the privacy policy, terms, "Who we are" and contact. A real contact address and a named company are basic credibility signals in Egypt and the US.

### 2.11 Notifications stay generic
Notifications already say "Time for your medicine" with no names. Say so in Settings: *"Reminders never show medicine names on your lock screen."*

---

## 3. Words matter

- Use "your records", not "data".
- Use "Only you can see this", not "secure".
- Never claim **end-to-end encryption**. The server can technically read the data, so the claim would be false. Use "encrypted in transit and at rest".
- Never write "HIPAA compliant" or "certified" until a lawyer confirms it.
- Keep the tone calm when things go wrong: "We couldn't read this page. Nothing was saved." rather than "Error 400".

---

## 4. Suggested order

| Step | Work | Size |
|---|---|---|
| 1 | Sticky consent button + layered summary; sign-in trust strip | Small |
| 2 | Source chips + evidence chips (one shared component) | Small–medium |
| 3 | Privacy Center with download data and delete account (needed before launch anyway) | Medium |
| 4 | "What will be shared" lines; discreet mode | Small |
| 5 | New colour and type tokens across the app | Small (tokens are already centralised in `index.css`) |
| 6 | Recent activity from the audit log | Medium |
| 7 | App lock with passkeys | Medium |
| 8 | "Reviewed by" badges, after the clinician review | Small |

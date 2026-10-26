// send-reminders: delivers due medication doses and reminders (SPEC.md §9).
//
// POST (from pg_cron, header x-cron-secret): sends what is due, then one
//   follow-up for doses still not logged 30 minutes after their notification.
// POST { action: 'dose', dose, status, exp, sig }: a "Taken" / "In 30 min" button
//   on a notification. No user token there, so the notification carries a
//   signature over the dose id and an expiry, made with a server-only key.
// POST { action: 'test' } with the user's JWT: a test notification to their devices.
// GET: which channels are configured, as booleans (no secrets), for the settings screen.
//
// Order per item: web push → WhatsApp → email (email for reminders only, not every dose).
// Messages carry no health details. Deliveries are recorded as "sent" or "failed";
// "delivered_confirmed" is never claimed because these channels don't confirm delivery here.
//
// Secrets: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional:
// RESEND_API_KEY + EMAIL_FROM; WHATSAPP_TOKEN + WHATSAPP_PHONE_ID + WHATSAPP_TEMPLATE).

import webpush from 'npm:web-push@3.6.7'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.50.0'

const env = (k: string) => Deno.env.get(k) ?? ''
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const channels = () => ({
  push: !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY')),
  email: !!(env('RESEND_API_KEY') && env('EMAIL_FROM')),
  whatsapp: !!(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID') && env('WHATSAPP_TEMPLATE')),
})

const TEXT = {
  en: {
    title: 'Health Journal', dose: 'It\'s time for your medicine. Open the app to log it.', reminder: 'You have a reminder. Open the app to see it.',
    familyDose: 'Medicine time for someone you care for. Open the app to log it.', vital: 'Time to log today\'s reading.', summary: 'Your weekly summary is ready.',
    visitPrep: 'You have a doctor visit tomorrow. Prepare your visit summary.', visitFollowup: 'How did your visit go? Update what the doctor changed.',
    helperAlert: 'Someone you care for hasn\'t logged a medicine dose yet.',
    followup: 'Did you take your medicine? Tap to log it.', familyFollowup: 'Was the medicine taken for someone you care for? Tap to log it.',
    taken: 'Taken', snooze: 'In 30 min', loggedTaken: 'Logged as taken ✓', loggedSnoozed: 'We\'ll remind you again in 30 minutes.',
    test: 'Notifications are working. Your reminders will appear like this.',
  },
  ar: {
    title: 'سجلك الصحي', dose: 'حان موعد دوائك. افتح التطبيق لتسجيله.', reminder: 'لديك تذكير. افتح التطبيق لمعرفته.',
    familyDose: 'حان موعد دواء لشخص ترعاه. افتح التطبيق لتسجيله.', vital: 'حان وقت تسجيل قراءتك اليوم.', summary: 'ملخصك الأسبوعي جاهز.',
    visitPrep: 'لديك زيارة للطبيب غدًا. جهّز ملخص الزيارة.', visitFollowup: 'كيف كانت زيارتك؟ سجّل ما غيّره الطبيب.',
    helperAlert: 'شخص ترعاه لم يسجّل جرعة دواء بعد.',
    followup: 'هل أخذت دواءك؟ اضغط لتسجيله.', familyFollowup: 'هل أُخذ الدواء لمن ترعاه؟ اضغط لتسجيله.',
    taken: 'أخذته', snooze: 'بعد 30 دقيقة', loggedTaken: 'تم التسجيل ✓', loggedSnoozed: 'سنذكّرك مرة أخرى بعد 30 دقيقة.',
    test: 'الإشعارات تعمل. ستصلك التذكيرات بهذا الشكل.',
  },
}

type Due = { kind: 'dose' | 'reminder'; item_id: string; profile_id: string; owner_id: string; due_at: string }
type Outcome = { channel: 'push' | 'email' | 'whatsapp' | 'in_app'; status: 'sent' | 'failed'; error?: string }

// ---------------------------------------------------------------- notification buttons
const ACTION_TTL_S = 12 * 3600
const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function sign(doseId: string, exp: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`dose-action:${env('SUPABASE_SERVICE_ROLE_KEY')}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${doseId}.${exp}`)))
}
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
/** Buttons for a dose notification; the service worker posts the signed action back here. */
async function doseButtons(doseId: string, lang: 'en' | 'ar') {
  const exp = Math.floor(Date.now() / 1000) + ACTION_TTL_S
  return {
    actions: [{ action: 'taken', title: TEXT[lang].taken }, { action: 'snooze', title: TEXT[lang].snooze }],
    action_request: { url: `${env('SUPABASE_URL')}/functions/v1/send-reminders`, dose: doseId, exp, sig: await sign(doseId, exp) },
    done: { taken: TEXT[lang].loggedTaken, snooze: TEXT[lang].loggedSnoozed },
  }
}

async function handleDoseAction(admin: SupabaseClient, body: Record<string, unknown>) {
  const dose = String(body.dose ?? '')
  const exp = Number(body.exp)
  const status = body.status === 'taken' ? 'taken' : body.status === 'snooze' ? 'snoozed' : null
  if (!/^[0-9a-f-]{36}$/.test(dose) || !Number.isFinite(exp) || !status) return json(400, { error: 'bad_request' })
  if (exp < Date.now() / 1000) return json(410, { error: 'expired' })
  if (!sameString(String(body.sig ?? ''), await sign(dose, exp))) return json(401, { error: 'unauthorized' })
  // Same fields as log_dose(); only a dose still waiting can be changed from a notification.
  const { data, error } = await admin.from('medication_dose_logs').update({
    status, recorded_at: new Date().toISOString(), self_reported: true,
    snoozed_until: status === 'snoozed' ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
    ...(status === 'snoozed' ? { notified_at: null } : {}),
  }).eq('id', dose).in('status', ['pending', 'snoozed']).select('id')
  if (error) return json(500, { error: 'save_failed' })
  if (data?.length) await admin.rpc('track_server_event', { p_event: status === 'taken' ? 'push_action_taken' : 'push_action_snoozed' })
  console.log(JSON.stringify({ event: 'dose_action', status, changed: !!data?.length }))
  return json(200, { ok: true, changed: !!data?.length })
}

async function handleTest(admin: SupabaseClient, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth?.user) return json(401, { error: 'unauthorized' })
  const { data: profile } = await admin.from('health_profiles').select('ui_language').eq('owner_id', auth.user.id).eq('relationship', 'self').eq('is_demo', false).maybeSingle()
  const lang: 'en' | 'ar' = profile?.ui_language === 'ar' ? 'ar' : 'en'
  const result = await sendPush(admin, auth.user.id, { title: TEXT[lang].title, body: TEXT[lang].test, tag: 'test', url: '/settings' })
  console.log(JSON.stringify({ event: 'push_test', status: result?.status ?? 'no_device' }))
  return json(200, { sent: result?.status === 'sent', reason: result ? result.error ?? null : 'no_device' })
}

async function sendPush(admin: SupabaseClient, ownerId: string, payload: object): Promise<Outcome | null> {
  if (!channels().push) return null
  const { data: subs } = await admin.from('notification_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', ownerId)
  if (!subs?.length) return null
  let sent = false
  let lastError = ''
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 })
      sent = true
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      lastError = `push_${status ?? 'error'}`
      // The browser unsubscribed or the subscription expired: forget it.
      if (status === 404 || status === 410) await admin.from('notification_subscriptions').delete().eq('id', s.id)
    }
  }
  return sent ? { channel: 'push', status: 'sent' } : { channel: 'push', status: 'failed', error: lastError }
}

async function sendWhatsApp(to: string, lang: 'en' | 'ar'): Promise<Outcome> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'template',
      template: { name: env('WHATSAPP_TEMPLATE'), language: { code: lang === 'ar' ? 'ar' : 'en' } },
    }),
  })
  return res.ok ? { channel: 'whatsapp', status: 'sent' } : { channel: 'whatsapp', status: 'failed', error: `whatsapp_${res.status}` }
}

async function sendEmail(to: string, lang: 'en' | 'ar', body: string): Promise<Outcome> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to, subject: TEXT[lang].title, text: body }),
  })
  return res.ok ? { channel: 'email', status: 'sent' } : { channel: 'email', status: 'failed', error: `email_${res.status}` }
}

async function deliver(admin: SupabaseClient, due: Due[]) {
  const ch = channels()
  const byOwner = new Map<string, Due[]>()
  for (const d of due) byOwner.set(d.owner_id, [...(byOwner.get(d.owner_id) ?? []), d])
  let sentCount = 0

  for (const [ownerId, items] of byOwner) {
    const [{ data: prefs }, { data: profile }] = await Promise.all([
      admin.from('notification_preferences').select('push_enabled, email_enabled, whatsapp_enabled, whatsapp_number').eq('user_id', ownerId).maybeSingle(),
      admin.from('health_profiles').select('ui_language').eq('owner_id', ownerId).eq('relationship', 'self').eq('is_demo', false).maybeSingle(),
    ])
    const lang: 'en' | 'ar' = profile?.ui_language === 'ar' ? 'ar' : 'en'
    // Family members' items get wording that doesn't say "your"; still no health details.
    const { data: people } = await admin.from('health_profiles').select('id, relationship').eq('owner_id', ownerId)
    const isFamily = new Set((people ?? []).filter((p) => p.relationship !== 'self').map((p) => p.id))
    const reminderIds = items.filter((i) => i.kind === 'reminder').map((i) => i.item_id)
    const { data: kinds } = reminderIds.length
      ? await admin.from('reminders').select('id, kind, appointment_id').in('id', reminderIds)
      : { data: [] as { id: string; kind: string; appointment_id: string | null }[] }
    const kindOf = new Map((kinds ?? []).map((k) => [k.id, k.kind]))
    const visitOf = new Map((kinds ?? []).map((k) => [k.id, k.appointment_id]))
    let email: string | null = null

    for (const item of items) {
      const rk = kindOf.get(item.item_id)
      const body = item.kind === 'dose' ? (isFamily.has(item.profile_id) ? TEXT[lang].familyDose : TEXT[lang].dose)
        : rk === 'vital_check' ? TEXT[lang].vital
        : rk === 'weekly_summary' ? TEXT[lang].summary
        : rk === 'visit_prep' ? TEXT[lang].visitPrep
        : rk === 'visit_followup' ? TEXT[lang].visitFollowup
        : TEXT[lang].reminder
      const visit = visitOf.get(item.item_id)
      const url = item.kind === 'dose' || rk === 'weekly_summary' ? '/' : rk === 'vital_check' ? '/vitals'
        : (rk === 'visit_prep' || rk === 'visit_followup') && visit ? `/visits/${visit}` : '/reminders'
      const outcomes: Outcome[] = []
      const push = prefs?.push_enabled !== false
        ? await sendPush(admin, ownerId, { title: TEXT[lang].title, body, tag: item.item_id, url, ...(item.kind === 'dose' ? await doseButtons(item.item_id, lang) : {}) })
        : null
      if (push) outcomes.push(push)
      const pushed = push?.status === 'sent'

      if (!pushed && ch.whatsapp && prefs?.whatsapp_enabled && prefs.whatsapp_number) outcomes.push(await sendWhatsApp(prefs.whatsapp_number, lang))
      const anySent = outcomes.some((o) => o.status === 'sent')
      if (!anySent && item.kind === 'reminder' && ch.email && prefs?.email_enabled !== false) {
        if (email === null) email = (await admin.auth.admin.getUserById(ownerId)).data.user?.email ?? ''
        if (email) outcomes.push(await sendEmail(email, lang, body))
      }
      if (outcomes.length === 0) outcomes.push({ channel: 'in_app', status: 'failed', error: 'no_channel_available' })

      await admin.from('reminder_deliveries').insert(outcomes.map((o) => ({
        profile_id: item.profile_id,
        reminder_id: item.kind === 'reminder' ? item.item_id : null,
        dose_log_id: item.kind === 'dose' ? item.item_id : null,
        channel: o.channel,
        status: o.status,
        error: o.error ?? null,
      })))
      if (item.kind === 'dose') await admin.from('medication_dose_logs').update({ notified_at: new Date().toISOString() }).eq('id', item.item_id)
      else await admin.from('reminders').update({ last_notified_at: new Date().toISOString() }).eq('id', item.item_id)
      if (outcomes.some((o) => o.status === 'sent')) sentCount++
    }
  }
  return sentCount
}

/** One gentle follow-up (phone notification only) for doses still not logged. */
async function sendFollowups(admin: SupabaseClient) {
  const { data } = await admin.rpc('due_followups', { p_limit: 200 })
  let sent = 0
  for (const d of (data ?? []) as { item_id: string; profile_id: string; owner_id: string }[]) {
    // Mark first so a slow run can never send it twice.
    const { data: claimed } = await admin.from('medication_dose_logs').update({ followup_sent_at: new Date().toISOString() })
      .eq('id', d.item_id).is('followup_sent_at', null).eq('status', 'pending').select('id')
    if (!claimed?.length) continue
    const [{ data: profile }, { data: person }] = await Promise.all([
      admin.from('health_profiles').select('ui_language').eq('owner_id', d.owner_id).eq('relationship', 'self').eq('is_demo', false).maybeSingle(),
      admin.from('health_profiles').select('relationship').eq('id', d.profile_id).maybeSingle(),
    ])
    const lang: 'en' | 'ar' = profile?.ui_language === 'ar' ? 'ar' : 'en'
    const body = person?.relationship && person.relationship !== 'self' ? TEXT[lang].familyFollowup : TEXT[lang].followup
    const o = await sendPush(admin, d.owner_id, { title: TEXT[lang].title, body, tag: d.item_id, url: '/', ...(await doseButtons(d.item_id, lang)) })
    if (!o) continue
    await admin.from('reminder_deliveries').insert({ profile_id: d.profile_id, dose_log_id: d.item_id, channel: o.channel, status: o.status, error: o.error ?? null })
    if (o.status === 'sent') {
      sent++
      await admin.rpc('track_server_event', { p_event: 'push_followup_sent' })
    }
  }
  return sent
}

/** Missed-dose alerts for helpers who asked for them (records shared with alerts on). */
async function sendHelperAlerts(admin: SupabaseClient) {
  const { data } = await admin.rpc('due_helper_alerts', { p_limit: 200 })
  let sent = 0
  const claimed = new Set<string>()
  for (const d of (data ?? []) as { item_id: string; profile_id: string; helper_id: string }[]) {
    // One alert per dose, however many helpers: mark it first so a slow run never repeats it.
    if (!claimed.has(d.item_id)) {
      const { data: ok } = await admin.from('medication_dose_logs').update({ helper_alerted_at: new Date().toISOString() })
        .eq('id', d.item_id).is('helper_alerted_at', null).select('id')
      if (!ok?.length) continue
      claimed.add(d.item_id)
    }
    const { data: helper } = await admin.from('health_profiles').select('ui_language').eq('owner_id', d.helper_id).eq('relationship', 'self').eq('is_demo', false).maybeSingle()
    const lang: 'en' | 'ar' = helper?.ui_language === 'ar' ? 'ar' : 'en'
    const o = await sendPush(admin, d.helper_id, { title: TEXT[lang].title, body: TEXT[lang].helperAlert, tag: `alert-${d.item_id}`, url: '/family' })
    if (o?.status === 'sent') sent++
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method === 'GET') return json(200, channels())
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  if (channels().push) webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:support@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  if (body.action === 'dose') return handleDoseAction(admin, body)
  if (body.action === 'test') return handleTest(admin, req)

  const secret = env('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json(401, { error: 'unauthorized' })
  const { data, error } = await admin.rpc('due_notifications', { p_limit: 200 })
  if (error) {
    console.error(JSON.stringify({ event: 'due_query_failed', code: error.code }))
    return json(500, { error: 'due_query_failed' })
  }
  const sent = await deliver(admin, (data ?? []) as Due[])
  const followups = channels().push ? await sendFollowups(admin) : 0
  const helperAlerts = channels().push ? await sendHelperAlerts(admin) : 0
  console.log(JSON.stringify({ event: 'reminders_run', due: (data ?? []).length, sent, followups, helperAlerts }))
  return json(200, { due: (data ?? []).length, sent, followups, helperAlerts })
})

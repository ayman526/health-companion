// send-reminders: delivers due medication doses and reminders (SPEC.md §9).
//
// POST (from pg_cron, header x-cron-secret): sends what is due.
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
  en: { title: 'Health Journal', dose: 'It\'s time for your medicine. Open the app to log it.', reminder: 'You have a reminder. Open the app to see it.' },
  ar: { title: 'سجلك الصحي', dose: 'حان موعد دوائك. افتح التطبيق لتسجيله.', reminder: 'لديك تذكير. افتح التطبيق لمعرفته.' },
}

type Due = { kind: 'dose' | 'reminder'; item_id: string; profile_id: string; owner_id: string; due_at: string }
type Outcome = { channel: 'push' | 'email' | 'whatsapp' | 'in_app'; status: 'sent' | 'failed'; error?: string }

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
      admin.from('health_profiles').select('ui_language').eq('owner_id', ownerId).eq('is_demo', false).maybeSingle(),
    ])
    const lang: 'en' | 'ar' = profile?.ui_language === 'ar' ? 'ar' : 'en'
    let email: string | null = null

    for (const item of items) {
      const body = item.kind === 'dose' ? TEXT[lang].dose : TEXT[lang].reminder
      const outcomes: Outcome[] = []
      const push = prefs?.push_enabled !== false
        ? await sendPush(admin, ownerId, { title: TEXT[lang].title, body, tag: item.item_id, url: item.kind === 'dose' ? '/' : '/reminders' })
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method === 'GET') return json(200, channels())
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const secret = env('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json(401, { error: 'unauthorized' })

  if (channels().push) webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:support@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('due_notifications', { p_limit: 200 })
  if (error) {
    console.error(JSON.stringify({ event: 'due_query_failed', code: error.code }))
    return json(500, { error: 'due_query_failed' })
  }
  const sent = await deliver(admin, (data ?? []) as Due[])
  console.log(JSON.stringify({ event: 'reminders_run', due: (data ?? []).length, sent }))
  return json(200, { due: (data ?? []).length, sent })
})

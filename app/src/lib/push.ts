import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState =
  | 'unsupported' // this browser can't receive web push
  | 'needs_install' // iPhone/iPad: only works after "Add to Home Screen"
  | 'not_configured' // the app has no push key yet
  | 'denied' // the user blocked notifications in the browser
  | 'off'
  | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'needs_install' : 'unsupported'
  }
  if (!VAPID_PUBLIC_KEY) return 'not_configured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/** Asks permission, subscribes this device and stores the subscription. */
export async function enablePush(userId: string): Promise<PushState> {
  if (!supabase || !VAPID_PUBLIC_KEY) return 'not_configured'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready)
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.from('notification_subscriptions').upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  )
  if (error) return 'off'
  await supabase.from('notification_preferences').upsert({ user_id: userId, push_enabled: true, updated_at: new Date().toISOString() })
  return 'on'
}

export async function disablePush(userId: string): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase?.from('notification_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  await supabase?.from('notification_preferences').upsert({ user_id: userId, push_enabled: false, updated_at: new Date().toISOString() })
  return 'off'
}

/** Which delivery channels the server has credentials for (no secrets returned). */
export async function deliveryChannels(): Promise<{ push: boolean; email: boolean; whatsapp: boolean } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('send-reminders', { method: 'GET' })
  return error ? null : (data as { push: boolean; email: boolean; whatsapp: boolean })
}

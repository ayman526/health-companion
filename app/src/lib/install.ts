import { useSyncExternalStore } from 'react'

// Installing the app on the home screen. On iPhone this is required for
// reminders (web push only works for home-screen apps); elsewhere it just
// makes the app one tap away. Android/desktop Chrome offer an install prompt
// we can trigger; iPhone needs the Share > Add to Home Screen steps.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'hc.installDismissedAt'
const SNOOZE_DAYS = 14
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own, calmer prompt
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export type InstallMode = 'installed' | 'ios' | 'prompt' | 'none'

function mode(): InstallMode {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  if (ios) return 'ios'
  return deferred ? 'prompt' : 'none'
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, mode)
}

/** Shows the browser's own install dialog (Android / desktop Chrome). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}

export function installSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    return Date.now() - at < SNOOZE_DAYS * 86_400_000
  } catch {
    return false
  }
}

export function snoozeInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // Non-critical.
  }
}

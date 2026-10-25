import { useSyncExternalStore } from 'react'

// Light or dark colours. "system" follows the phone's setting and changes
// with it. index.html applies the saved choice before the first paint so the
// screen never flashes the wrong colours.

export type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'hc.theme'
const BAR_COLOR = { light: '#0b4f5c', dark: '#0f1416' }
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function read(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref = read()

function apply() {
  const mode = pref === 'system' ? (media.matches ? 'dark' : 'light') : pref
  document.documentElement.dataset.theme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[mode])
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Non-critical: the choice just won't persist on this device.
  }
  apply()
  listeners.forEach((l) => l())
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pref,
  )
}

/** Call once at startup: applies the choice and follows the phone's setting when "system". */
export function initTheme() {
  apply()
  media.addEventListener('change', () => {
    if (pref === 'system') apply()
  })
}

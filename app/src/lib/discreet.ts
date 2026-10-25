import { useSyncExternalStore } from 'react'

// Discreet mode blurs health details (values, medicine names, advisor text)
// for use in public. Anything marked with the `sensitive` class is blurred;
// tapping one shows it for a few seconds. Remembered on this device only.

const STORAGE_KEY = 'hc.discreet'
const PEEK_MS = 5000
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let on = read()

function apply() {
  if (on) document.documentElement.dataset.discreet = ''
  else delete document.documentElement.dataset.discreet
}

export function setDiscreet(next: boolean) {
  on = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // Non-critical: the choice just won't persist on this device.
  }
  apply()
  listeners.forEach((l) => l())
}

export function useDiscreet(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => on,
  )
}

/** Call once at startup: applies the saved setting and handles tap-to-peek. */
export function initDiscreet() {
  apply()
  // Capture phase, so the first tap on a blurred link only reveals it.
  document.addEventListener('click', (e) => {
    if (!on) return
    const el = (e.target as Element | null)?.closest?.('.sensitive:not(.revealed)')
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    el.classList.add('revealed')
    window.setTimeout(() => el.classList.remove('revealed'), PEEK_MS)
  }, true)
}

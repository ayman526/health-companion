// The person whose records the app is showing (yourself or a family member).
// Sent with every database request as the x-profile-id header; the database's
// security rules then only return that person's rows (migration 20261025000000).

const STORAGE_KEY = 'hc.profile'

let active: string | null = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
})()
let override: string | null = null

export function activeProfileId(): string | null {
  return override ?? active
}

export function setActiveProfileId(id: string | null) {
  active = id
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Non-critical: the app falls back to your own profile next time.
  }
}

/** Runs `fn` with another person selected, e.g. to export everyone's data. */
export async function withProfile<T>(id: string, fn: () => Promise<T>): Promise<T> {
  override = id
  try {
    return await fn()
  } finally {
    override = null
  }
}

/** fetch for the Supabase client: adds the selected person to database requests. */
export const profileFetch: typeof fetch = (input, init) => {
  const id = activeProfileId()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!id || !url.includes('/rest/v1/')) return fetch(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('x-profile-id', id)
  return fetch(input, { ...init, headers })
}

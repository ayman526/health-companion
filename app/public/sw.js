// Service worker: shows reminder notifications and opens the app when tapped.
// Dose notifications carry "Taken" / "In 30 min" buttons (shown where the
// phone supports them, e.g. Android); a button posts a signed request for that
// one dose back to the server. It does not cache health data.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const ICON = '/icons/icon-192.png'

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Health Journal', {
      body: data.body || '',
      icon: ICON,
      badge: ICON,
      tag: data.tag,
      renotify: !!data.tag,
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
      data: { url: data.url || '/', title: data.title, request: data.action_request || null, done: data.done || null },
    }),
  )
})

function openApp(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if ('focus' in w) {
        w.navigate(url)
        return w.focus()
      }
    }
    return self.clients.openWindow(url)
  })
}

async function doseAction(n, action) {
  const { request, done, url, title } = n.data
  try {
    const res = await fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dose', status: action, dose: request.dose, exp: request.exp, sig: request.sig }),
    })
    if (!res.ok) throw new Error(String(res.status))
    // A short, quiet confirmation that closes itself.
    const tag = `${n.tag || 'dose'}-done`
    await self.registration.showNotification(title || 'Health Journal', { body: done[action], icon: ICON, badge: ICON, tag, silent: true, data: { url } })
    await new Promise((r) => setTimeout(r, 4000))
    for (const c of await self.registration.getNotifications({ tag })) c.close()
  } catch {
    // Offline or the link expired: open the app so it can be logged there.
    await openApp(url)
  }
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification
  n.close()
  const url = (n.data && n.data.url) || '/'
  if ((event.action === 'taken' || event.action === 'snooze') && n.data && n.data.request && n.data.done) {
    event.waitUntil(doseAction(n, event.action))
    return
  }
  event.waitUntil(openApp(url))
})

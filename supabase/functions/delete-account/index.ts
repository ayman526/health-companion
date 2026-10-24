// delete-account: permanently deletes the signed-in user's account.
// Removes their files from storage, then the auth user; the database cascades
// from the auth user to the health profile and every record.
//
// POST { confirm: true } with the user's JWT.

import { createClient } from 'npm:@supabase/supabase-js@2.50.0'

const BUCKET = 'medical-documents'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Admin = ReturnType<typeof createClient>

/** Every object path under a folder (storage lists one level at a time). */
async function listAll(admin: Admin, prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`
      if (item.id) paths.push(path)
      else paths.push(...(await listAll(admin, path)))
    }
    if ((data ?? []).length < 1000) return paths
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth?.user) return json(401, { error: 'unauthorized' })

  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== true) return json(400, { error: 'confirmation_required' })

  const userId = auth.user.id
  const { data: profiles, error } = await admin.from('health_profiles').select('id').eq('owner_id', userId)
  if (error) return json(500, { error: 'delete_failed' })

  // Files first: Supabase refuses to delete a user who still owns storage
  // objects. If a later step fails the person is still signed up and can retry,
  // which finishes the job.
  try {
    for (const { id } of profiles ?? []) {
      const paths = await listAll(admin, id)
      for (let i = 0; i < paths.length; i += 100) {
        const { error: removeError } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100))
        if (removeError) throw removeError
      }
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError
  } catch (e) {
    // No health details in logs: only that it failed and why.
    console.error(JSON.stringify({ event: 'account_delete_failed', message: e instanceof Error ? e.message : String(e) }))
    return json(500, { error: 'delete_failed' })
  }
  console.log(JSON.stringify({ event: 'account_deleted' }))
  return json(200, { deleted: true })
})

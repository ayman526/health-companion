import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { profileFetch } from './activeProfile'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null until the project is configured (see SETUP.md). The UI shows a setup notice instead of failing. */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
        global: { fetch: profileFetch },
      })
    : null

export const isSupabaseConfigured = supabase !== null

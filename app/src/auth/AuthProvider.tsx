import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface HealthProfile {
  id: string
  display_name: string | null
  country: 'EG' | 'US'
  ui_language: 'en' | 'ar'
  explanation_language: 'en' | 'ar'
  time_zone: string
  onboarding_completed_at: string | null
  onboarding_step: number
}

interface AuthState {
  loading: boolean
  session: Session | null
  profile: HealthProfile | null
  profileError: string | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<HealthProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('health_profiles')
      .select('id, display_name, country, ui_language, explanation_language, time_zone, onboarding_completed_at, onboarding_step')
      .eq('is_demo', false)
      .maybeSingle()
    setProfileError(error ? error.message : null)
    setProfile((data as HealthProfile | null) ?? null)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Deferred: Supabase advises against awaiting queries inside this callback.
      setTimeout(() => void loadProfile(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value: AuthState = {
    loading,
    session,
    profile,
    profileError,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase?.auth.signOut()
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

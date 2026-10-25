import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { activeProfileId, setActiveProfileId } from '../lib/activeProfile'

export type Relationship = 'self' | 'parent' | 'spouse' | 'child' | 'sibling' | 'grandparent' | 'other'

export interface HealthProfile {
  id: string
  relationship: Relationship
  display_name: string | null
  date_of_birth: string | null
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
  /** The person whose records are shown: yourself or a family member. */
  profile: HealthProfile | null
  /** Your own profile (the account holder). */
  self: HealthProfile | null
  /** Everyone this account keeps records for, yourself first. */
  profiles: HealthProfile[]
  profileError: string | null
  switchProfile: (id: string) => void
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const SELECT = 'id, relationship, display_name, date_of_birth, country, ui_language, explanation_language, time_zone, onboarding_completed_at, onboarding_step'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profiles, setProfiles] = useState<HealthProfile[]>([])
  const [activeId, setActiveId] = useState<string | null>(activeProfileId())
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setProfiles([])
      return
    }
    const { data, error } = await supabase
      .from('health_profiles')
      .select(SELECT)
      .eq('is_demo', false)
      .order('created_at')
    setProfileError(error ? error.message : null)
    const list = ((data ?? []) as HealthProfile[]).sort((a, b) => Number(b.relationship === 'self') - Number(a.relationship === 'self'))
    // Keep the selected person if they still exist; otherwise show your own records.
    const stored = activeProfileId()
    const next = list.find((p) => p.id === stored)?.id ?? list.find((p) => p.relationship === 'self')?.id ?? null
    setActiveProfileId(next)
    setActiveId(next)
    setProfiles(list)
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
    profile: profiles.find((p) => p.id === activeId) ?? null,
    self: profiles.find((p) => p.relationship === 'self') ?? null,
    profiles,
    profileError,
    switchProfile: (id) => {
      setActiveProfileId(id)
      setActiveId(id)
    },
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      setActiveProfileId(null)
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

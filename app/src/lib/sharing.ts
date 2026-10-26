import { supabase } from './supabase'

// Sharing records between accounts (see migration 20261027010000_profile_sharing).
// Every action goes through a database function that checks who may do it.

export type ShareKind = 'invite' | 'request' | 'transfer'
export type ShareAccess = 'view' | 'help'

export interface Share {
  id: string
  kind: ShareKind
  status: 'pending' | 'active'
  /** given: you share (or sent a hand-over); received: shared with you / addressed to you; sent: your request. */
  direction: 'given' | 'received' | 'sent'
  access: ShareAccess
  alerts: boolean
  keep_access: ShareAccess | null
  expires_at: string | null
  created_at: string
  profile_id: string | null
  profile_name: string
  owner_name: string
  owner_email: string | null
  grantee_email: string | null
  grantee_name: string
}

export async function loadShares(): Promise<Share[]> {
  if (!supabase) return []
  const { data } = await supabase.rpc('my_shares')
  return (data as Share[] | null) ?? []
}

/** Things waiting for your answer: invites and hand-overs to you, requests for your records. */
export const pendingForMe = (shares: Share[]) => shares.filter((s) => s.status === 'pending' && s.direction === 'received')

const call = async (fn: string, args: Record<string, unknown>): Promise<string | true> => {
  if (!supabase) return 'no_backend'
  const { error } = await supabase.rpc(fn, args)
  if (!error) return true
  if (/already has records/.test(error.message)) return 'has_records'
  if (/invalid email|yourself/.test(error.message)) return 'invalid_email'
  if (/too many/.test(error.message)) return 'too_many'
  return 'failed'
}

export const inviteToShare = (profileId: string, email: string, access: ShareAccess, alerts: boolean, days: number | null) =>
  call('share_invite', { p_profile_id: profileId, p_email: email, p_access: access, p_alerts: alerts, p_days: days })
export const requestAccess = (email: string) => call('share_request', { p_email: email })
export const handOver = (profileId: string, email: string, keep: ShareAccess | null) =>
  call('share_transfer', { p_profile_id: profileId, p_email: email, p_keep_access: keep })
export const respond = (id: string, accept: boolean, opts: { profileId?: string; access?: ShareAccess; alerts?: boolean; keep?: boolean } = {}) =>
  call('share_respond', { p_share_id: id, p_accept: accept, p_profile_id: opts.profileId ?? null, p_access: opts.access ?? null, p_alerts: opts.alerts ?? null, p_keep: opts.keep ?? true })
export const updateShare = (id: string, access: ShareAccess, alerts: boolean) => call('share_update', { p_share_id: id, p_access: access, p_alerts: alerts })
export const revokeShare = (id: string) => call('share_revoke', { p_share_id: id })

export interface ShareActivity { at: string; action: 'viewed' | 'insert' | 'update' | 'delete'; what: string; who: string }
export async function loadActivity(profileId: string): Promise<ShareActivity[]> {
  if (!supabase) return []
  const { data } = await supabase.rpc('share_activity', { p_profile_id: profileId })
  return (data as ShareActivity[] | null) ?? []
}

/** Lets the owner see when a helper opened their records (once a day). */
export function logSharedView(profileId: string) {
  if (supabase) void supabase.rpc('log_shared_view', { p_profile_id: profileId })
}

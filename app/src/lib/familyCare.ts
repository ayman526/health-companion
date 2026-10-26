import { supabase } from './supabase'
import { track } from './usage'

// Family Care interest test. Nobody is charged: "Join early access" adds the
// account to plan_interest so the team can contact them at launch.

export type OfferMoment = 'second_person' | 'scans' | 'missed_dose' | 'visit'
export type InterestPlan = 'family_annual' | 'family_monthly' | 'scan_pack'
export type InterestSource = OfferMoment | 'page' | 'settings'

/** Prices shown in the test, by country (Egypt in EGP, USA in USD). */
export const PRICES = {
  EG: { monthly: '149 ج.م', annual: '1,190 ج.م', annualPerMonth: '99 ج.م', pack: '49 ج.م', monthlyEn: 'EGP 149', annualEn: 'EGP 1,190', annualPerMonthEn: 'EGP 99', packEn: 'EGP 49' },
  US: { monthly: '7.99$', annual: '59$', annualPerMonth: '4.92$', pack: '2.99$', monthlyEn: '$7.99', annualEn: '$59', annualPerMonthEn: '$4.92', packEn: '$2.99' },
} as const
export function price(country: 'EG' | 'US', lang: string, key: 'monthly' | 'annual' | 'annualPerMonth' | 'pack') {
  const p = PRICES[country] ?? PRICES.EG
  return lang === 'ar' ? p[key] : p[`${key}En` as const]
}

const JOINED_KEY = 'hc.familyCareJoined'
export function joinedLocally() {
  try {
    return localStorage.getItem(JOINED_KEY) === '1'
  } catch {
    return false
  }
}

export async function joinedPlans(): Promise<InterestPlan[]> {
  if (!supabase) return []
  const { data } = await supabase.from('plan_interest').select('plan')
  return (data ?? []).map((r) => r.plan as InterestPlan)
}

export async function joinInterest(userId: string, plan: InterestPlan, source: InterestSource, country: 'EG' | 'US'): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('plan_interest').upsert({ user_id: userId, plan, source, country })
  if (error) return false
  track(plan === 'scan_pack' ? 'scan_pack_interest' : plan === 'family_annual' ? 'family_care_join_annual' : 'family_care_join_monthly')
  if (plan !== 'scan_pack') {
    try {
      localStorage.setItem(JOINED_KEY, '1')
    } catch {
      // private mode: offers may show again; the server list is what counts
    }
  }
  return true
}

const DISMISS_DAYS = 30
const dismissKey = (m: OfferMoment) => `hc.offerDismissed.${m}`
export function offerHidden(m: OfferMoment) {
  if (joinedLocally()) return true
  try {
    const at = Number(localStorage.getItem(dismissKey(m)))
    return !!at && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}
export function dismissOffer(m: OfferMoment) {
  try {
    localStorage.setItem(dismissKey(m), String(Date.now()))
  } catch {
    // private mode: it shows again next time
  }
  track('offer_dismissed')
}

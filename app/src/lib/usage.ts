import { supabase } from './supabase'

// Anonymous usage counts: only "this feature was used", per day - no user, no
// health data. Lets us see what people actually use before building more.
export type UsageEvent =
  | 'card_shown' | 'card_source_opened' | 'card_helpful' | 'card_not_relevant'
  | 'install_prompt_shown' | 'install_prompt_done' | 'install_prompt_dismissed'
  | 'voice_started' | 'voice_saved' | 'voice_failed'
  | 'visit_added' | 'visit_prep_opened' | 'visit_followup_done'
  | 'summary_printed' | 'summary_shared' | 'checkup_accepted' | 'checkup_done'
  | 'reading_logged' | 'reading_photo_used' | 'checkin_saved' | 'advisor_asked' | 'report_scanned'
  | 'push_prompt_shown' | 'push_prompt_enabled' | 'push_prompt_dismissed' | 'push_test_sent'
  | 'onboarding_done' | 'first_action_report' | 'first_action_prescription' | 'first_action_medicine' | 'first_action_reading' | 'first_action_explore'
  | 'profile_nudge_shown' | 'profile_nudge_opened' | 'profile_nudge_dismissed'
  | 'family_care_viewed' | 'family_care_join_annual' | 'family_care_join_monthly' | 'scan_pack_interest' | 'offer_dismissed'
  | `offer_shown_${'second_person' | 'scans' | 'missed_dose' | 'visit'}` | `offer_opened_${'second_person' | 'scans' | 'missed_dose' | 'visit'}`

export function track(event: UsageEvent) {
  // Fire and forget: counting must never slow down or break the app.
  void supabase?.rpc('track_event', { p_event: event }).then(() => undefined, () => undefined)
}

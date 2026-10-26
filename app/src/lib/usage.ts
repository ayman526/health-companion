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

export function track(event: UsageEvent) {
  // Fire and forget: counting must never slow down or break the app.
  void supabase?.rpc('track_event', { p_event: event }).then(() => undefined, () => undefined)
}

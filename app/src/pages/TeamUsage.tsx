import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/ui'

// Team-only usage dashboard (English only: it is for the team, not users).
// Data comes from usage_dashboard(), which returns counts and percentages
// only and refuses anyone not in team_members.

interface Dashboard {
  days: number
  signed_in: number
  started: number
  onboarded: number
  first_record_1d: number
  first_record_any: number
  came_back_eligible: number
  came_back: number
  all_accounts: number
  events: { event: string; total: number }[]
  daily: { day: string; total: number }[]
  cards: { title: string; helpful: number; not_relevant: number }[]
}

const GROUPS: { title: string; events: [string, string][] }[] = [
  { title: 'First action after sign-up', events: [
    ['first_action_report', 'Scan a lab report'], ['first_action_prescription', 'Scan a prescription or box'],
    ['first_action_medicine', 'Add a medicine'], ['first_action_reading', 'Log a reading'], ['first_action_explore', 'Look around first'],
  ] },
  { title: 'Core features', events: [
    ['report_scanned', 'Reports scanned'], ['advisor_asked', 'Advisor questions'], ['reading_logged', 'Readings logged'],
    ['reading_photo_used', 'Readings from a photo'], ['checkin_saved', 'Daily check-ins'], ['voice_saved', 'Voice logs saved'],
    ['summary_printed', 'Visit summaries printed'], ['summary_shared', 'Visit summaries shared'], ['visit_added', 'Doctor visits added'],
    ['checkup_accepted', 'Checkups accepted'], ['checkup_done', 'Checkups done'],
  ] },
  { title: 'Notifications', events: [
    ['push_prompt_shown', 'Prompt shown'], ['push_prompt_enabled', 'Turned on from prompt'], ['push_prompt_dismissed', 'Prompt dismissed'],
    ['push_test_sent', 'Test notifications'], ['push_action_taken', '"Taken" tapped on a notification'],
    ['push_action_snoozed', '"In 30 min" tapped'], ['push_followup_sent', 'Follow-ups sent'],
  ] },
  { title: 'Reading cards', events: [
    ['card_shown', 'Cards shown'], ['card_source_opened', 'Source opened'], ['card_helpful', 'Helpful'], ['card_not_relevant', 'Not relevant'],
  ] },
  { title: 'Profile and install', events: [
    ['profile_nudge_shown', 'Profile card shown'], ['profile_nudge_opened', 'Profile card opened'], ['profile_nudge_dismissed', 'Profile card dismissed'],
    ['install_prompt_shown', 'Add to Home Screen shown'], ['install_prompt_done', 'Installed'], ['install_prompt_dismissed', 'Install dismissed'],
  ] },
]

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '–')

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  )
}

/** Horizontal magnitude bar, one hue; the number sits beside it in text colour. */
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5 text-sm">
      <span className="truncate">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
      <span className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${value > 0 && max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </span>
    </li>
  )
}

export function TeamUsagePage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Dashboard | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!supabase) return
    setData(null)
    void supabase.rpc('usage_dashboard', { p_days: days }).then(({ data: d, error }) => {
      if (error) setDenied(true)
      else setData(d as Dashboard)
    })
  }, [days])

  if (denied) return <p className="rounded-2xl border border-line bg-surface p-4 text-sm">This page is for the Health Journal team.</p>

  const total = (e: string) => data?.events.find((x) => x.event === e)?.total ?? 0
  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((d) => d.total))

  return (
    <div dir="ltr" className="flex flex-col gap-4 pb-8 text-start">
      <PageHeader title="Usage" subtitle="Team only. Counts only: no names, emails or health data." />

      <div className="flex gap-2" role="group" aria-label="Period">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
            className={`min-h-10 rounded-full px-4 text-sm font-medium ${days === d ? 'bg-brand-700 text-white' : 'border border-line bg-surface'}`}>
            {d} days
          </button>
        ))}
      </div>

      {!data ? <p className="text-sm text-muted">Loading…</p> : (
        <>
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold">New people, last {data.days} days</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Signed in" value={data.signed_in} note="got the email and opened it" />
              <Tile label="Agreed and started" value={data.started} note={`${pct(data.started, data.signed_in)} of signed in`} />
              <Tile label="Finished onboarding" value={pct(data.onboarded, data.started)} note={`${data.onboarded} of ${data.started}`} />
              <Tile label="First record within a day" value={pct(data.first_record_1d, data.started)} note={`${data.first_record_1d} of ${data.started} · any time: ${data.first_record_any}`} />
              <Tile label="Came back on days 2–7" value={pct(data.came_back, data.came_back_eligible)} note={`${data.came_back} of ${data.came_back_eligible} who started 7+ days ago`} />
              <Tile label="All accounts" value={data.all_accounts} />
              <Tile label="Advisor questions" value={total('advisor_asked')} />
              <Tile label="Reports scanned" value={total('report_scanned')} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Activity per day</h2>
            <p className="mb-3 text-xs text-muted">All counted events. Hover or tap a bar for the day.</p>
            {data.daily.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
              <div className="flex h-32 items-end gap-0.5" role="img" aria-label="Events per day">
                {data.daily.map((d) => (
                  <span key={d.day} title={`${d.day}: ${d.total}`} className="group relative flex h-full min-w-0 flex-1 items-end">
                    <span className="block w-full rounded-t bg-brand-600 group-hover:bg-brand-700" style={{ height: `${Math.max(3, (d.total / maxDaily) * 100)}%` }} />
                  </span>
                ))}
              </div>
            )}
          </section>

          {GROUPS.map((g) => {
            const rows = g.events.map(([e, label]) => ({ label, value: total(e) }))
            const max = Math.max(1, ...rows.map((r) => r.value))
            return (
              <section key={g.title} className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="mb-1 font-semibold">{g.title}</h2>
                <ul>{rows.map((r) => <Bar key={r.label} label={r.label} value={r.value} max={max} />)}</ul>
              </section>
            )
          })}

          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-2 font-semibold">Reading cards people reacted to</h2>
            {data.cards.length === 0 ? <p className="text-sm text-muted">No reactions yet.</p> : (
              <table className="w-full table-fixed text-sm">
                <thead><tr className="text-xs text-muted"><th className="w-[60%] py-1 text-start font-medium">Card</th><th className="py-1 text-end font-medium">Helpful</th><th className="py-1 text-end font-medium">Not relevant</th></tr></thead>
                <tbody>
                  {data.cards.map((c) => (
                    <tr key={c.title} className="border-t border-line"><td className="truncate py-2">{c.title}</td><td className="py-2 text-end tabular-nums">{c.helpful}</td><td className="py-2 text-end tabular-nums">{c.not_relevant}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}

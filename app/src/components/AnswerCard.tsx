import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, FileText, LineChart, Pill, Stethoscope, ThumbsDown, ThumbsUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { sendFeedback, type ChatMessage, type Citation } from '../lib/advisor'
import { SourceChip } from './TrustChips'
import { ContextCard } from './ContextCard'
import { labTags, medicationTags } from '../domain/libraryTags'
import { getTest } from '../domain/labs/catalog'

/** Best-guess category for a life change mentioned in chat; the user can edit it on the Life changes page. */
function guessLifestyleCategory(text: string): string {
  const t = text.toLowerCase()
  if (/gym|run|walk|swim|cycl|exercis|sport|رياض|جيم|جري|مشي|سباح/.test(t)) return 'exercise'
  if (/diet|sugar|carb|fast|salt|vegetar|eat|food|رجيم|ريجيم|سكر|نشويات|صيام|ملح|اكل|أكل|نظام غذائي/.test(t)) return 'diet'
  if (/smok|cigar|shisha|تدخين|سجائر|شيشة/.test(t)) return 'smoking'
  if (/alcohol|drink|كحول/.test(t)) return 'alcohol'
  if (/sleep|نوم/.test(t)) return 'sleep'
  if (/weight|kg|وزن/.test(t)) return 'weight'
  if (/stress|توتر|ضغط نفسي/.test(t)) return 'stress'
  return 'other'
}

const SEE_DOCTOR_STYLE = {
  not_needed: 'bg-canvas text-muted',
  routine: 'bg-status-info-bg text-status-info',
  soon: 'bg-status-watch-bg text-status-watch',
  urgent: 'bg-status-urgent-bg text-status-urgent',
} as const

function citationLink(c: Citation): string | null {
  if (c.kind === 'test' && c.target) return `/records/tests/${encodeURIComponent(c.target)}`
  if (c.kind === 'report' && c.target) return `/records/reports/${c.target}`
  if (c.kind === 'medication' && c.target) return `/medications/${c.target}`
  return null
}

function CitationChip({ c }: { c: Citation }) {
  const Icon = c.kind === 'medication' ? Pill : c.kind === 'report' ? FileText : LineChart
  const to = citationLink(c)
  const body = (
    <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-xs font-medium text-brand-700">
      <Icon className="size-3.5" aria-hidden /> {c.label ?? c.id}
    </span>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

/** Topics of the records an answer cites: its tests and medicines. */
function answerTopics(citations: { kind?: string; target?: string; label?: string }[]): string[] {
  const out = new Set<string>()
  for (const c of citations) {
    const test = c.kind === 'test' && c.target ? getTest(c.target) : undefined
    if (test) labTags(test, 'high').concat(labTags(test, 'low')).forEach((x) => out.add(x))
    if (c.kind === 'medication' && c.label) medicationTags([{ name: c.label, ingredient: null, active: true }]).forEach((x) => out.add(x))
  }
  return [...out]
}

export function AnswerCard({ message, profileId }: { message: ChatMessage; profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [factsDone, setFactsDone] = useState<Set<number>>(new Set())
  const a = message.answer
  if (!a) return <p className="sensitive text-sm">{message.text}</p>
  const byId = new Map((message.citations ?? []).map((c) => [c.id, c]))
  const flags = message.safety_flags ?? []
  const dir = a.language === 'ar' ? 'rtl' : 'ltr'

  async function addFact(i: number) {
    const f = a!.proposed_facts[i]
    if (f.kind === 'medication') {
      navigate('/medications/new', { state: null })
      return
    }
    if (!supabase) return
    if (f.kind === 'lifestyle') {
      const { error } = await supabase.from('lifestyle_events').insert({
        profile_id: profileId, category: guessLifestyleCategory(f.text), title: f.text.slice(0, 200),
        started_on: /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : new Date().toISOString().slice(0, 10),
      })
      if (!error) setFactsDone((s) => new Set(s).add(i))
      return
    }
    const table = f.kind === 'condition' ? 'medical_conditions' : f.kind === 'allergy' ? 'allergies' : 'symptoms'
    const row = f.kind === 'condition' ? { name: f.text, status: 'confirmed', source: 'ai_proposed', diagnosed_on: /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : null }
      : f.kind === 'allergy' ? { substance: f.text, status: 'confirmed', source: 'ai_proposed' }
      : { description: f.text, started_at: /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : new Date().toISOString() }
    const { error } = await supabase.from(table).insert({ profile_id: profileId, ...row })
    if (!error) setFactsDone((s) => new Set(s).add(i))
  }

  async function rate(kind: 'helpful' | 'not_helpful' | 'inaccurate' | 'unsafe') {
    const comment = kind === 'inaccurate' || kind === 'unsafe' ? window.prompt(t('advisor.feedbackPrompt')) ?? undefined : undefined
    if (await sendFeedback(profileId, message.id, kind, comment)) setFeedback(kind)
  }

  const section = (title: string, text: string) => text && (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <p className="sensitive mt-0.5 whitespace-pre-line text-sm">{text}</p>
    </section>
  )

  return (
    <article dir={dir} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <p className="sensitive font-medium whitespace-pre-line">{a.direct_answer}</p>

      {a.record_points.length > 0 && (
        <ul className="space-y-2">
          {a.record_points.map((p, i) => (
            <li key={i} className="rounded-xl bg-canvas px-3 py-2 text-sm">
              <p className="sensitive">{p.text}</p>
              {p.refs.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{p.refs.map((r) => <CitationChip key={r} c={byId.get(r) ?? { id: r }} />)}</div>}
            </li>
          ))}
        </ul>
      )}

      {section(t('advisor.sections.changes'), a.changes)}
      {section(t('advisor.sections.explanation'), a.explanation)}
      {section(t('advisor.sections.uncertainties'), a.uncertainties)}
      {section(t('advisor.sections.nextSteps'), a.next_steps)}

      {a.warning_signs && (
        <section className="rounded-xl bg-status-watch-bg px-3 py-2 text-sm text-status-watch">
          <h4 className="flex items-center gap-1 font-semibold"><AlertTriangle className="size-4" aria-hidden /> {t('advisor.sections.warningSigns')}</h4>
          <p className="sensitive mt-0.5 whitespace-pre-line">{a.warning_signs}</p>
        </section>
      )}

      <p className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${SEE_DOCTOR_STYLE[a.see_doctor]}`}>
        <Stethoscope className="size-3.5" aria-hidden /> {t(`advisor.seeDoctor.${a.see_doctor}`)}
      </p>

      {flags.includes('unverified_numbers') && <p className="text-xs text-status-watch">{t('advisor.unverifiedNumbers')}</p>}
      {flags.some((f) => f.startsWith('blocked:')) && <p className="text-xs text-muted">{t('advisor.blockedNote')}</p>}

      {a.proposed_facts.length > 0 && (
        <section className="rounded-xl border border-dashed border-line px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-muted">{t('advisor.proposedFacts')}</h4>
            <SourceChip kind="ai" />
          </div>
          <ul className="mt-1 space-y-1">
            {a.proposed_facts.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{t(`advisor.factKinds.${f.kind}`)}: {f.text}{f.date ? ` (${f.date})` : ''}</span>
                {factsDone.has(i) ? <span className="text-xs font-medium text-status-ok">{t('docReview.saved')}</span> : (
                  <button type="button" onClick={() => void addFact(i)} className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium">{t('advisor.addToRecord')}</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ContextCard topics={answerTopics(message.citations ?? [])} />

      <div className="flex flex-wrap items-center gap-1 border-t border-line pt-2" dir="auto">
        {feedback ? <p className="text-xs text-muted">{t('advisor.thanks')}</p> : (
          <>
            <button type="button" aria-label={t('advisor.helpful')} onClick={() => void rate('helpful')} className="grid min-h-11 min-w-11 place-items-center rounded-full text-muted hover:bg-canvas"><ThumbsUp className="size-4" aria-hidden /></button>
            <button type="button" aria-label={t('advisor.notHelpful')} onClick={() => void rate('not_helpful')} className="grid min-h-11 min-w-11 place-items-center rounded-full text-muted hover:bg-canvas"><ThumbsDown className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => void rate('inaccurate')} className="min-h-11 rounded-full px-3 text-xs text-muted hover:bg-canvas">{t('advisor.reportInaccurate')}</button>
            <button type="button" onClick={() => void rate('unsafe')} className="min-h-11 rounded-full px-3 text-xs text-muted hover:bg-canvas">{t('advisor.reportUnsafe')}</button>
          </>
        )}
      </div>
    </article>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookCheck, ExternalLink, FileText, PenLine, Sparkles } from 'lucide-react'
import { CLINICIAN_REVIEW, SOURCES, type SourceId } from '../domain/labs/sources'

export type Provenance = 'document' | 'user' | 'ai'

const SOURCE_STYLE: Record<Provenance, string> = {
  document: 'border-line bg-surface text-ink',
  user: 'border-line bg-surface text-ink',
  // Not confirmed yet: dashed, so it never looks like a fact from a document.
  ai: 'border-dashed border-brand-600 bg-brand-50 text-brand-700',
}
const SOURCE_ICON = { document: FileText, user: PenLine, ai: Sparkles }

/** Maps the database's `source` column to what the person sees. */
export function provenanceOf(source: string | null | undefined, hasDocument = false): Provenance {
  if (source === 'ai_proposed') return 'ai'
  if (source === 'document_extraction' || hasDocument) return 'document'
  return 'user'
}

/** Where a record came from: a scanned document, the person, or an unconfirmed AI suggestion. */
export function SourceChip({ kind, detail, to, href }: { kind: Provenance; detail?: string; to?: string; href?: string }) {
  const { t } = useTranslation()
  const Icon = SOURCE_ICON[kind]
  const body = (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{t(`trust.source.${kind}`)}{detail && <span className="text-muted"> · {detail}</span>}</span>
      {(to || href) && <ExternalLink className="size-3 shrink-0 text-muted" aria-hidden />}
    </>
  )
  const cls = `inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${SOURCE_STYLE[kind]}`
  if (to) return <Link to={to} className={cls}>{body}</Link>
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{body}</a>
  return <span className={cls}>{body}</span>
}

/** The guidelines a rule or suggestion is based on. Tap to see the full reference and its review status. */
export function EvidenceChips({ sources }: { sources: readonly SourceId[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const unique = [...new Set(sources)]
  if (unique.length === 0) return null
  const labels = [...new Set(unique.map((id) => SOURCES[id].short))]

  return (
    <div className="mt-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-8 flex-wrap items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium">
        <BookCheck className="size-3.5 shrink-0 text-brand-700" aria-hidden />
        <span className="text-muted">{t('insights.basis')}</span>
        <span>{labels.join(' · ')}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-surface p-3 text-xs">
          <ul className="flex flex-col gap-2">
            {unique.map((id) => (
              <li key={id}>
                <a href={SOURCES[id].url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-brand-700 underline">
                  {SOURCES[id].title} <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
                </a>
                <span className="block text-muted">{t('trust.published', { date: SOURCES[id].published })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted">{t(CLINICIAN_REVIEW === 'pending' ? 'trust.reviewPending' : 'trust.reviewDone')}</p>
        </div>
      )}
    </div>
  )
}

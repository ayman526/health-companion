import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Camera, FileUp, Keyboard, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import {
  ACCEPTED_TYPES, createManualReport, draftReportFor, getDocumentStatus, grantAiConsent, hasAiConsent,
  startExtraction, uploadDocument,
} from '../lib/documents'
import { CONSENT_VERSION } from '../lib/consent'
import { PageHeader } from '../components/ui'

type Phase =
  | { kind: 'checking' }
  | { kind: 'needs_consent' }
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'reading'; documentId: string }
  | { kind: 'saved_other'; documentId: string }
  | { kind: 'duplicate'; documentId: string }
  | { kind: 'failed'; message: string; documentId?: string }

const POLL_MS = 3000
const POLL_LIMIT_MS = 6 * 60 * 1000

export function ScanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void hasAiConsent().then((ok) => setPhase(ok ? { kind: 'idle' } : { kind: 'needs_consent' }))
  }, [])

  // Poll the document until extraction finishes.
  useEffect(() => {
    if (phase.kind !== 'reading') return
    const started = Date.now()
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      const doc = await getDocumentStatus(phase.documentId)
      if (cancelled) return
      if (doc?.status === 'needs_review') {
        const reportId = await draftReportFor(phase.documentId)
        if (reportId) navigate(`/records/review/${reportId}`, { replace: true })
        else if (doc.document_type && doc.document_type !== 'lab_report' && doc.document_type !== 'other') navigate(`/records/documents/${phase.documentId}`, { replace: true })
        else setPhase({ kind: 'saved_other', documentId: phase.documentId })
        return
      }
      if (doc?.status === 'failed') {
        setPhase({ kind: 'failed', message: t(`scan.failure.${doc.failure_reason ?? 'ai_unavailable'}`, t('scan.failure.ai_unavailable')), documentId: phase.documentId })
        return
      }
      if (Date.now() - started > POLL_LIMIT_MS) {
        setPhase({ kind: 'failed', message: t('scan.failure.timeout'), documentId: phase.documentId })
        return
      }
      setTimeout(tick, POLL_MS)
    }
    const timer = setTimeout(tick, POLL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [phase, navigate, t])

  async function extract(documentId: string) {
    const outcome = await startExtraction(documentId)
    if (outcome === 'processing') setPhase({ kind: 'reading', documentId })
    else setPhase({ kind: 'failed', message: t(`scan.start.${outcome}`), documentId })
  }

  async function onFile(file: File | undefined) {
    if (!file || !profile) return
    setPhase({ kind: 'uploading' })
    const outcome = await uploadDocument(profile.id, file)
    if (outcome.kind === 'invalid') return setPhase({ kind: 'failed', message: t(`scan.invalid.${outcome.reason}`) })
    if (outcome.kind === 'error') return setPhase({ kind: 'failed', message: t('scan.uploadError') })
    if (outcome.kind === 'duplicate') return setPhase({ kind: 'duplicate', documentId: outcome.documentId })
    await extract(outcome.documentId)
  }

  async function enterManually() {
    if (!profile) return
    const id = await createManualReport(profile.id)
    if (id) navigate(`/records/review/${id}`)
    else setPhase({ kind: 'failed', message: t('scan.uploadError') })
  }

  const busy = phase.kind === 'uploading' || phase.kind === 'reading'

  return (
    <>
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} />

      {phase.kind === 'needs_consent' && (
        <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <p className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-5 text-brand-700" aria-hidden /> {t('onboarding.consent.ai_processing.title')}
          </p>
          <p className="mt-2 text-sm text-muted">{t('onboarding.consent.ai_processing.body')}</p>
          <button
            type="button"
            className="mt-4 min-h-11 rounded-xl bg-brand-700 px-4 font-medium text-white"
            onClick={async () => {
              if (session && (await grantAiConsent(session.user.id, CONSENT_VERSION))) setPhase({ kind: 'idle' })
            }}
          >
            {t('scan.allowAi')}
          </button>
        </div>
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      <input ref={fileInput} type="file" accept={ACCEPTED_TYPES.join(',')} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy || phase.kind === 'needs_consent' || phase.kind === 'checking'}
          onClick={() => cameraInput.current?.click()}
          className="flex min-h-16 items-center gap-3 rounded-2xl bg-brand-700 px-4 text-start font-medium text-white disabled:opacity-50"
        >
          <Camera className="size-6 shrink-0" aria-hidden /> {t('scan.takePhoto')}
        </button>
        <button
          type="button"
          disabled={busy || phase.kind === 'needs_consent' || phase.kind === 'checking'}
          onClick={() => fileInput.current?.click()}
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-start font-medium disabled:opacity-50"
        >
          <FileUp className="size-6 shrink-0" aria-hidden /> {t('scan.chooseFile')}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{t('scan.limits')}</p>

      <div role="status" aria-live="polite" className="mt-6">
        {phase.kind === 'uploading' && (
          <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden /> {t('scan.uploading')}</p>
        )}
        {phase.kind === 'reading' && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="flex items-center gap-2 font-medium"><Loader2 className="size-4 animate-spin" aria-hidden /> {t('scan.reading')}</p>
            <p className="mt-1 text-sm text-muted">{t('scan.readingHint')}</p>
          </div>
        )}
        {phase.kind === 'saved_other' && (
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <p className="font-medium">{t('scan.savedOther')}</p>
            <Link to="/records" className="mt-3 inline-block font-medium text-brand-700">{t('scan.goToRecords')}</Link>
          </div>
        )}
        {phase.kind === 'duplicate' && (
          <div className="rounded-2xl bg-status-info-bg p-4 text-sm text-status-info">
            <p>{t('scan.duplicate')}</p>
            <Link to="/records" className="mt-2 inline-block font-medium underline">{t('scan.goToRecords')}</Link>
          </div>
        )}
        {phase.kind === 'failed' && (
          <div role="alert" className="rounded-2xl bg-status-watch-bg p-4 text-sm text-status-watch">
            <p>{phase.message}</p>
            {phase.documentId && (
              <button type="button" onClick={() => void extract(phase.documentId!)} className="mt-3 min-h-11 font-medium underline">
                {t('scan.retry')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <button type="button" onClick={() => void enterManually()} className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
          <Keyboard className="size-4" aria-hidden /> {t('scan.enterManually')}
        </button>
        <p className="mt-1 text-xs text-muted">{t('scan.enterManuallyHint')}</p>
      </div>
    </>
  )
}

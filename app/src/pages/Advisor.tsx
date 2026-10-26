import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarClock, FileText, History, LineChart, Loader2, LockKeyhole, MessageCircleHeart, Mic, Pill, Plus, Send, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { ask, loadConversations, loadMessages, type ChatMessage, type Conversation } from '../lib/advisor'
import { loadStarters, type Starter, type StarterIcon } from '../lib/advisorStarters'
import { hasAiConsent } from '../lib/documents'
import { todayIn } from '../lib/medications'
import { listen, speechSupported } from '../lib/voice'
import { formatDate } from '../lib/format'
import { detectEmergency } from '../domain/emergency'
import { AnswerCard } from '../components/AnswerCard'
import { EmergencyCard } from '../components/EmergencyCard'
import { Sheet } from '../components/Sheet'
import { PageHeader } from '../components/ui'
import { track } from '../lib/usage'

const STARTER_ICON: Record<StarterIcon, typeof FileText> = { test: LineChart, report: FileText, medicine: Pill, visit: CalendarClock, general: Sparkles }
const iconButton = 'grid size-10 place-items-center rounded-full border border-line bg-surface text-muted hover:text-ink'

/**
 * The advisor, kept simple: a friendly empty screen with three questions built
 * from the person's own records, short answers with the detail folded away,
 * suggested follow-ups, and a one-line box (type or speak).
 */
export function AdvisorPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const country = profile?.country ?? 'EG'
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [starters, setStarters] = useState<Starter[] | null>(null)
  const [emergency, setEmergency] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState<boolean | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const stopListening = useRef<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void hasAiConsent().then(setConsent)
    void loadConversations().then(setConversations)
  }, [])

  useEffect(() => {
    void loadStarters(t, lang).then(setStarters)
  }, [t, lang, profile?.id])

  useEffect(() => {
    if (messages.length || busy) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  // The box grows with the text, up to about five lines.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])

  useEffect(() => () => stopListening.current?.(), [])

  async function open(id: string | null) {
    setHistoryOpen(false)
    setConversationId(id)
    setEmergency([])
    setError(null)
    setMessages(id ? await loadMessages(id) : [])
  }

  async function submit(question: string) {
    const q = question.trim()
    if (!q || busy || !profile) return
    track('advisor_asked')
    stopListening.current?.()
    // The deterministic emergency check runs before anything else, on this device.
    const flagged = detectEmergency(q)
    setEmergency(flagged)
    setInput('')
    setError(null)
    setBusy(true)
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', text: q, created_at: new Date().toISOString() }])
    const result = await ask(q, conversationId, profile.id, todayIn(profile.time_zone))
    setBusy(false)
    if (result.conversationId && result.conversationId !== conversationId) {
      setConversationId(result.conversationId)
      void loadConversations().then(setConversations)
    }
    if (result.emergency.length) setEmergency(result.emergency)
    if (result.ok) setMessages((m) => [...m, result.message])
    else setError(result.error)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void submit(input)
  }

  function toggleMic() {
    if (listening) {
      stopListening.current?.()
      return
    }
    const before = input.trim()
    setListening(true)
    stopListening.current = listen(lang, (said, final) => {
      setInput(before ? `${before} ${said}` : said)
      if (final) {
        setListening(false)
        stopListening.current = null
      }
    }, () => {
      setListening(false)
      stopListening.current = null
    })
  }

  if (consent === false) {
    return (
      <>
        <PageHeader title={t('advisor.title')} />
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm">{t('advisor.needsConsent')} <Link to="/settings" className="font-medium text-brand-700">{t('settings.title')}</Link></p>
      </>
    )
  }

  const last = messages[messages.length - 1]
  const followUps = !busy && last?.role === 'assistant' ? last.answer?.follow_ups ?? [] : []

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('advisor.shortTitle')}</h1>
        <div className="flex gap-2">
          {conversations.length > 0 && (
            <button type="button" aria-label={t('advisor.history')} onClick={() => setHistoryOpen(true)} className={iconButton}><History className="size-5" aria-hidden /></button>
          )}
          {messages.length > 0 && (
            <button type="button" aria-label={t('advisor.newConversation')} onClick={() => void open(null)} className={iconButton}><Plus className="size-5" aria-hidden /></button>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3">
        {emergency.length > 0 && <EmergencyCard kinds={emergency} country={country} />}

        {messages.length === 0 && !busy && (
          <div className="flex flex-1 flex-col">
            <div className="px-2 pb-6 pt-8 text-center">
              <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700"><MessageCircleHeart className="size-7" aria-hidden /></span>
              <p className="text-lg font-semibold">{t('advisor.hello')}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted"><LockKeyhole className="size-3.5" aria-hidden /> {t('advisor.trustLine')}</p>
            </div>
            {starters && (
              <>
                <p className="mb-2 text-xs font-medium text-muted">{t('advisor.startersTitle')}</p>
                <ul className="flex flex-col items-start gap-2">
                  {starters.map((s) => {
                    const Icon = STARTER_ICON[s.icon]
                    return (
                      <li key={s.key} className="max-w-full">
                        <button type="button" onClick={() => void submit(s.text)} className="flex min-h-11 max-w-full items-center gap-2 rounded-full border border-line bg-surface px-4 text-start text-sm hover:border-brand-600">
                          <Icon className="size-4 shrink-0 text-brand-700" aria-hidden />
                          <span dir="auto" className="sensitive truncate">{s.text}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            <p className="mt-auto pt-6 text-center text-xs text-muted">{t('advisor.disclaimer')}</p>
          </div>
        )}

        {messages.map((m) => m.role === 'user' ? (
          <p key={m.id} dir="auto" className="sensitive ms-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-ee-md bg-brand-700 px-4 py-2 text-sm text-white">{m.text}</p>
        ) : (
          <AnswerCard key={m.id} message={m} profileId={profile!.id} />
        ))}

        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> {t('advisor.thinking')}</p>
        )}
        {error && (
          <div role="alert" className="rounded-2xl bg-status-watch-bg p-4 text-sm text-status-watch">
            <p>{t(`advisor.errors.${error}`, t('advisor.errors.ai_unavailable'))}</p>
            <p className="mt-1 text-xs">{t('advisor.recordsStillAvailable')}</p>
          </div>
        )}

        {followUps.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label={t('advisor.followUps')}>
            {followUps.map((q) => (
              <button key={q} type="button" dir="auto" onClick={() => void submit(q)} className="min-h-10 shrink-0 rounded-full border border-line bg-surface px-3 text-sm hover:border-brand-600">{q}</button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-20 z-10 -mx-4 mt-3 bg-canvas px-4 pb-2 pt-2 md:bottom-0">
        {listening && <p className="mb-2 text-xs text-muted">{t('voice.privacy')}</p>}
        <div className="flex items-end gap-1 rounded-3xl border border-line bg-surface p-1.5 ps-4 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea
            ref={boxRef}
            dir="auto"
            rows={1}
            maxLength={2000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit(input)
              }
            }}
            placeholder={messages.length ? t('advisor.placeholderFollowUp') : t('advisor.placeholderShort')}
            aria-label={t('advisor.placeholder')}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none"
          />
          {speechSupported && (
            <button type="button" onClick={toggleMic} aria-pressed={listening} aria-label={listening ? t('advisor.stopListening') : t('advisor.speak')}
              className={`grid size-10 shrink-0 place-items-center rounded-full ${listening ? 'animate-pulse bg-status-urgent-bg text-status-urgent' : 'text-muted hover:text-ink'}`}>
              <Mic className="size-5" aria-hidden />
            </button>
          )}
          <button type="submit" disabled={busy || !input.trim()} aria-label={t('advisor.send')} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-700 text-white disabled:opacity-40">
            <Send className="size-4 rtl:-scale-x-100" aria-hidden />
          </button>
        </div>
      </form>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title={t('advisor.history')}>
        <ul className="flex flex-col">
          {conversations.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => void open(c.id)} className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-line text-start text-sm last:border-0 ${c.id === conversationId ? 'font-semibold text-brand-700' : ''}`}>
                <span dir="auto" className="sensitive min-w-0 flex-1 truncate">{c.title || t('advisor.untitled')}</span>
                <span className="shrink-0 text-xs text-muted">{formatDate(c.updated_at.slice(0, 10), lang)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => void open(null)} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line font-medium">
          <Plus className="size-4" aria-hidden /> {t('advisor.newConversation')}
        </button>
      </Sheet>
    </div>
  )
}

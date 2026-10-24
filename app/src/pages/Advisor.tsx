import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, MessageCirclePlus, Send } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { ask, loadConversations, loadMessages, type ChatMessage, type Conversation } from '../lib/advisor'
import { hasAiConsent } from '../lib/documents'
import { todayIn } from '../lib/medications'
import { detectEmergency } from '../domain/emergency'
import { AnswerCard } from '../components/AnswerCard'
import { EmergencyCard } from '../components/EmergencyCard'
import { PageHeader } from '../components/ui'

const SUGGESTIONS = ['cholesterol', 'liver', 'doctor', 'summary', 'arabic', 'followUps'] as const

export function AdvisorPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const country = profile?.country ?? 'EG'
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [emergency, setEmergency] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState<boolean | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void hasAiConsent().then(setConsent)
    void loadConversations().then(setConversations)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function open(id: string | null) {
    setConversationId(id)
    setEmergency([])
    setError(null)
    setMessages(id ? await loadMessages(id) : [])
  }

  async function submit(question: string) {
    const q = question.trim()
    if (!q || busy || !profile) return
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

  if (consent === false) {
    return (
      <>
        <PageHeader title={t('advisor.title')} />
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm">{t('advisor.needsConsent')} <Link to="/settings" className="font-medium text-brand-700">{t('settings.title')}</Link></p>
      </>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <PageHeader title={t('advisor.title')} subtitle={t('advisor.subtitle')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void open(null)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium">
          <MessageCirclePlus className="size-4" aria-hidden /> {t('advisor.newConversation')}
        </button>
        {conversations.length > 0 && (
          <select aria-label={t('advisor.history')} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" value={conversationId ?? ''} onChange={(e) => void open(e.target.value || null)}>
            <option value="">{t('advisor.history')}</option>
            {conversations.map((c) => <option key={c.id} value={c.id}>{c.title || t('advisor.untitled')} · {c.updated_at.slice(0, 10)}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {emergency.length > 0 && <EmergencyCard kinds={emergency} country={country} />}

        {messages.length === 0 && !busy && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm text-muted">{t('advisor.empty')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void submit(t(`advisor.suggestions.${s}`))} className="min-h-11 rounded-full border border-line bg-canvas px-3 text-start text-sm hover:border-brand-600">
                  {t(`advisor.suggestions.${s}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => m.role === 'user' ? (
          <p key={m.id} dir="auto" className="ms-auto max-w-[85%] whitespace-pre-line rounded-2xl bg-brand-700 px-4 py-2 text-sm text-white">{m.text}</p>
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
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-20 mt-4 flex items-end gap-2 bg-canvas py-2 md:bottom-0">
        <textarea
          dir="auto"
          rows={2}
          maxLength={2000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit(input)
            }
          }}
          placeholder={t('advisor.placeholder')}
          aria-label={t('advisor.placeholder')}
          className="min-h-12 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label={t('advisor.send')} className="grid min-h-12 min-w-12 place-items-center rounded-xl bg-brand-700 text-white disabled:opacity-50">
          <Send className="size-5 rtl:-scale-x-100" aria-hidden />
        </button>
      </form>
      <p className="text-center text-xs text-muted">{t('advisor.disclaimer')}</p>
    </div>
  )
}

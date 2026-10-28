import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, LockKeyhole, MailCheck } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { setLanguage } from '../i18n'
import { toWesternDigits } from '../domain/numbers'
import { trackPublic } from '../lib/usage'

const ExamplePage = lazy(() => import('./Example').then((m) => ({ default: m.ExamplePage })))

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string }
const RESEND_AFTER_S = 60

/**
 * Sign in with a code sent by email (typed into the app). A code works in the
 * Home Screen app on iPhone, where an email link would open Safari instead.
 * The email also keeps a link, so either works. Supabase's built-in emails
 * only carry the link (editing them needs custom SMTP), so the screen offers both.
 */
export function SignInPage() {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [badCode, setBadCode] = useState(false)
  const [wait, setWait] = useState(0)
  const [example, setExample] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  async function send(address: string) {
    if (!supabase) return
    setState({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setState(error ? { kind: 'error', message: error.message } : { kind: 'sent', email: address })
    if (!error) {
      trackPublic('signin_code_requested')
      setCode('')
      setBadCode(false)
      setWait(RESEND_AFTER_S)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await send(email.trim())
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!supabase || state.kind !== 'sent') return
    setVerifying(true)
    setBadCode(false)
    // On success the auth listener signs the person in and the app moves on.
    const { error } = await supabase.auth.verifyOtp({ email: state.email, token: code, type: 'email' })
    setVerifying(false)
    if (error) setBadCode(true)
  }

  if (example) {
    return (
      <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
        <ExamplePage onClose={() => setExample(false)} onStart={() => setExample(false)} />
      </Suspense>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-6">
      {/* Berry header with a curved bottom; the cards below overlap it. */}
      <header className="rounded-b-[2.5rem] bg-hero px-4 pb-16 pt-6 text-on-hero">
        <div className="mx-auto flex w-full max-w-sm items-center justify-between">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <img src="/favicon.svg" alt="" className="size-8 rounded-lg ring-2 ring-on-hero/40" /> {t('app.name')}
          </p>
          <button
            type="button"
            onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
            className="min-h-11 rounded-full border border-on-hero/50 px-4 text-sm font-medium"
          >
            {t('actions.switchLanguage')}
          </button>
        </div>
        <div className="mx-auto mt-6 w-full max-w-sm">
          <h1 className="text-3xl font-bold leading-snug tracking-tight">{t('auth.promise')}</h1>
          <p className="mt-2 opacity-90">{t('auth.promiseLine')}</p>
        </div>
      </header>

      <main className="mx-auto -mt-10 flex w-full max-w-sm flex-1 flex-col px-4">
        {state.kind !== 'sent' && <PromiseCard />}

        {!isSupabaseConfigured && (
          <p role="status" className="mt-8 rounded-xl bg-status-watch-bg px-4 py-3 text-sm text-status-watch">
            {t('auth.notConfigured')}
          </p>
        )}

        {state.kind === 'sent' ? (
          <form onSubmit={verify} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <MailCheck className="mb-3 size-8 text-brand-700" aria-hidden />
            <p role="status" className="font-medium">{t('auth.checkEmail')}</p>
            <p className="mt-1 text-sm text-muted">
              {t('auth.sentTo')} <span className="ltr-value font-medium text-ink">{state.email}</span>
            </p>
            <p className="mt-3 text-sm text-muted">{t('auth.codeHint')}</p>
            <label htmlFor="code" className="sr-only">{t('auth.code')}</label>
            <input
              id="code"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              dir="ltr"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(toWesternDigits(e.target.value).replace(/\D/g, '').slice(0, 8))}
              className="mt-4 min-h-14 w-full rounded-xl border border-line bg-canvas px-4 text-center text-2xl font-semibold tracking-[0.4em] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
            {badCode && <p role="alert" className="mt-2 text-sm text-status-urgent">{t('auth.badCode')}</p>}
            <button type="submit" disabled={verifying || code.length < 6} className="mt-3 min-h-12 w-full rounded-xl bg-brand-700 font-medium text-white disabled:opacity-60">
              {verifying ? t('auth.verifying') : t('auth.verify')}
            </button>
            <div className="mt-2 flex flex-wrap justify-between gap-2">
              <button type="button" disabled={wait > 0} onClick={() => void send(state.email)} className="min-h-11 text-sm font-medium text-brand-700 disabled:text-muted">
                {wait > 0 ? t('auth.resendIn', { s: wait }) : t('auth.resend')}
              </button>
              <button type="button" onClick={() => setState({ kind: 'idle' })} className="min-h-11 text-sm font-medium text-muted">
                {t('auth.useDifferentEmail')}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label htmlFor="email" className="text-sm font-medium">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              disabled={!isSupabaseConfigured || state.kind === 'sending'}
              className="min-h-12 rounded-xl bg-brand-700 font-medium text-white disabled:opacity-60"
            >
              {state.kind === 'sending' ? t('auth.sending') : t('auth.sendLink')}
            </button>
            {state.kind === 'error' && (
              <p role="alert" className="text-sm text-status-urgent">
                {/rate limit/i.test(state.message) ? t('auth.rateLimited') : `${t('auth.error')} (${state.message})`}
              </p>
            )}
          </form>
        )}

        {state.kind !== 'sent' && (
          <button type="button" onClick={() => setExample(true)} className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-brand-700">
            <Eye className="size-4" aria-hidden /> {t('auth.seeExample')}
          </button>
        )}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted"><LockKeyhole className="size-3.5" aria-hidden /> {t('auth.trustLine')}</p>
        <p className="mt-6 text-center font-semibold">{t('auth.signoff')} <span aria-hidden className="text-[#E24B4A]">❤️</span></p>
      </main>
    </div>
  )
}

/** The promise in one picture: a test improving over the years, with the medicine that was started. Sample data. */
function PromiseCard() {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm" aria-hidden>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{t('auth.cardTitle')}</span>
        <span className="font-semibold text-status-ok">6.4</span>
      </div>
      <svg viewBox="0 0 200 86" className="mt-1 h-24 w-full">
        <line x1="0" y1="54" x2="200" y2="54" stroke="var(--color-line)" strokeDasharray="3 3" />
        <line x1="55" y1="4" x2="55" y2="66" stroke="var(--color-status-watch)" strokeWidth="1" />
        <polyline points="10,12 55,16 100,34 145,46 190,60" fill="none" stroke="var(--color-plum-700)" strokeWidth="2.5" />
        {[[10, 12], [55, 16], [100, 34], [145, 46], [190, 60]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" fill={x === 190 ? 'var(--color-sun-500)' : 'var(--color-plum-700)'} />)}
      </svg>
      {/* Under the marker line (x = 55 of 200); the years read left to right, like the chart. */}
      <div dir="ltr" className="relative h-6">
        <span dir="auto" className="absolute left-[27.5%] top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-status-watch-bg px-2 py-0.5 text-xs text-status-watch">{t('auth.cardMed')}</span>
      </div>
      <div dir="ltr" className="flex justify-between text-xs text-muted"><span>2024</span><span>2026</span></div>
      <p className="mt-1 text-center text-[11px] text-muted">{t('auth.cardExample')}</p>
    </div>
  )
}

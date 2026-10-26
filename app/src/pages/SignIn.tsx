import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, LockKeyhole, MailCheck, MapPin, ShieldCheck, Trash2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { setLanguage } from '../i18n'
import { toWesternDigits } from '../domain/numbers'

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string }
const RESEND_AFTER_S = 60

/**
 * Sign in with a code sent by email (typed into the app). A code works in the
 * Home Screen app on iPhone, where an email link would open Safari instead.
 * The email also keeps a link, so either works.
 */
export function SignInPage() {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [badCode, setBadCode] = useState(false)
  const [wait, setWait] = useState(0)

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

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-4 py-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
          className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium"
        >
          {t('actions.switchLanguage')}
        </button>
      </div>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-700">{t('app.name')}</h1>
        <p className="mt-2 text-muted">{t('auth.tagline')}</p>

        {!isSupabaseConfigured && (
          <p role="status" className="mt-8 rounded-xl bg-status-watch-bg px-4 py-3 text-sm text-status-watch">
            {t('auth.notConfigured')}
          </p>
        )}

        {state.kind === 'sent' ? (
          <form onSubmit={verify} className="mt-8 rounded-2xl border border-line bg-surface p-5">
            <MailCheck className="mb-3 size-8 text-brand-700" aria-hidden />
            <p role="status" className="font-medium">{t('auth.checkEmail')}</p>
            <p className="mt-1 text-sm text-muted">
              {t('auth.sentTo')} <span className="ltr-value font-medium text-ink">{state.email}</span>
            </p>
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
            <p className="mt-3 text-xs text-muted">{t('auth.codeHint')}</p>
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
          <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
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

        <ul className="mt-6 grid grid-cols-3 gap-2 text-center text-xs">
          {([['noPassword', KeyRound], ['encrypted', LockKeyhole], ['delete', Trash2]] as const).map(([k, Icon]) => (
            <li key={k} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-3">
              <Icon className="size-4 text-brand-700" aria-hidden />
              <span className="font-medium">{t(`auth.trust.${k}`)}</span>
            </li>
          ))}
        </ul>

        <details className="mt-6 rounded-2xl border border-line bg-surface text-sm">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-medium">
            <ShieldCheck className="size-4 shrink-0 text-brand-700" aria-hidden /> {t('auth.howWeProtect')}
          </summary>
          <ul className="flex flex-col gap-3 px-4 pb-4 text-muted">
            <li>{t('auth.privacyNote')}</li>
            <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{t('onboarding.consent.privacy.body')}</li>
            <li>{t('onboarding.consent.ai_processing.body')}</li>
            <li>{t('onboarding.consent.terms.body')}</li>
          </ul>
        </details>
      </main>
    </div>
  )
}

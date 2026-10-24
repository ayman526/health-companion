import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, LockKeyhole, MailCheck, MapPin, ShieldCheck, Trash2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { setLanguage } from '../i18n'

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string }

export function SignInPage() {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setState({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setState(error ? { kind: 'error', message: error.message } : { kind: 'sent', email: email.trim() })
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
          <div role="status" className="mt-8 rounded-2xl border border-line bg-surface p-5">
            <MailCheck className="mb-3 size-8 text-brand-700" aria-hidden />
            <p className="font-medium">{t('auth.checkEmail')}</p>
            <p className="mt-1 text-sm text-muted">
              {t('auth.sentTo')} <span className="ltr-value font-medium text-ink">{state.email}</span>
            </p>
            <button type="button" onClick={() => setState({ kind: 'idle' })} className="mt-4 min-h-11 text-sm font-medium text-brand-700">
              {t('auth.useDifferentEmail')}
            </button>
          </div>
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
                {t('auth.error')} ({state.message})
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

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function PageHeader({ title, subtitle, sensitive }: { title: string; subtitle?: string; sensitive?: boolean }) {
  return (
    <div className="mb-6">
      <h1 className={`text-2xl font-semibold tracking-tight ${sensitive ? 'sensitive' : ''}`}>{title}</h1>
      {subtitle && <p className={`mt-1 text-muted ${sensitive ? 'sensitive' : ''}`}>{subtitle}</p>}
    </div>
  )
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 md:p-5">
      {title && <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>}
      {children}
    </section>
  )
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="max-w-sm text-sm text-muted">{text}</p>
    </div>
  )
}

/** Action that needs the backend. Rendered disabled and labeled honestly until it is connected. */
export function PendingAction({ icon: Icon, label, primary }: { icon: LucideIcon; label: string; primary?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      disabled
      title={t('setup.notConnected')}
      className={`flex min-h-14 w-full cursor-not-allowed items-center gap-3 rounded-2xl px-4 text-start font-medium opacity-60 ${
        primary ? 'bg-brand-700 text-white' : 'border border-line bg-surface text-ink'
      }`}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="flex-1">{label}</span>
      <span className="text-xs font-normal">{t('setup.notConnected')}</span>
    </button>
  )
}

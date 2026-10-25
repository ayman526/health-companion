import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

/** A panel that slides up from the bottom of the screen; tap outside or ✕ to close. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t('report.cancel')} onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:rounded-3xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label={t('report.cancel')} onClick={onClose} className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted hover:bg-canvas"><X className="size-5" aria-hidden /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

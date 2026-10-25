import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Camera, ChevronRight, HeartPulse, Mic, Pill, Plus, Stethoscope } from 'lucide-react'
import { Sheet } from '../Sheet'
import { VoiceLog } from '../VoiceLog'

/** The one "+" on Home: everything you can add, in a short menu. */
export function AddButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [voice, setVoice] = useState(false)
  const close = () => { setOpen(false); setVoice(false) }
  const items = [
    { to: '/vitals', icon: HeartPulse, label: t('home.add.reading') },
    { to: '/records/scan', icon: Camera, label: t('home.add.scan') },
    { to: '/medications/new', icon: Pill, label: t('home.add.medicine') },
    { to: '/visits', icon: Stethoscope, label: t('home.add.visit') },
  ]

  return (
    <>
      <button type="button" aria-label={t('home.add.title')} onClick={() => setOpen(true)}
        className="fixed bottom-24 end-4 z-20 grid size-14 place-items-center rounded-full bg-brand-700 text-white shadow-lg md:bottom-8 md:end-8 print:hidden">
        <Plus className="size-7" aria-hidden />
      </button>
      <Sheet open={open} onClose={close} title={voice ? t('voice.title') : t('home.add.title')}>
        {voice ? <VoiceLog startOpen onClose={close} /> : (
          <ul className="flex flex-col">
            <li>
              <button type="button" onClick={() => setVoice(true)} className="flex min-h-14 w-full items-center gap-3 border-b border-line text-start">
                <Mic className="size-5 shrink-0 text-brand-700" aria-hidden />
                <span className="flex-1"><span className="block font-medium">{t('home.add.voice')}</span><span className="block text-xs text-muted">{t('home.add.voiceHint')}</span></span>
              </button>
            </li>
            {items.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <Link to={to} onClick={close} className="flex min-h-14 items-center gap-3 border-b border-line last:border-0">
                  <Icon className="size-5 shrink-0 text-brand-700" aria-hidden />
                  <span className="flex-1 font-medium">{label}</span>
                  <ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  )
}

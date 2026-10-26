import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Plus } from 'lucide-react'
import { GOAL_OPTIONS, optionKey, type OptionMap } from '../domain/profileOptions'
import { normalizeNumberInput } from '../domain/numbers'

export const fieldClass = 'min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-surface'}`}>
      {on && <Check className="size-4" aria-hidden />}{children}
    </button>
  )
}

/** Multiple choice from a list (stored under English names), plus free text for anything else. */
export function ChipGroup({ options, i18nPrefix, value, onChange, none, onNone }: {
  options: OptionMap
  i18nPrefix: string
  value: string[]
  onChange: (v: string[]) => void
  none?: boolean
  onNone?: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const [other, setOther] = useState('')
  const has = (name: string) => value.some((v) => v.toLowerCase() === name.toLowerCase())
  const toggle = (name: string) => {
    onChange(has(name) ? value.filter((v) => v.toLowerCase() !== name.toLowerCase()) : [...value, name])
    onNone?.(false)
  }
  const extras = value.filter((v) => !optionKey(options, v))

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([key, name]) => (
          <Chip key={key} on={has(name)} onClick={() => toggle(name)}>{t(`${i18nPrefix}.${key}`)}</Chip>
        ))}
        {extras.map((name) => <Chip key={name} on onClick={() => toggle(name)}>{name}</Chip>)}
        {onNone && (
          <Chip on={!!none} onClick={() => { onNone(!none); if (!none) onChange([]) }}>{t('profileFields.none')}</Chip>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <input className={`${fieldClass} min-h-11 text-sm`} value={other} placeholder={t('profileFields.otherPlaceholder')} maxLength={120}
          onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && other.trim()) {
              e.preventDefault()
              toggle(other.trim())
              setOther('')
            }
          }} />
        <button type="button" disabled={!other.trim()} aria-label={t('profileFields.add')}
          onClick={() => { toggle(other.trim()); setOther('') }}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-line disabled:opacity-40">
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export interface AboutValue {
  display_name: string
  date_of_birth: string
  sex: string
  country: 'EG' | 'US'
  height_cm: string
  weight_kg: string
}

/** `compact` (sign-up): name, date of birth and sex only; country is detected and the rest waits for the profile. */
export function AboutFields({ value, onChange, compact = false }: { value: AboutValue; onChange: (v: AboutValue) => void; compact?: boolean }) {
  const { t } = useTranslation()
  const set = (patch: Partial<AboutValue>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('onboarding.name')}
        <input className={fieldClass} value={value.display_name} autoComplete="given-name" maxLength={120} onChange={(e) => set({ display_name: e.target.value })} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('onboarding.dob')}
        <input className={fieldClass} type="date" dir="ltr" min="1900-01-01" value={value.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
        <span className="text-xs font-normal text-muted">{t('onboarding.dobWhy')}</span>
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('profileFields.sex')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['female', 'male', 'intersex', 'prefer_not_to_say'] as const).map((s) => (
            <Chip key={s} on={value.sex === s} onClick={() => set({ sex: value.sex === s ? '' : s })}>{t(`profileFields.sexes.${s}`)}</Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{t('profileFields.sexWhy')}</p>
      </fieldset>
      {!compact && <>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('onboarding.country')}
        <select className={fieldClass} value={value.country} onChange={(e) => set({ country: e.target.value as 'EG' | 'US' })}>
          <option value="EG">{t('onboarding.countries.EG')}</option>
          <option value="US">{t('onboarding.countries.US')}</option>
        </select>
        <span className="text-xs font-normal text-muted">{t('profileFields.countryWhy')}</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2 text-sm font-medium">
          {t('profileFields.height')}
          <input className={fieldClass} dir="ltr" inputMode="decimal" value={value.height_cm} onChange={(e) => set({ height_cm: normalizeNumberInput(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          {t('profileFields.weight')}
          <input className={fieldClass} dir="ltr" inputMode="decimal" value={value.weight_kg} onChange={(e) => set({ weight_kg: normalizeNumberInput(e.target.value) })} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">{t('profileFields.bodyWhy')}</p>
      </>}
    </div>
  )
}

export function PregnancyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      {(['pregnant', 'breastfeeding', 'neither', 'prefer_not_to_say'] as const).map((s) => (
        <Chip key={s} on={value === s} onClick={() => onChange(value === s ? '' : s)}>{t(`profileFields.pregnancy.${s}`)}</Chip>
      ))}
    </div>
  )
}

export function SmokingField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      {(['never', 'former', 'current', 'prefer_not_to_say'] as const).map((s) => (
        <Chip key={s} on={value === s} onClick={() => onChange(value === s ? '' : s)}>{t(`profileFields.smoking.${s}`)}</Chip>
      ))}
    </div>
  )
}

export function GoalsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      {GOAL_OPTIONS.map((g) => (
        <Chip key={g} on={value.includes(g)} onClick={() => onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g])}>
          {t(`profileFields.goals.${g}`)}
        </Chip>
      ))}
    </div>
  )
}


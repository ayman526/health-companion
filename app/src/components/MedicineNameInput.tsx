import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { suggestMedicines, type MedicineSuggestion } from '../domain/medicineSearch'

/**
 * Medicine name field with suggestions as you type (accessible combobox).
 * Suggestions come from a list bundled in the app; nothing typed is sent anywhere.
 */
export function MedicineNameInput({ value, onChange, onPick, own, className, label }: {
  value: string
  onChange: (name: string) => void
  onPick: (s: MedicineSuggestion) => void
  own: { name: string; generic: string }[]
  className: string
  label: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const suggestions = useMemo(() => suggestMedicines(value, own), [value, own])
  const show = open && suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0].name === value)

  function pick(s: MedicineSuggestion) {
    onPick(s)
    setOpen(false)
  }

  return (
    <label className="relative flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={show ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, suggestions.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(suggestions[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {show && (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface py-1 text-sm text-ink shadow-lg">
          {suggestions.map((s, i) => (
            <li
              key={s.name}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 ${i === active ? 'bg-brand-50' : ''}`}
            >
              <span className="font-medium">{s.name}</span>
              {(s.generic || s.mine) && (
                <span className="text-xs font-normal text-muted">
                  {s.mine ? t('meds.suggest.mine') : t('meds.suggest.brandOf', { generic: s.generic })}
                  {s.mine && s.generic ? ` · ${s.generic}` : ''}
                </span>
              )}
            </li>
          ))}
          <li role="presentation" className="px-3 pt-1 pb-1.5 text-[11px] font-normal text-muted">{t('meds.suggest.note')}</li>
        </ul>
      )}
    </label>
  )
}

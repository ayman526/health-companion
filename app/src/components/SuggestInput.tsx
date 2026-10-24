import { useId, useMemo, useState } from 'react'
import { normalizeMedicineName } from '../domain/medicineSearch'

/**
 * Text field that suggests values the user entered before (accessible combobox).
 * Typing something new is always allowed.
 */
export function SuggestInput({ value, onChange, options, className, label, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  className: string
  label: string
  placeholder?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    const q = normalizeMedicineName(value)
    const unique = [...new Map(options.filter(Boolean).map((o) => [normalizeMedicineName(o), o.trim()])).values()]
    return unique
      .filter((o) => {
        const k = normalizeMedicineName(o)
        return !q || (k !== q && (k.startsWith(q) || k.split(' ').some((w) => w.startsWith(q))))
      })
      .slice(0, 6)
  }, [value, options])
  const show = open && matches.length > 0

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
        placeholder={placeholder}
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
            setActive((a) => Math.min(a + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            onChange(matches[active])
            setOpen(false)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {show && (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-xl border border-line bg-surface py-1 text-sm text-ink shadow-lg">
          {matches.map((m, i) => (
            <li key={m} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(m)
                setOpen(false)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center px-3 font-medium ${i === active ? 'bg-brand-50' : ''}`}>
              {m}
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}

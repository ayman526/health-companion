import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate, formatNumber } from '../lib/format'
import type { MeasurementStatus } from '../domain/labs/rules'

export interface ChartPoint {
  id: string
  date: string // YYYY-MM-DD
  value: number
  status: MeasurementStatus
}

interface Props {
  points: ChartPoint[] // oldest first
  unit: string
  refLow: number | null
  refHigh: number | null
  onSelect?: (id: string) => void
}

const HEIGHT = 220
const M = { top: 20, right: 20, bottom: 30, left: 44 }

// Marks: one series, so no legend box (the page title names it). Abnormal points
// use the reserved status colors and are always paired with a text label in the tooltip and list.
const POINT_FILL: Record<MeasurementStatus, string> = {
  within_range: 'var(--color-brand-700)',
  no_range: 'var(--color-brand-700)',
  high: 'var(--color-status-watch)',
  low: 'var(--color-status-watch)',
  urgent: 'var(--color-status-urgent)',
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1
  const raw = span / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

export function TrendChart({ points, unit, refLow, refHigh, onSelect }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    if (!wrap.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  if (points.length === 0) return null

  const values = points.map((p) => p.value)
  const lo = Math.min(...values, ...(refLow != null ? [refLow] : []))
  const hi = Math.max(...values, ...(refHigh != null ? [refHigh] : []))
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12
  const ticks = niceTicks(Math.max(0, lo - pad) === 0 && lo >= 0 ? 0 : lo - pad, hi + pad)
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]

  const times = points.map((p) => Date.parse(p.date))
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const innerW = width - M.left - M.right
  const innerH = HEIGHT - M.top - M.bottom
  const x = (time: number) => (tMax === tMin ? M.left + innerW / 2 : M.left + ((time - tMin) / (tMax - tMin)) * innerW)
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * innerH

  const xy = points.map((p, i) => ({ ...p, cx: x(times[i]), cy: y(p.value) }))
  const path = xy.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')
  const bandTop = y(Math.min(refHigh ?? yMax, yMax))
  const bandBottom = y(Math.max(refLow ?? yMin, yMin))
  const showBand = refLow != null || refHigh != null
  const last = xy[xy.length - 1]
  const tip = active != null ? xy[active] : null

  const summary = t('chart.summary', {
    count: points.length,
    first: formatDate(points[0].date, lang),
    last: formatDate(last.date, lang),
    value: `${formatNumber(last.value, lang)} ${unit}`,
  })

  return (
    // Time runs left to right in both languages; the surrounding page stays RTL in Arabic.
    <div ref={wrap} dir="ltr" className="sensitive relative w-full select-none" onPointerLeave={() => setActive(null)}>
      <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block">
        {/* Recessive grid and y-axis labels */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-muted)">
              {formatNumber(v, lang)}
            </text>
          </g>
        ))}
        {/* Reference range band from the latest report */}
        {showBand && bandBottom > bandTop && (
          <rect x={M.left} y={bandTop} width={innerW} height={bandBottom - bandTop} fill="var(--color-status-ok-bg)" opacity={0.9} />
        )}
        {/* Crosshair */}
        {tip && <line x1={tip.cx} x2={tip.cx} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="3 3" />}
        <path d={path} fill="none" stroke="var(--color-brand-600)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => (
          <g key={p.id}>
            <circle cx={p.cx} cy={p.cy} r={active === i ? 7 : 5} fill={POINT_FILL[p.status]} stroke="var(--color-surface)" strokeWidth={2} />
            {/* Hit target larger than the mark */}
            <circle
              cx={p.cx} cy={p.cy} r={18} fill="transparent" className="cursor-pointer"
              onPointerEnter={() => setActive(i)}
              onClick={() => (active === i && onSelect ? onSelect(p.id) : setActive(i))}
            />
          </g>
        ))}
        {/* Direct label on the latest value only */}
        {!tip && (
          <text x={Math.min(last.cx, width - M.right)} y={last.cy - 12} textAnchor={xy.length > 1 ? 'end' : 'middle'} fontSize={12} fontWeight={600} fill="var(--color-ink)">
            {formatNumber(last.value, lang)}
          </text>
        )}
        {/* x-axis: first and last date */}
        <text x={xy[0].cx} y={HEIGHT - 8} textAnchor={xy.length > 1 ? 'start' : 'middle'} fontSize={11} fill="var(--color-muted)">
          {formatDate(points[0].date, lang)}
        </text>
        {xy.length > 1 && (
          <text x={last.cx} y={HEIGHT - 8} textAnchor="end" fontSize={11} fill="var(--color-muted)">
            {formatDate(last.date, lang)}
          </text>
        )}
      </svg>
      {tip && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(tip.cx - 70, 4), width - 144), top: Math.max(tip.cy - 64, 0), width: 140 }}
        >
          <p className="text-muted">{formatDate(tip.date, lang)}</p>
          <p className="font-semibold text-ink">{formatNumber(tip.value, lang)} {unit}</p>
          <p className="text-muted">{t(`labs.status.${tip.status}`)}</p>
        </div>
      )}
      {showBand && <p className="mt-1 text-xs text-muted" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t('chart.bandNote')}</p>}
    </div>
  )
}

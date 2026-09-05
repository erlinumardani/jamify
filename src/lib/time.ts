import {
  addDays, format, isSameDay, isToday, isYesterday, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths,
} from 'date-fns'
import type { DurationFormat, TimeEntry, TimeFormat } from '../types'

export const pad = (n: number) => String(n).padStart(2, '0')

export function formatDuration(sec: number, fmt: DurationFormat = 'full'): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (fmt === 'decimal') return (s / 3600).toFixed(2)
  if (fmt === 'compact') {
    if (h === 0 && m === 0) return `${r}s`
    if (h === 0) return `${m}m`
    return `${h}h ${pad(m)}m`
  }
  return `${pad(h)}:${pad(m)}:${pad(r)}`
}

/** Parses "1:30", "01:30:15", "1h 30m", "90m", "1.5", "2" → seconds. */
export function parseDuration(input: string): number | null {
  const str = input.trim().toLowerCase()
  if (!str) return null
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(str)) {
    const parts = str.split(':').map(Number)
    const [h, m, s = 0] = parts
    return h * 3600 + m * 60 + s
  }
  const unitMatch = str.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/)
  if (unitMatch && (unitMatch[1] || unitMatch[2] || unitMatch[3])) {
    const h = parseFloat(unitMatch[1] ?? '0')
    const m = parseInt(unitMatch[2] ?? '0', 10)
    const s = parseInt(unitMatch[3] ?? '0', 10)
    return Math.round(h * 3600 + m * 60 + s)
  }
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = parseFloat(str)
    // whole numbers ≤ 24 are hours, larger values are minutes
    return n <= 24 || str.includes('.') ? Math.round(n * 3600) : Math.round(n * 60)
  }
  return null
}

export function entrySeconds(e: TimeEntry, now: number = Date.now()): number {
  const start = new Date(e.start).getTime()
  const end = e.end ? new Date(e.end).getTime() : now
  return Math.max(0, Math.floor((end - start) / 1000))
}

export function sumSeconds(entries: TimeEntry[], now: number = Date.now()): number {
  return entries.reduce((acc, e) => acc + entrySeconds(e, now), 0)
}

export function formatTime(d: Date, fmt: TimeFormat): string {
  return fmt === '24' ? format(d, 'HH:mm') : format(d, 'h:mm a')
}

/** Parses "9:30", "09:30", "930", "9:30 pm", "17" into a Date on the same day as `base`. */
export function parseTimeInput(input: string, base: Date): Date | null {
  const str = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!str) return null
  const m = str.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const ap = m[3]
  if (ap) {
    const isPm = ap.startsWith('p')
    if (h === 12) h = isPm ? 12 : 0
    else if (isPm) h += 12
  }
  if (h > 23 || min > 59) return null
  const d = new Date(base)
  d.setHours(h, min, 0, 0)
  return d
}

export const toDateKey = (d: Date | string) => format(new Date(d), 'yyyy-MM-dd')

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dayLabel(key: string): string {
  const d = fromDateKey(key)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEE, MMM d')
}

export function weekDays(anchor: Date, weekStart: 0 | 1): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: weekStart })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function weekLabel(anchor: Date, weekStart: 0 | 1): string {
  const start = startOfWeek(anchor, { weekStartsOn: weekStart })
  const end = endOfWeek(anchor, { weekStartsOn: weekStart })
  const now = new Date()
  if (isSameDay(start, startOfWeek(now, { weekStartsOn: weekStart }))) return 'This week'
  if (isSameDay(start, startOfWeek(subWeeks(now, 1), { weekStartsOn: weekStart }))) return 'Last week'
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
}

export type RangePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'thisWeek', label: 'This week' },
  { id: 'lastWeek', label: 'Last week' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisYear', label: 'This year' },
  { id: 'custom', label: 'Custom' },
]

export function presetRange(p: RangePreset, weekStart: 0 | 1): [Date, Date] {
  const now = new Date()
  const y = addDays(now, -1)
  switch (p) {
    case 'today': return [now, now]
    case 'yesterday': return [y, y]
    case 'thisWeek': return [startOfWeek(now, { weekStartsOn: weekStart }), endOfWeek(now, { weekStartsOn: weekStart })]
    case 'lastWeek': { const w = subWeeks(now, 1); return [startOfWeek(w, { weekStartsOn: weekStart }), endOfWeek(w, { weekStartsOn: weekStart })] }
    case 'thisMonth': return [startOfMonth(now), endOfMonth(now)]
    case 'lastMonth': { const m = subMonths(now, 1); return [startOfMonth(m), endOfMonth(m)] }
    case 'thisYear': return [startOfYear(now), endOfYear(now)]
    default: return [startOfWeek(now, { weekStartsOn: weekStart }), endOfWeek(now, { weekStartsOn: weekStart })]
  }
}

export function inRange(e: TimeEntry, from: Date, to: Date): boolean {
  const t = new Date(e.start).getTime()
  const f = new Date(from); f.setHours(0, 0, 0, 0)
  const tt = new Date(to); tt.setHours(23, 59, 59, 999)
  return t >= f.getTime() && t <= tt.getTime()
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/** Rounds seconds to the workspace rounding interval (0 = no rounding). */
export function roundSeconds(sec: number, minutes: number, mode: 'nearest' | 'up' | 'down'): number {
  if (!minutes || minutes <= 0) return sec
  const unit = minutes * 60
  const q = sec / unit
  const r = mode === 'up' ? Math.ceil(q) : mode === 'down' ? Math.floor(q) : Math.round(q)
  return r * unit
}

/** Inclusive day count between two yyyy-MM-dd keys, skipping weekends when asked. */
export function countDays(fromKey: string, toKey: string, skipWeekends = true): number {
  let d = fromDateKey(fromKey)
  const end = fromDateKey(toKey)
  let n = 0
  while (d <= end) {
    const dow = d.getDay()
    if (!skipWeekends || (dow !== 0 && dow !== 6)) n++
    d = addDays(d, 1)
  }
  return n
}

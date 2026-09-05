import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, addWeeks, format, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useStore } from '../store'
import { Button, PageHeader, cn } from '../components/ui'
import { EntryModal, type EntryModalTarget } from '../components/EntryModal'
import { entrySeconds, formatDuration, formatTime, sumSeconds, toDateKey, weekDays, weekLabel } from '../lib/time'
import type { TimeEntry } from '../types'

const HOUR_PX = 56
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function CalendarPage() {
  const { state, now, projectById, tagById, memberById, isLocked } = useStore()
  const { settings } = state
  const [anchor, setAnchor] = useState(() => new Date())
  const [view, setView] = useState<'week' | 'day'>('week')
  const [target, setTarget] = useState<EntryModalTarget | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = new Date()

  const days = useMemo(() => (view === 'week' ? weekDays(anchor, settings.weekStart) : [anchor]), [view, anchor, settings.weekStart])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: HOUR_PX * 7.5 })
  }, [])

  const entriesByDay = useMemo(
    () => days.map((d) => state.entries.filter((e) => isSameDay(new Date(e.start), d))),
    [days, state.entries],
  )
  const timeOffByDay = useMemo(
    () => days.map((d) => { const k = toDateKey(d); return state.timeOffRequests.filter((r) => r.status === 'Approved' && r.startDate <= k && r.endDate >= k) }),
    [days, state.timeOffRequests],
  )
  const dayLocked = (d: Date) => !!settings.lockBefore && toDateKey(d) < settings.lockBefore

  const openNew = (day: Date, hourFloat: number) => {
    if (dayLocked(day)) return
    const start = new Date(day)
    const h = Math.floor(hourFloat)
    const m = Math.floor((hourFloat - h) * 4) * 15
    start.setHours(h, m, 0, 0)
    setTarget({ id: null, start, end: new Date(start.getTime() + 3600000) })
  }

  const openEdit = (e: TimeEntry) => {
    if (isLocked(e)) return
    setTarget({
      id: e.id, start: new Date(e.start), end: e.end ? new Date(e.end) : new Date(),
      description: e.description, projectId: e.projectId, taskId: e.taskId, tagIds: e.tagIds, billable: e.billable,
    })
  }

  const label = view === 'week' ? weekLabel(anchor, settings.weekStart) : format(anchor, 'EEEE, MMM d, yyyy')
  const step = (n: number) => setAnchor(view === 'week' ? addWeeks(anchor, n) : addDays(anchor, n))

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[480px] flex-col">
      <PageHeader title="Calendar">
        <div className="flex rounded-sm border border-ck-border">
          {(['day', 'week'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('px-3 py-1.5 text-xs font-medium uppercase', view === v ? 'bg-ck-blue text-white' : 'hover:bg-ck-bg')}>{v}</button>
          ))}
        </div>
      </PageHeader>

      <div className="ck-card flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-ck-border-light px-4 py-3">
          <div className="flex items-center rounded-sm border border-ck-border">
            <button type="button" className="px-2 py-1.5 hover:bg-ck-bg" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={16} /></button>
            <span className="min-w-[200px] border-x border-ck-border px-3 py-1.5 text-center text-sm">{label}</span>
            <button type="button" className="px-2 py-1.5 hover:bg-ck-bg" onClick={() => step(1)} aria-label="Next"><ChevronRight size={16} /></button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <span className="ml-auto text-sm text-[#666]">
            Total: <span className="font-mono text-ck-text">{formatDuration(sumSeconds(entriesByDay.flat(), now), settings.durationFormat)}</span>
          </span>
        </div>

        {/* day headers */}
        <div className="flex border-b border-ck-border-light pr-[10px]">
          <div className="w-14 shrink-0" />
          {days.map((d, i) => (
            <div key={i} className={cn('min-w-0 flex-1 border-l border-ck-border-light px-1 py-2 text-center', isSameDay(d, today) && 'text-ck-blue')}>
              <div className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide">{format(d, 'EEE')}{dayLocked(d) && <Lock size={10} className="text-ck-muted" />}</div>
              <div className={cn('mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-base', isSameDay(d, today) && 'bg-ck-blue text-white')}>{format(d, 'd')}</div>
              <div className="mt-0.5 font-mono text-[11px] text-ck-muted">{formatDuration(sumSeconds(entriesByDay[i], now), 'compact')}</div>
              {timeOffByDay[i].map((r) => {
                const p = state.timeOffPolicies.find((x) => x.id === r.policyId)
                return (
                  <div key={r.id} className="mt-1 truncate rounded-sm px-1 py-0.5 text-[10px] text-white" style={{ background: p?.color ?? '#999' }} title={`${memberById(r.memberId)?.name}: ${p?.name}`}>
                    {memberById(r.memberId)?.name?.split(' ')[0]} · {p?.name}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* grid */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative flex" style={{ height: HOUR_PX * 24 }}>
            <div className="relative w-14 shrink-0">
              {HOURS.map((h) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-ck-muted" style={{ top: h * HOUR_PX }}>
                  {h === 0 ? '' : settings.timeFormat === '24' ? `${String(h).padStart(2, '0')}:00` : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}
                </div>
              ))}
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                className={cn('relative flex-1 border-l border-ck-border-light', isSameDay(d, today) && 'bg-ck-blue-light/20', dayLocked(d) && 'bg-ck-bg/60')}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-entry]')) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  openNew(d, (e.clientY - rect.top) / HOUR_PX)
                }}
              >
                {HOURS.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-ck-border-light" style={{ top: h * HOUR_PX }} />
                ))}
                {isSameDay(d, today) && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-ck-red" style={{ top: ((today.getHours() * 60 + today.getMinutes()) / 60) * HOUR_PX }}>
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-ck-red" />
                  </div>
                )}
                {layoutDay(entriesByDay[i], now).map(({ entry, col, cols }) => {
                  const s = new Date(entry.start)
                  const secs = entrySeconds(entry, now)
                  const top = ((s.getHours() * 60 + s.getMinutes()) / 60) * HOUR_PX
                  const height = Math.max(18, (secs / 3600) * HOUR_PX)
                  const p = projectById(entry.projectId)
                  const color = p?.color ?? '#999'
                  const running = entry.end === null
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      data-entry
                      onClick={() => openEdit(entry)}
                      className={cn('absolute overflow-hidden rounded-sm border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:z-20 hover:shadow-md', running && 'ck-pulse', isLocked(entry) && 'cursor-default opacity-70')}
                      style={{
                        top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`,
                        background: `${color}22`, borderColor: color, color: '#333',
                      }}
                      title={`${entry.description || '(no description)'} · ${formatDuration(secs)}`}
                    >
                      <div className="truncate font-medium">{entry.description || <span className="text-ck-muted">(no description)</span>}</div>
                      {height > 30 && <div className="truncate" style={{ color }}>{p?.name ?? 'No project'}</div>}
                      {height > 44 && <div className="truncate text-ck-muted">{formatTime(s, settings.timeFormat)} – {entry.end ? formatTime(new Date(entry.end), settings.timeFormat) : 'now'} · {formatDuration(secs, 'compact')}</div>}
                      {height > 58 && entry.tagIds.length > 0 && <div className="truncate text-ck-muted">{entry.tagIds.map((t) => tagById(t)?.name).filter(Boolean).join(', ')}</div>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <EntryModal target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

/** Simple overlap layout: assigns overlapping entries to side-by-side columns. */
function layoutDay(entries: TimeEntry[], now: number) {
  const items = [...entries]
    .map((e) => ({ entry: e, s: new Date(e.start).getTime(), e: e.end ? new Date(e.end).getTime() : now }))
    .sort((a, b) => a.s - b.s)
  const result: { entry: TimeEntry; col: number; cols: number }[] = []
  let cluster: typeof items = []
  let clusterEnd = -1
  const flush = () => {
    if (!cluster.length) return
    const colEnds: number[] = []
    const placed = cluster.map((it) => {
      let col = colEnds.findIndex((end) => end <= it.s)
      if (col === -1) { col = colEnds.length; colEnds.push(it.e) } else colEnds[col] = it.e
      return { entry: it.entry, col }
    })
    for (const p of placed) result.push({ ...p, cols: colEnds.length })
    cluster = []
  }
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.e)
  }
  flush()
  return result
}

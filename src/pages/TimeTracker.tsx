import { useEffect, useMemo, useState } from 'react'
import { Calendar as CalendarIcon, CheckSquare, Copy, DollarSign, List, Lock, MoreVertical, Play, Scissors, Square, Trash2, Clock, X } from 'lucide-react'
import { startOfWeek } from 'date-fns'
import { useStore } from '../store'
import { Button, Popover, cn } from '../components/ui'
import { ProjectMenu, ProjectPicker } from '../components/ProjectPicker'
import { TagPicker } from '../components/TagPicker'
import {
  dayLabel, entrySeconds, formatDuration, formatTime, fromDateKey, pad, parseDuration, parseTimeInput, sumSeconds, toDateKey, weekLabel,
} from '../lib/time'
import type { TimeEntry } from '../types'

type Mode = 'timer' | 'manual'

export default function TimeTracker() {
  const { state, running, now, startTimer, stopTimer, updateEntry, addEntry, missingFields, isLocked, dispatch } = useStore()
  const { settings } = state
  const [mode, setMode] = useState<Mode>('timer')

  const [description, setDescription] = useState('')
  const [project, setProject] = useState<{ projectId: string | null; taskId: string | null }>({ projectId: null, taskId: null })
  const [tagIds, setTagIds] = useState<string[]>([])
  const [billable, setBillable] = useState(settings.billableByDefault)

  const [date, setDate] = useState(toDateKey(new Date()))
  const [startStr, setStartStr] = useState(() => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` })
  const [endStr, setEndStr] = useState(() => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` })
  const [durStr, setDurStr] = useState('00:00:00')

  const draft = running
    ? { description: running.description, project: { projectId: running.projectId, taskId: running.taskId }, tagIds: running.tagIds, billable: running.billable }
    : { description, project, tagIds, billable }

  const setDraft = {
    description: (v: string) => (running ? updateEntry(running.id, { description: v }) : setDescription(v)),
    project: (v: { projectId: string | null; taskId: string | null }) => (running ? updateEntry(running.id, v) : setProject(v)),
    tagIds: (v: string[]) => (running ? updateEntry(running.id, { tagIds: v }) : setTagIds(v)),
    billable: (v: boolean) => (running ? updateEntry(running.id, { billable: v }) : setBillable(v)),
  }

  const draftEntry = { description, projectId: project.projectId, taskId: project.taskId, tagIds, billable }
  const missing = running ? null : missingFields(draftEntry)
  const reset = () => { setDescription(''); setProject({ projectId: null, taskId: null }); setTagIds([]); setBillable(settings.billableByDefault) }

  const start = () => {
    if (missing) return
    startTimer(draftEntry)
    reset()
  }

  const manualBase = fromDateKey(date)
  const mStart = parseTimeInput(startStr, manualBase)
  let mEnd = parseTimeInput(endStr, manualBase)
  if (mStart && mEnd && mEnd < mStart) mEnd = new Date(mEnd.getTime() + 86400000)
  useEffect(() => {
    if (mode !== 'manual') return
    if (mStart && mEnd) setDurStr(formatDuration((mEnd.getTime() - mStart.getTime()) / 1000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStr, endStr, date, mode])

  const onDurationCommit = () => {
    const secs = parseDuration(durStr)
    if (secs == null || !mStart) { setDurStr(mStart && mEnd ? formatDuration((mEnd.getTime() - mStart.getTime()) / 1000) : '00:00:00'); return }
    const e = new Date(mStart.getTime() + secs * 1000)
    setEndStr(`${pad(e.getHours())}:${pad(e.getMinutes())}`)
    setDurStr(formatDuration(secs))
  }

  const manualLocked = !!settings.lockBefore && date < settings.lockBefore
  const canAdd = !!mStart && !!mEnd && mEnd.getTime() > mStart.getTime() && !missing && !manualLocked
  const addManual = () => {
    if (!canAdd) return
    addEntry({ ...draftEntry, start: mStart!, end: mEnd! })
    reset()
  }

  const groups = useMemo(() => {
    const finished = [...state.entries].filter((e) => e.end !== null).sort((a, b) => b.start.localeCompare(a.start))
    const weeks: { key: string; label: string; days: { key: string; entries: TimeEntry[] }[] }[] = []
    for (const e of finished) {
      const d = new Date(e.start)
      const wk = toDateKey(startOfWeek(d, { weekStartsOn: settings.weekStart }))
      let w = weeks.find((x) => x.key === wk)
      if (!w) { w = { key: wk, label: weekLabel(d, settings.weekStart), days: [] }; weeks.push(w) }
      const dk = toDateKey(d)
      let day = w.days.find((x) => x.key === dk)
      if (!day) { day = { key: dk, entries: [] }; w.days.push(day) }
      day.entries.push(e)
    }
    return weeks
  }, [state.entries, settings.weekStart])

  const [visibleWeeks, setVisibleWeeks] = useState(3)

  // bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected((s) => { const ids = new Set(state.entries.map((e) => e.id)); const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n })
  }, [state.entries])
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectDay = (entries: TimeEntry[]) => setSelected((s) => {
    const n = new Set(s)
    const editable = entries.filter((e) => !isLocked(e))
    const all = editable.every((e) => n.has(e.id))
    for (const e of editable) all ? n.delete(e.id) : n.add(e.id)
    return n
  })
  const ids = [...selected]
  const bulk = (patch: Partial<TimeEntry>) => dispatch({ type: 'entry/updateMany', ids, patch })

  return (
    <div className="space-y-5">
      {/* ── Timer bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-30">
        <div className="ck-card flex flex-wrap items-center gap-2 p-2 md:flex-nowrap">
          <input
            className="h-10 min-w-[160px] flex-1 basis-full bg-transparent px-3 text-base outline-none md:basis-auto"
            placeholder={mode === 'timer' ? 'What are you working on?' : 'What have you worked on?'}
            value={draft.description}
            onChange={(e) => setDraft.description(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (mode === 'timer') { if (!running) start() } else addManual() } }}
          />
          <div className="flex min-w-0 items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
            <ProjectPicker value={draft.project} onChange={setDraft.project} className="min-w-0" />
          </div>
          <div className="flex items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
            <TagPicker value={draft.tagIds} onChange={setDraft.tagIds} align="right" />
            <button
              type="button"
              title={draft.billable ? 'Billable' : 'Non-billable'}
              onClick={() => setDraft.billable(!draft.billable)}
              className={cn('flex h-8 w-8 items-center justify-center rounded-sm', draft.billable ? 'text-ck-blue' : 'text-ck-muted hover:text-ck-text')}
            >
              <DollarSign size={18} />
            </button>
          </div>

          {mode === 'timer' ? (
            <>
              <div className="ml-auto min-w-[96px] px-2 text-center font-mono text-lg tabular-nums md:border-l md:border-ck-border-light">
                {running ? formatDuration(entrySeconds(running, now)) : '00:00:00'}
              </div>
              {running ? (
                <Button variant="danger" className="w-24" onClick={stopTimer}>Stop</Button>
              ) : (
                <Button className="w-24" onClick={start} disabled={!!missing} title={missing ?? undefined}>Start</Button>
              )}
            </>
          ) : (
            <>
              <div className="ml-auto flex items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
                <input className="h-8 w-16 rounded-sm border border-transparent bg-transparent text-center outline-none hover:border-ck-border focus:border-ck-blue" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
                <span className="text-ck-muted">-</span>
                <input className="h-8 w-16 rounded-sm border border-transparent bg-transparent text-center outline-none hover:border-ck-border focus:border-ck-blue" value={endStr} onChange={(e) => setEndStr(e.target.value)} />
                <label className="relative ml-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm text-ck-muted hover:bg-black/5" title={date}>
                  <CalendarIcon size={18} />
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
              <input
                className="h-8 w-24 rounded-sm border border-transparent bg-transparent text-center font-mono text-base outline-none hover:border-ck-border focus:border-ck-blue"
                value={durStr}
                onChange={(e) => setDurStr(e.target.value)}
                onBlur={onDurationCommit}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), addManual())}
              />
              <Button className="w-24" onClick={addManual} disabled={!canAdd} title={missing ?? (manualLocked ? 'This date is locked' : undefined)}>Add</Button>
            </>
          )}

          <div className="flex flex-col gap-0.5 border-l border-ck-border-light pl-2">
            <button type="button" title="Timer" onClick={() => setMode('timer')} className={cn('rounded-sm p-0.5', mode === 'timer' ? 'text-ck-blue' : 'text-ck-muted hover:text-ck-text')} disabled={!!running}>
              <Clock size={14} />
            </button>
            <button type="button" title="Manual" onClick={() => setMode('manual')} className={cn('rounded-sm p-0.5', mode === 'manual' ? 'text-ck-blue' : 'text-ck-muted hover:text-ck-text')} disabled={!!running}>
              <List size={14} />
            </button>
          </div>
        </div>
        {(missing || (mode === 'manual' && manualLocked)) && (
          <div className="mt-1 px-2 text-xs text-amber-700">{missing ?? `Entries before ${settings.lockBefore} are locked.`}</div>
        )}
      </div>

      {/* ── Bulk edit toolbar ─────────────────────────────────── */}
      {ids.length > 0 && (
        <div className="ck-card ck-fade-in flex flex-wrap items-center gap-2 border-ck-blue px-3 py-2 text-sm">
          <CheckSquare size={16} className="text-ck-blue" />
          <span className="font-medium">{ids.length} selected</span>
          <span className="mx-1 hidden h-5 w-px bg-ck-border-light sm:block" />
          <Popover width={320} trigger={() => <button type="button" className="rounded-sm border border-ck-border px-2.5 py-1 hover:bg-ck-bg">Change project</button>}>
            {(close) => <ProjectMenu value={{ projectId: null, taskId: null }} onChange={(v) => { bulk(v); close() }} />}
          </Popover>
          <div className="rounded-sm border border-ck-border">
            <TagPicker value={[]} onChange={(t) => { const tag = t[0]; if (!tag) return; for (const id of ids) { const e = state.entries.find((x) => x.id === id); if (e && !e.tagIds.includes(tag)) updateEntry(id, { tagIds: [...e.tagIds, tag] }) } }} />
          </div>
          <button type="button" className="rounded-sm border border-ck-border px-2.5 py-1 hover:bg-ck-bg" onClick={() => bulk({ billable: true })}>Set billable</button>
          <button type="button" className="rounded-sm border border-ck-border px-2.5 py-1 hover:bg-ck-bg" onClick={() => bulk({ billable: false })}>Set non-billable</button>
          <button type="button" className="rounded-sm border border-ck-red px-2.5 py-1 text-ck-red hover:bg-red-50" onClick={() => { if (confirm(`Delete ${ids.length} time entries?`)) { dispatch({ type: 'entry/deleteMany', ids }); setSelected(new Set()) } }}>Delete</button>
          <button type="button" className="ml-auto inline-flex items-center gap-1 text-ck-muted hover:text-ck-text" onClick={() => setSelected(new Set())}><X size={14} /> Clear</button>
        </div>
      )}

      {/* ── Entries ───────────────────────────────────────────── */}
      {groups.length === 0 && (
        <div className="ck-card px-6 py-16 text-center">
          <div className="text-base text-[#666]">No time entries yet</div>
          <div className="mt-1 text-sm text-ck-muted">Start the timer or add time manually to see your entries here.</div>
        </div>
      )}
      {groups.slice(0, visibleWeeks).map((w) => (
        <section key={w.key} className="space-y-3">
          <div className="flex items-center justify-between px-1 text-sm text-[#666]">
            <span className="font-medium">{w.label}</span>
            <span>
              Week total: <span className="font-mono text-ck-text">{formatDuration(sumSeconds(w.days.flatMap((d) => d.entries)), settings.durationFormat)}</span>
            </span>
          </div>
          {w.days.map((d) => (
            <div key={d.key} className="ck-card overflow-visible">
              <div className="flex items-center gap-3 border-b border-ck-border-light bg-ck-bg/60 px-3 py-2 text-sm text-[#666]">
                <input type="checkbox" className="accent-ck-blue" title="Select day" checked={d.entries.filter((e) => !isLocked(e)).length > 0 && d.entries.filter((e) => !isLocked(e)).every((e) => selected.has(e.id))} onChange={() => selectDay(d.entries)} />
                <span className="font-medium">{dayLabel(d.key)}</span>
                <span className="ml-auto">
                  Total: <span className="font-mono text-ck-text">{formatDuration(sumSeconds(d.entries), settings.durationFormat)}</span>
                </span>
              </div>
              {d.entries.map((e) => <EntryRow key={e.id} entry={e} selected={selected.has(e.id)} onToggle={() => toggle(e.id)} />)}
            </div>
          ))}
        </section>
      ))}
      {groups.length > visibleWeeks && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setVisibleWeeks((v) => v + 3)}>Load more</Button>
        </div>
      )}
    </div>
  )
}

function EntryRow({ entry, selected, onToggle }: { entry: TimeEntry; selected: boolean; onToggle: () => void }) {
  const { state, updateEntry, deleteEntry, continueEntry, addEntry, isLocked } = useStore()
  const { settings } = state
  const locked = isLocked(entry)
  const invoiced = !!entry.invoiceId
  const readOnly = locked
  const [desc, setDesc] = useState(entry.description)
  useEffect(() => setDesc(entry.description), [entry.description])

  const start = new Date(entry.start)
  const end = new Date(entry.end!)
  const secs = entrySeconds(entry)

  const [startStr, setStartStr] = useState(formatTime(start, settings.timeFormat))
  const [endStr, setEndStr] = useState(formatTime(end, settings.timeFormat))
  const [durStr, setDurStr] = useState(formatDuration(secs, settings.durationFormat))
  useEffect(() => {
    setStartStr(formatTime(start, settings.timeFormat))
    setEndStr(formatTime(end, settings.timeFormat))
    setDurStr(formatDuration(secs, settings.durationFormat))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.start, entry.end, settings.timeFormat, settings.durationFormat])

  const commitStart = () => {
    const s = parseTimeInput(startStr, start)
    if (!s) return setStartStr(formatTime(start, settings.timeFormat))
    updateEntry(entry.id, { start: s.toISOString(), end: new Date(s.getTime() + secs * 1000).toISOString() })
  }
  const commitEnd = () => {
    let e = parseTimeInput(endStr, start)
    if (!e) return setEndStr(formatTime(end, settings.timeFormat))
    if (e.getTime() < start.getTime()) e = new Date(e.getTime() + 86400000)
    updateEntry(entry.id, { end: e.toISOString() })
  }
  const commitDuration = () => {
    const d = parseDuration(durStr)
    if (d == null) return setDurStr(formatDuration(secs, settings.durationFormat))
    updateEntry(entry.id, { end: new Date(start.getTime() + d * 1000).toISOString() })
  }
  const commitDate = (key: string) => {
    if (!key) return
    if (settings.lockBefore && key < settings.lockBefore) return alert(`Dates before ${settings.lockBefore} are locked.`)
    const base = fromDateKey(key)
    const s = new Date(base); s.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0)
    updateEntry(entry.id, { start: s.toISOString(), end: new Date(s.getTime() + secs * 1000).toISOString() })
  }
  const split = () => {
    const input = prompt('Split at time (e.g. 14:30):', formatTime(new Date((start.getTime() + end.getTime()) / 2), settings.timeFormat))
    if (input == null) return
    const at = parseTimeInput(input, start)
    if (!at || at <= start || at >= end) return alert('The split time must be between the start and end of the entry.')
    updateEntry(entry.id, { end: at.toISOString() })
    addEntry({ description: entry.description, projectId: entry.projectId, taskId: entry.taskId, tagIds: entry.tagIds, billable: entry.billable, start: at, end })
  }

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur()
  const timeInput = 'h-8 w-[66px] rounded-sm border border-transparent bg-transparent text-center text-sm outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent'

  return (
    <div className={cn('group flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ck-border-light px-3 py-1.5 last:border-b-0 md:flex-nowrap', selected && 'bg-ck-blue-light/40', readOnly && 'bg-ck-bg/30')}>
      <input type="checkbox" className="accent-ck-blue" checked={selected} disabled={readOnly} onChange={onToggle} title={readOnly ? 'Locked' : 'Select'} />
      <input
        className="h-9 min-w-[140px] flex-1 basis-full rounded-sm border border-transparent bg-transparent px-2 text-sm outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent md:basis-auto"
        placeholder="Add description"
        value={desc}
        disabled={readOnly}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => desc !== entry.description && updateEntry(entry.id, { description: desc })}
        onKeyDown={blurOnEnter}
      />
      {locked && <span title={`Locked (before ${settings.lockBefore})`} className="text-ck-muted"><Lock size={14} /></span>}
      {invoiced && <span className="rounded-sm bg-green-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-700" title="On an invoice">invoiced</span>}
      <ProjectPicker value={{ projectId: entry.projectId, taskId: entry.taskId }} onChange={(v) => updateEntry(entry.id, v)} className="min-w-0 max-w-[260px]" disabled={readOnly} />
      <div className="flex items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
        {readOnly ? <span className="px-2 text-xs text-ck-muted">{entry.tagIds.length ? entry.tagIds.map((t) => state.tags.find((x) => x.id === t)?.name).filter(Boolean).join(', ') : ''}</span> : <TagPicker value={entry.tagIds} onChange={(tagIds) => updateEntry(entry.id, { tagIds })} align="right" />}
        <button
          type="button"
          title={entry.billable ? 'Billable' : 'Non-billable'}
          disabled={readOnly}
          onClick={() => updateEntry(entry.id, { billable: !entry.billable })}
          className={cn('flex h-8 w-8 items-center justify-center rounded-sm', entry.billable ? 'text-ck-blue' : 'text-ck-muted hover:text-ck-text')}
        >
          <DollarSign size={16} />
        </button>
      </div>
      <div className="flex items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
        <input className={timeInput} disabled={readOnly} value={startStr} onChange={(e) => setStartStr(e.target.value)} onBlur={commitStart} onKeyDown={blurOnEnter} />
        <span className="text-ck-muted">-</span>
        <input className={timeInput} disabled={readOnly} value={endStr} onChange={(e) => setEndStr(e.target.value)} onBlur={commitEnd} onKeyDown={blurOnEnter} />
        <label className={cn('relative flex h-8 w-8 items-center justify-center rounded-sm text-ck-muted', !readOnly && 'cursor-pointer hover:bg-black/5')} title={toDateKey(start)}>
          <CalendarIcon size={16} />
          {!readOnly && <input type="date" value={toDateKey(start)} onChange={(e) => commitDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />}
        </label>
      </div>
      <input
        className="h-8 w-[88px] rounded-sm border border-transparent bg-transparent text-center font-mono text-sm outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent"
        disabled={readOnly}
        value={durStr}
        onChange={(e) => setDurStr(e.target.value)}
        onBlur={commitDuration}
        onKeyDown={blurOnEnter}
      />
      <div className="flex items-center">
        <button type="button" title="Continue" onClick={() => continueEntry(entry)} className="flex h-8 w-8 items-center justify-center rounded-full text-ck-muted hover:text-ck-blue">
          <Play size={16} fill="currentColor" />
        </button>
        <Popover
          align="right"
          width={170}
          trigger={() => (
            <button type="button" title="More" className="flex h-8 w-8 items-center justify-center rounded-full text-ck-muted hover:bg-black/5 hover:text-ck-text">
              <MoreVertical size={16} />
            </button>
          )}
        >
          {(close) => (
            <div className="py-1 text-sm">
              <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-ck-bg" onClick={() => { addEntry({ description: entry.description, projectId: entry.projectId, taskId: entry.taskId, tagIds: entry.tagIds, billable: entry.billable, start, end }); close() }}>
                <Copy size={14} /> Duplicate
              </button>
              <button type="button" disabled={readOnly} className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-ck-bg disabled:opacity-40" onClick={() => { split(); close() }}>
                <Scissors size={14} /> Split
              </button>
              <button type="button" disabled={readOnly} className="flex w-full items-center gap-2 px-3 py-1.5 text-ck-red hover:bg-ck-bg disabled:opacity-40" onClick={() => { if (confirm('Delete this time entry?')) deleteEntry(entry.id); close() }}>
                <Trash2 size={14} /> Delete
              </button>
              {readOnly && <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-ck-muted"><Square size={12} /> Locked entry</div>}
            </div>
          )}
        </Popover>
      </div>
    </div>
  )
}

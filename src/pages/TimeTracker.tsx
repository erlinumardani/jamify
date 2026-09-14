import { useEffect, useMemo, useState } from 'react'
import { Calendar as CalendarIcon, CheckSquare, Clock, Copy, DollarSign, List, Lock, MoreVertical, Play, Scissors, Trash2, X } from 'lucide-react'
import { format, startOfWeek } from 'date-fns'
import { useStore } from '../store'
import { useFeedback } from '../components/feedback'
import { Button, EmptyState, Field, IconButton, Modal, Popover, cn } from '../components/ui'
import { ProjectMenu, ProjectPicker } from '../components/ProjectPicker'
import { TagPicker } from '../components/TagPicker'
import {
  dayLabel, entrySeconds, formatDuration, formatTime, fromDateKey, pad, parseDuration, parseTimeInput, sumSeconds, toDateKey, weekLabel,
} from '../lib/time'
import type { TimeEntry } from '../types'

type Mode = 'timer' | 'manual'

const countLabel = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`

export default function TimeTracker() {
  const { state, myEntries, running, now, startTimer, stopTimer, updateEntry, addEntry, missingFields, isLocked, tagById, dispatch } = useStore()
  const { confirm, notify } = useFeedback()
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
  const manualError = mode !== 'manual' ? null
    : !mStart || !mEnd ? 'Enter start and end times like 09:00 or 9:30 am.'
    : mEnd.getTime() <= mStart.getTime() ? 'The end time must be after the start time.'
    : manualLocked ? `Entries before ${settings.lockBefore} are locked. Pick a later date.`
    : null
  const barMessage = missing ?? manualError
  const canAdd = !missing && !manualError
  const addManual = () => {
    if (!canAdd) return
    addEntry({ ...draftEntry, start: mStart!, end: mEnd! })
    reset()
    notify('Time entry added')
  }

  const groups = useMemo(() => {
    const finished = [...myEntries].filter((e) => e.end !== null).sort((a, b) => b.start.localeCompare(a.start))
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
  }, [myEntries, settings.weekStart])

  const [visibleWeeks, setVisibleWeeks] = useState(3)

  // bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected((s) => { const ids = new Set(myEntries.map((e) => e.id)); const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n })
  }, [myEntries])
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectDay = (entries: TimeEntry[]) => setSelected((s) => {
    const n = new Set(s)
    const editable = entries.filter((e) => !isLocked(e))
    const all = editable.every((e) => n.has(e.id))
    for (const e of editable) all ? n.delete(e.id) : n.add(e.id)
    return n
  })
  const ids = [...selected]
  const bulk = (patch: Partial<TimeEntry>, message: string) => {
    dispatch({ type: 'entry/updateMany', ids, patch })
    notify(message)
  }
  const bulkTag = (t: string[]) => {
    const tag = t[0]
    if (!tag) return
    for (const id of ids) { const e = myEntries.find((x) => x.id === id); if (e && !e.tagIds.includes(tag)) updateEntry(id, { tagIds: [...e.tagIds, tag] }) }
    notify(`Tag "${tagById(tag)?.name ?? 'tag'}" added to ${countLabel(ids.length)}`)
  }
  const bulkDelete = async () => {
    const n = ids.length
    const ok = await confirm({
      title: `Delete ${countLabel(n)}?`,
      message: `The selected time entries are removed from your timesheet and reports.`,
      confirmLabel: `Delete ${countLabel(n)}`,
      danger: true,
    })
    if (!ok) return
    const removed = myEntries.filter((e) => ids.includes(e.id))
    dispatch({ type: 'entry/deleteMany', ids })
    setSelected(new Set())
    notify(`${countLabel(n)} deleted`, { action: { label: 'Undo', onClick: () => dispatch({ type: 'entry/addMany', entries: removed }) } })
  }

  const modeBtn = (m: Mode) => cn(
    'flex h-8 w-8 items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-40 md:h-5 md:w-6',
    mode === m ? 'text-ck-blue' : 'text-ck-muted hover:text-ck-text',
  )
  const barInput = 'h-8 rounded-sm border border-transparent bg-transparent text-center outline-none hover:border-ck-border focus:border-ck-blue aria-[invalid=true]:border-ck-red'
  const toolbarBtn = 'h-8 rounded-sm border border-ck-border px-2.5 hover:bg-ck-bg'

  return (
    <div className="space-y-5">
      {/* ── Timer bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-30">
        <div className="ck-card flex flex-wrap items-center gap-2 p-2 md:flex-nowrap">
          <input
            aria-label={mode === 'timer' ? 'What are you working on?' : 'What have you worked on?'}
            className="h-10 min-w-0 flex-1 basis-full bg-transparent px-3 text-base outline-none md:min-w-[160px] md:basis-auto"
            placeholder={mode === 'timer' ? 'What are you working on?' : 'What have you worked on?'}
            value={draft.description}
            onChange={(e) => setDraft.description(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (mode === 'timer') { if (!running) start() } else addManual() } }}
          />
          <div className="flex min-w-0 flex-auto items-center gap-1 md:flex-initial md:border-l md:border-ck-border-light md:pl-2">
            <ProjectPicker value={draft.project} onChange={setDraft.project} className="min-w-0" />
          </div>
          <div className="flex items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
            <TagPicker value={draft.tagIds} onChange={setDraft.tagIds} align="right" />
            <button
              type="button"
              title={draft.billable ? 'Billable' : 'Non-billable'}
              aria-label="Billable"
              aria-pressed={draft.billable}
              onClick={() => setDraft.billable(!draft.billable)}
              className={cn('flex h-8 w-8 items-center justify-center rounded-sm', draft.billable ? 'text-ck-blue' : 'text-ck-muted hover:text-ck-text')}
            >
              <DollarSign size={18} aria-hidden="true" />
            </button>
          </div>

          {mode === 'timer' ? (
            <div className="ml-auto flex items-center gap-2 md:border-l md:border-ck-border-light md:pl-2">
              <div role="timer" aria-label="Elapsed time" className="min-w-[96px] px-2 text-center font-mono text-lg tabular-nums">
                {running ? formatDuration(entrySeconds(running, now)) : '00:00:00'}
              </div>
              {running ? (
                <Button variant="danger" className="w-24" onClick={stopTimer}>Stop</Button>
              ) : (
                <Button className="w-24" onClick={start} disabled={!!missing} title={missing ?? undefined}>Start</Button>
              )}
            </div>
          ) : (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 md:flex-nowrap md:border-l md:border-ck-border-light md:pl-2">
              <div className="flex items-center gap-1">
                <input aria-label="Start time" aria-invalid={!mStart || undefined} className={cn(barInput, 'w-16')} value={startStr} onChange={(e) => setStartStr(e.target.value)} />
                <span className="text-ck-muted" aria-hidden="true">-</span>
                <input aria-label="End time" aria-invalid={!mEnd || undefined} className={cn(barInput, 'w-16')} value={endStr} onChange={(e) => setEndStr(e.target.value)} />
                <label className={cn('relative ml-1 flex h-8 min-w-8 cursor-pointer items-center justify-center gap-1 rounded-sm px-1.5 hover:bg-black/5', manualLocked ? 'text-ck-red' : 'text-ck-muted')} title={format(manualBase, 'EEE, MMM d, yyyy')}>
                  <CalendarIcon size={18} aria-hidden="true" />
                  {date !== toDateKey(new Date()) && <span className="text-xs">{format(manualBase, 'MMM d')}</span>}
                  <input type="date" aria-label="Date" min={settings.lockBefore ?? undefined} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
              <input
                aria-label="Duration"
                className={cn(barInput, 'w-24 font-mono text-base tabular-nums')}
                value={durStr}
                onChange={(e) => setDurStr(e.target.value)}
                onBlur={onDurationCommit}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), addManual())}
              />
              <Button className="w-24" onClick={addManual} disabled={!canAdd} title={barMessage ?? undefined}>Add</Button>
            </div>
          )}

          <div role="group" aria-label="Entry mode" className="flex gap-0.5 border-l border-ck-border-light pl-2 md:flex-col" title={running ? 'Stop the timer to switch modes' : undefined}>
            <button type="button" aria-label="Timer mode" aria-pressed={mode === 'timer'} title="Timer" onClick={() => setMode('timer')} className={modeBtn('timer')} disabled={!!running}>
              <Clock size={14} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Manual mode" aria-pressed={mode === 'manual'} title="Manual" onClick={() => setMode('manual')} className={modeBtn('manual')} disabled={!!running}>
              <List size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        {barMessage && <div role="status" className="mt-1 px-2 text-xs text-amber-700">{barMessage}</div>}
      </div>

      {/* ── Bulk edit toolbar ─────────────────────────────────── */}
      {ids.length > 0 && (
        <div role="toolbar" aria-label="Bulk edit selected entries" className="ck-card ck-fade-in flex flex-wrap items-center gap-2 border-ck-blue px-3 py-2 text-sm">
          <CheckSquare size={16} className="text-ck-blue" aria-hidden="true" />
          <span className="font-medium">{ids.length} selected</span>
          <span className="mx-1 hidden h-5 w-px bg-ck-border-light sm:block" />
          <Popover width={320} trigger={(open) => <button type="button" aria-haspopup="true" aria-expanded={open} className={toolbarBtn}>Change project</button>}>
            {(close) => <ProjectMenu value={{ projectId: null, taskId: null }} onChange={(v) => { bulk(v, `Project changed on ${countLabel(ids.length)}`); close() }} />}
          </Popover>
          <div className="rounded-sm border border-ck-border">
            <TagPicker value={[]} onChange={bulkTag} placeholder="Add tag" />
          </div>
          <button type="button" className={toolbarBtn} onClick={() => bulk({ billable: true }, `${countLabel(ids.length)} marked billable`)}>Set billable</button>
          <button type="button" className={toolbarBtn} onClick={() => bulk({ billable: false }, `${countLabel(ids.length)} marked non-billable`)}>Set non-billable</button>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded-sm border border-ck-red px-2.5 text-ck-red hover:bg-red-50" onClick={bulkDelete}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
            <button type="button" className="inline-flex h-8 items-center gap-1 text-ck-muted hover:text-ck-text" onClick={() => setSelected(new Set())}>
              <X size={14} aria-hidden="true" /> Clear selection
            </button>
          </div>
        </div>
      )}

      {/* ── Entries ───────────────────────────────────────────── */}
      {groups.length === 0 && (
        <div className="ck-card">
          <EmptyState
            icon={<Clock size={40} />}
            title="No time entries yet"
            hint="Start the timer or add time manually, and your entries will show up here grouped by day."
            action={!running && mode === 'timer' ? <Button variant="outline" onClick={() => setMode('manual')}>Add time manually</Button> : undefined}
          />
        </div>
      )}
      {groups.slice(0, visibleWeeks).map((w) => (
        <section key={w.key} aria-label={w.label} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 px-1 text-sm text-[#666]">
            <h2 className="font-medium">{w.label}</h2>
            <span>
              Week total: <span className="font-mono tabular-nums text-ck-text">{formatDuration(sumSeconds(w.days.flatMap((d) => d.entries)), settings.durationFormat)}</span>
            </span>
          </div>
          {w.days.map((d) => {
            const editable = d.entries.filter((e) => !isLocked(e))
            return (
              <div key={d.key} className="ck-card overflow-visible">
                <div className="flex items-center gap-3 border-b border-ck-border-light bg-ck-bg/60 px-3 py-2 text-sm text-[#666]">
                  <input
                    type="checkbox"
                    className="accent-ck-blue disabled:cursor-not-allowed"
                    aria-label={`Select all entries on ${dayLabel(d.key)}`}
                    title={editable.length ? 'Select day' : 'Entries on this day are locked'}
                    disabled={!editable.length}
                    checked={editable.length > 0 && editable.every((e) => selected.has(e.id))}
                    onChange={() => selectDay(d.entries)}
                  />
                  <span className="font-medium">{dayLabel(d.key)}</span>
                  <span className="ml-auto">
                    Total: <span className="font-mono tabular-nums text-ck-text">{formatDuration(sumSeconds(d.entries), settings.durationFormat)}</span>
                  </span>
                </div>
                {d.entries.map((e) => <EntryRow key={e.id} entry={e} selected={selected.has(e.id)} onToggle={() => toggle(e.id)} />)}
              </div>
            )
          })}
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
  const { state, dispatch, updateEntry, deleteEntry, continueEntry, addEntry, isLocked } = useStore()
  const { notify } = useFeedback()
  const { settings } = state
  const locked = isLocked(entry)
  const invoiced = !!entry.invoiceId
  const readOnly = locked
  const lockReason = `Entries before ${settings.lockBefore} are locked and can't be edited`
  const [desc, setDesc] = useState(entry.description)
  useEffect(() => setDesc(entry.description), [entry.description])

  const start = new Date(entry.start)
  const end = new Date(entry.end!)
  const secs = entrySeconds(entry)
  const fmtTime = (d: Date) => formatTime(d, settings.timeFormat)

  const [startStr, setStartStr] = useState(fmtTime(start))
  const [endStr, setEndStr] = useState(fmtTime(end))
  const [durStr, setDurStr] = useState(formatDuration(secs, settings.durationFormat))
  useEffect(() => {
    setStartStr(fmtTime(start))
    setEndStr(fmtTime(end))
    setDurStr(formatDuration(secs, settings.durationFormat))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.start, entry.end, settings.timeFormat, settings.durationFormat])

  const badTime = (text: string) => notify(`"${text}" isn't a valid time. Try 14:30 or 2:30 pm.`, { tone: 'error' })
  const commitStart = () => {
    if (startStr === fmtTime(start)) return
    const s = parseTimeInput(startStr, start)
    if (!s) { badTime(startStr); return setStartStr(fmtTime(start)) }
    updateEntry(entry.id, { start: s.toISOString(), end: new Date(s.getTime() + secs * 1000).toISOString() })
  }
  const commitEnd = () => {
    if (endStr === fmtTime(end)) return
    let e = parseTimeInput(endStr, start)
    if (!e) { badTime(endStr); return setEndStr(fmtTime(end)) }
    if (e.getTime() < start.getTime()) e = new Date(e.getTime() + 86400000)
    updateEntry(entry.id, { end: e.toISOString() })
  }
  const commitDuration = () => {
    if (durStr === formatDuration(secs, settings.durationFormat)) return
    const d = parseDuration(durStr)
    if (d == null) {
      notify(`"${durStr}" isn't a valid duration. Try 1:30, 1h 30m or 1.5.`, { tone: 'error' })
      return setDurStr(formatDuration(secs, settings.durationFormat))
    }
    updateEntry(entry.id, { end: new Date(start.getTime() + d * 1000).toISOString() })
  }
  const commitDate = (key: string) => {
    if (!key) return
    if (settings.lockBefore && key < settings.lockBefore) return notify(`Dates before ${settings.lockBefore} are locked. Pick a later date.`, { tone: 'error' })
    const base = fromDateKey(key)
    const s = new Date(base); s.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0)
    updateEntry(entry.id, { start: s.toISOString(), end: new Date(s.getTime() + secs * 1000).toISOString() })
  }

  // split dialog
  const [splitStr, setSplitStr] = useState<string | null>(null)
  const [splitTried, setSplitTried] = useState(false)
  let splitAt = splitStr == null ? null : parseTimeInput(splitStr, start)
  if (splitAt && splitAt <= start && toDateKey(end) !== toDateKey(start)) splitAt = new Date(splitAt.getTime() + 86400000)
  const splitError = !splitAt ? 'Enter a time like 14:30' : splitAt <= start || splitAt >= end ? `Pick a time between ${fmtTime(start)} and ${fmtTime(end)}` : null
  const openSplit = () => { setSplitTried(false); setSplitStr(fmtTime(new Date((start.getTime() + end.getTime()) / 2))) }
  const split = () => {
    setSplitTried(true)
    if (!splitAt || splitError) return
    updateEntry(entry.id, { end: splitAt.toISOString() })
    addEntry({ description: entry.description, projectId: entry.projectId, taskId: entry.taskId, tagIds: entry.tagIds, billable: entry.billable, start: splitAt, end })
    setSplitStr(null)
    notify(`Entry split at ${fmtTime(splitAt)}`)
  }

  const duplicate = () => {
    addEntry({ description: entry.description, projectId: entry.projectId, taskId: entry.taskId, tagIds: entry.tagIds, billable: entry.billable, start, end })
    notify('Time entry duplicated')
  }
  const remove = () => {
    deleteEntry(entry.id)
    notify('Time entry deleted', { action: { label: 'Undo', onClick: () => dispatch({ type: 'entry/add', entry }) } })
  }

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur()
  const timeInput = 'h-8 w-[66px] rounded-sm border border-transparent bg-transparent text-center text-sm tabular-nums outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent'
  const menuItem = 'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ck-bg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className={cn('group flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ck-border-light px-3 py-1.5 last:border-b-0 md:flex-nowrap', selected && 'bg-ck-blue-light/40', readOnly && 'bg-ck-bg/40')}>
      <div className="flex min-w-0 basis-full items-center gap-2 md:flex-1 md:basis-auto">
        <input
          type="checkbox"
          className="accent-ck-blue disabled:cursor-not-allowed"
          checked={selected}
          disabled={readOnly}
          onChange={onToggle}
          aria-label={`Select entry ${entry.description || 'without description'}`}
          title={readOnly ? lockReason : 'Select'}
        />
        <input
          aria-label="Description"
          className="h-9 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-2 text-sm outline-none hover:border-ck-border focus:border-ck-blue disabled:cursor-default disabled:hover:border-transparent"
          placeholder={readOnly ? '(no description)' : 'Add description'}
          value={desc}
          disabled={readOnly}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== entry.description && updateEntry(entry.id, { description: desc })}
          onKeyDown={blurOnEnter}
        />
        {locked && <span title={lockReason} className="inline-flex shrink-0 items-center gap-1 text-xs text-ck-muted"><Lock size={12} aria-hidden="true" /> Locked</span>}
        {invoiced && <span className="shrink-0 rounded-sm bg-green-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-800" title="This entry is on an invoice">invoiced</span>}
      </div>
      <ProjectPicker value={{ projectId: entry.projectId, taskId: entry.taskId }} onChange={(v) => updateEntry(entry.id, v)} className="min-w-0 max-w-[260px]" disabled={readOnly} />
      <div className="flex items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
        <TagPicker value={entry.tagIds} onChange={(tagIds) => updateEntry(entry.id, { tagIds })} align="right" disabled={readOnly} />
        <button
          type="button"
          title={entry.billable ? 'Billable' : 'Non-billable'}
          aria-label="Billable"
          aria-pressed={entry.billable}
          disabled={readOnly}
          onClick={() => updateEntry(entry.id, { billable: !entry.billable })}
          className={cn('flex h-8 w-8 items-center justify-center rounded-sm disabled:cursor-default', entry.billable ? 'text-ck-blue' : 'text-ck-muted enabled:hover:text-ck-text')}
        >
          <DollarSign size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-1 md:border-l md:border-ck-border-light md:pl-2">
        <input aria-label="Start time" className={timeInput} disabled={readOnly} value={startStr} onChange={(e) => setStartStr(e.target.value)} onBlur={commitStart} onKeyDown={blurOnEnter} />
        <span className="text-ck-muted" aria-hidden="true">-</span>
        <input aria-label="End time" className={timeInput} disabled={readOnly} value={endStr} onChange={(e) => setEndStr(e.target.value)} onBlur={commitEnd} onKeyDown={blurOnEnter} />
        <label className={cn('relative flex h-8 w-8 items-center justify-center rounded-sm text-ck-muted', !readOnly && 'cursor-pointer hover:bg-black/5')} title={format(start, 'EEE, MMM d, yyyy')}>
          <CalendarIcon size={16} aria-hidden="true" />
          {!readOnly && <input type="date" aria-label="Change date" min={settings.lockBefore ?? undefined} value={toDateKey(start)} onChange={(e) => commitDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />}
        </label>
      </div>
      <input
        aria-label="Duration"
        className="h-8 w-[88px] rounded-sm border border-transparent bg-transparent text-center font-mono text-sm tabular-nums outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent"
        disabled={readOnly}
        value={durStr}
        onChange={(e) => setDurStr(e.target.value)}
        onBlur={commitDuration}
        onKeyDown={blurOnEnter}
      />
      <div className="ml-auto flex items-center md:ml-0">
        <button type="button" title="Continue timer" aria-label="Continue timer" onClick={() => continueEntry(entry)} className="flex h-8 w-8 items-center justify-center rounded-full text-ck-muted hover:bg-black/5 hover:text-ck-blue">
          <Play size={16} fill="currentColor" aria-hidden="true" />
        </button>
        <Popover
          align="right"
          width={220}
          trigger={(open) => (
            <IconButton title="More actions" aria-haspopup="true" aria-expanded={open}>
              <MoreVertical size={16} aria-hidden="true" />
            </IconButton>
          )}
        >
          {(close) => (
            <div className="py-1 text-sm">
              <button type="button" disabled={readOnly} title={readOnly ? lockReason : undefined} className={menuItem} onClick={() => { duplicate(); close() }}>
                <Copy size={14} aria-hidden="true" /> Duplicate
              </button>
              <button type="button" disabled={readOnly} title={readOnly ? lockReason : undefined} className={menuItem} onClick={() => { openSplit(); close() }}>
                <Scissors size={14} aria-hidden="true" /> Split
              </button>
              <div className="my-1 border-t border-ck-border-light" />
              <button type="button" disabled={readOnly} title={readOnly ? lockReason : undefined} className={cn(menuItem, 'text-ck-red')} onClick={() => { remove(); close() }}>
                <Trash2 size={14} aria-hidden="true" /> Delete
              </button>
              {readOnly && <div className="flex items-start gap-2 px-3 py-1.5 text-xs text-ck-muted"><Lock size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {lockReason}.</div>}
            </div>
          )}
        </Popover>
      </div>

      <Modal
        open={splitStr !== null}
        onClose={() => setSplitStr(null)}
        title="Split time entry"
        width={400}
        footer={<><Button variant="ghost" onClick={() => setSplitStr(null)}>Cancel</Button><Button onClick={split}>Split entry</Button></>}
      >
        <Field
          label="Split at"
          help={`Between ${fmtTime(start)} and ${fmtTime(end)}. The time after it becomes a new entry with the same details.`}
          error={splitTried ? splitError : null}
        >
          {(p) => <input {...p} autoFocus className="ck-input" value={splitStr ?? ''} onChange={(e) => setSplitStr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && split()} />}
        </Field>
      </Modal>
    </div>
  )
}

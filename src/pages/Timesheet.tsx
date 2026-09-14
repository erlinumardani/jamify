import { useMemo, useState, type ReactNode } from 'react'
import { addWeeks, format, isSameDay } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Lock, Plus, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore, uid } from '../store'
import { useFeedback } from '../components/feedback'
import { Badge, Button, EmptyState, PageHeader, Popover, cn } from '../components/ui'
import { ProjectLabel, ProjectMenu } from '../components/ProjectPicker'
import { formatDuration, parseDuration, sumSeconds, toDateKey, weekDays, weekLabel } from '../lib/time'
import type { TimeEntry } from '../types'

interface Row { projectId: string | null; taskId: string | null }
const rowKey = (r: Row) => `${r.projectId ?? ''}|${r.taskId ?? ''}`
const countLabel = (n: number) => `${n} time ${n === 1 ? 'entry' : 'entries'}`

export default function Timesheet() {
  const { state, myEntries, dispatch, addEntry, projectById, taskById, isLocked } = useStore()
  const { confirm, notify } = useFeedback()
  const { settings } = state
  const [anchor, setAnchor] = useState(() => new Date())
  const [extraRows, setExtraRows] = useState<Row[]>([])
  const days = useMemo(() => weekDays(anchor, settings.weekStart), [anchor, settings.weekStart])
  const today = new Date()
  const weekKey = toDateKey(days[0])
  const approval = state.approvals.find((a) => a.memberId === state.currentUserId && a.weekStart === weekKey)
  const dayLocked = (d: Date) => !!settings.lockBefore && toDateKey(d) < settings.lockBefore
  const weekLocked = days.every(dayLocked) || approval?.status === 'Approved' || approval?.status === 'Pending'
  const dayLockText = `Entries before ${settings.lockBefore} are locked`
  const weekLockText = approval?.status === 'Pending' ? 'Submitted and waiting for approval, so this week is read-only'
    : approval?.status === 'Approved' ? 'This week is approved and read-only'
    : dayLockText

  const weekEntries = useMemo(() => {
    const from = days[0].getTime()
    const to = days[6].getTime() + 86400000
    return myEntries.filter((e) => e.end !== null && new Date(e.start).getTime() >= from && new Date(e.start).getTime() < to)
  }, [myEntries, days])

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    for (const e of weekEntries) {
      const r = { projectId: e.projectId, taskId: e.taskId }
      map.set(rowKey(r), r)
    }
    for (const r of extraRows) map.set(rowKey(r), r)
    return [...map.values()].sort((a, b) => (projectById(a.projectId)?.name ?? 'zzz').localeCompare(projectById(b.projectId)?.name ?? 'zzz'))
  }, [weekEntries, extraRows, projectById])

  const rowName = (r: Row) => {
    const p = projectById(r.projectId)
    if (!p) return r.projectId ? 'Deleted project' : 'Without project'
    const t = taskById(r.projectId, r.taskId)
    return t ? `${p.name}: ${t.name}` : p.name
  }

  const cellEntries = (r: Row, day: Date): TimeEntry[] =>
    weekEntries.filter((e) => e.projectId === r.projectId && e.taskId === r.taskId && isSameDay(new Date(e.start), day))

  const setCell = (r: Row, day: Date, seconds: number) => {
    const existing = cellEntries(r, day)
    const current = sumSeconds(existing)
    if (seconds === current) return
    const description = existing[0]?.description ?? ''
    const billable = existing[0]?.billable ?? projectById(r.projectId)?.billable ?? settings.billableByDefault
    if (existing.length) dispatch({ type: 'entry/deleteMany', ids: existing.map((e) => e.id) })
    if (seconds > 0) {
      const start = new Date(day); start.setHours(9, 0, 0, 0)
      addEntry({ description, projectId: r.projectId, taskId: r.taskId, tagIds: existing[0]?.tagIds ?? [], billable, start, end: new Date(start.getTime() + seconds * 1000) })
    }
  }

  const addRow = (r: Row) => setExtraRows((rs) => [...rs, r])

  const removeRow = async (r: Row) => {
    const removed = weekEntries.filter((e) => e.projectId === r.projectId && e.taskId === r.taskId && !isLocked(e))
    if (removed.length) {
      const ok = await confirm({
        title: `Remove ${rowName(r)}?`,
        message: `This deletes the row's ${countLabel(removed.length)} for this week.`,
        confirmLabel: `Delete ${countLabel(removed.length)}`,
        danger: true,
      })
      if (!ok) return
      dispatch({ type: 'entry/deleteMany', ids: removed.map((e) => e.id) })
      notify(`${rowName(r)} removed from this week`, { action: { label: 'Undo', onClick: () => dispatch({ type: 'entry/addMany', entries: removed }) } })
    }
    setExtraRows((rs) => rs.filter((x) => rowKey(x) !== rowKey(r)))
  }

  const copyLastWeek = async () => {
    const prevDays = weekDays(addWeeks(anchor, -1), settings.weekStart)
    const from = prevDays[0].getTime(), to = prevDays[6].getTime() + 86400000
    const prev = myEntries.filter((e) => e.end !== null && new Date(e.start).getTime() >= from && new Date(e.start).getTime() < to)
    if (!prev.length) return notify('Last week has no time entries to copy', { tone: 'info' })
    const toCopy = prev.filter((e) => !dayLocked(addWeeks(new Date(e.start), 1)))
    if (!toCopy.length) return notify(`${dayLockText}, so nothing was copied`, { tone: 'error' })
    if (weekEntries.length) {
      const ok = await confirm({
        title: 'Copy last week?',
        message: `This week already has ${countLabel(weekEntries.length)}. Last week's ${countLabel(toCopy.length)} will be added on top of them.`,
        confirmLabel: `Copy ${countLabel(toCopy.length)}`,
      })
      if (!ok) return
    }
    for (const e of toCopy) {
      const s = new Date(e.start), en = new Date(e.end!)
      addEntry({ description: e.description, projectId: e.projectId, taskId: e.taskId, tagIds: e.tagIds, billable: e.billable, start: addWeeks(s, 1), end: addWeeks(en, 1) })
    }
    const skipped = prev.length - toCopy.length
    notify(`Copied ${countLabel(toCopy.length)} from last week${skipped ? ` (${skipped} on locked days skipped)` : ''}`)
  }

  const submit = () => {
    const submittedAt = new Date().toISOString()
    if (approval) dispatch({ type: 'col/update', col: 'approvals', id: approval.id, patch: { status: 'Pending', submittedAt, decidedAt: null } })
    else dispatch({ type: 'col/add', col: 'approvals', row: { id: uid(), memberId: state.currentUserId, weekStart: weekKey, status: 'Pending', note: '', submittedAt, decidedAt: null } })
    notify(approval ? 'Timesheet resubmitted for approval' : 'Timesheet submitted for approval')
  }
  const canSubmit = !approval || approval.status === 'Rejected'

  const dayTotals = days.map((d) => sumSeconds(weekEntries.filter((e) => isSameDay(new Date(e.start), d))))
  const weekTotal = sumSeconds(weekEntries)

  const rowPicker = (trigger: (open: boolean) => ReactNode) => (
    <Popover width={320} trigger={trigger}>
      {(close) => <ProjectMenu value={{ projectId: null, taskId: null }} onChange={(v) => { addRow(v); close() }} />}
    </Popover>
  )

  return (
    <div>
      <PageHeader title="Timesheet">
        {approval && (
          <Link to="/approvals" className="inline-flex items-center gap-2 text-sm">
            <Badge tone={approval.status === 'Approved' ? 'green' : approval.status === 'Rejected' ? 'red' : 'orange'}>{approval.status}</Badge>
            <span className="text-ck-blue hover:underline">View approvals</span>
          </Link>
        )}
        <Button variant="outline" size="sm" onClick={copyLastWeek} disabled={weekLocked} title={weekLocked ? weekLockText : undefined}>
          <Copy size={13} aria-hidden="true" /> Copy last week
        </Button>
        {canSubmit && (
          <Button size="sm" onClick={submit} disabled={weekTotal === 0} title={weekTotal === 0 ? 'Add time to this week before submitting it' : undefined}>
            <Send size={13} aria-hidden="true" /> {approval ? 'Resubmit' : 'Submit for approval'}
          </Button>
        )}
      </PageHeader>

      {approval?.status === 'Rejected' && (
        <div role="status" className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          This week was rejected{approval.note ? `: "${approval.note}"` : '.'} Fix your entries and resubmit.
        </div>
      )}

      <div className="ck-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ck-border-light px-4 py-3">
          <div className="flex items-center rounded-sm border border-ck-border">
            <button type="button" className="flex h-8 w-8 items-center justify-center hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, -1))} aria-label="Previous week"><ChevronLeft size={16} aria-hidden="true" /></button>
            <span aria-live="polite" className="min-w-[160px] border-x border-ck-border px-3 py-1.5 text-center text-sm sm:min-w-[180px]">{weekLabel(anchor, settings.weekStart)}</span>
            <button type="button" className="flex h-8 w-8 items-center justify-center hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label="Next week"><ChevronRight size={16} aria-hidden="true" /></button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          {weekLocked && (
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-ck-bg px-2 py-1 text-xs text-[#666]">
              <Lock size={12} aria-hidden="true" /> {weekLockText}
            </span>
          )}
          <span className="ml-auto text-sm text-[#666]">Week total: <span className="font-mono tabular-nums text-ck-text">{formatDuration(weekTotal, settings.durationFormat)}</span></span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={40} />}
            title="No time tracked this week"
            hint={weekLocked ? `${weekLockText}.` : 'Add a project row to fill in hours day by day, or copy last week.'}
            action={!weekLocked && rowPicker((open) => (
              <Button variant="outline" aria-haspopup="true" aria-expanded={open}><Plus size={14} aria-hidden="true" /> Add project row</Button>
            ))}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ck-table w-full min-w-[820px] border-collapse">
              <thead>
                <tr>
                  <th className="w-[280px]">Project</th>
                  {days.map((d) => (
                    <th key={d.toISOString()} className={cn('text-center', isSameDay(d, today) && 'text-ck-blue')}>
                      <div className="inline-flex items-center gap-1">
                        {format(d, 'EEE')}
                        {dayLocked(d) && <span title={dayLockText}><Lock size={10} className="text-ck-muted" aria-hidden="true" /><span className="sr-only">(locked)</span></span>}
                      </div>
                      <div className="font-normal normal-case tracking-normal">{format(d, 'MMM d')}</div>
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                  <th className="w-12"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rowSecs = sumSeconds(weekEntries.filter((e) => e.projectId === r.projectId && e.taskId === r.taskId))
                  const name = rowName(r)
                  return (
                    <tr key={rowKey(r)} className="hover:bg-ck-bg/40">
                      <td>
                        <div className="flex min-w-0 items-center gap-2">
                          {projectById(r.projectId)
                            ? <ProjectLabel projectId={r.projectId} taskId={r.taskId} />
                            : <span className="text-sm text-[#666]">{name}</span>}
                          {r.taskId && !taskById(r.projectId, r.taskId) && projectById(r.projectId) && <span className="text-xs text-ck-muted">(deleted task)</span>}
                        </div>
                      </td>
                      {days.map((d) => {
                        const locked = weekLocked || dayLocked(d)
                        return (
                          <td key={d.toISOString()} className={cn('p-1', isSameDay(d, today) && 'bg-ck-blue-light/40', dayLocked(d) && 'bg-ck-bg/60')}>
                            <Cell
                              label={`${name}, ${format(d, 'EEEE, MMM d')}`}
                              value={sumSeconds(cellEntries(r, d))}
                              onCommit={(s) => setCell(r, d, s)}
                              fmt={settings.durationFormat}
                              disabled={locked}
                              title={locked ? (weekLocked ? weekLockText : dayLockText) : undefined}
                            />
                          </td>
                        )
                      })}
                      <td className="text-right font-mono tabular-nums">{formatDuration(rowSecs, settings.durationFormat)}</td>
                      <td className="px-2 text-center">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ck-muted hover:bg-black/5 hover:text-ck-red disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ck-muted"
                          disabled={weekLocked}
                          onClick={() => removeRow(r)}
                          aria-label={`Remove ${name} row`}
                          title={weekLocked ? weekLockText : 'Remove row'}
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!weekLocked && (
                  <tr>
                    <td colSpan={10} className="py-1.5">
                      {rowPicker((open) => (
                        <button type="button" aria-haspopup="true" aria-expanded={open} className="inline-flex h-8 items-center gap-1 text-sm text-ck-blue hover:underline"><Plus size={14} aria-hidden="true" /> Select project</button>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-ck-bg/60 font-medium">
                  <td>Total</td>
                  {dayTotals.map((t, i) => <td key={i} className="text-center font-mono tabular-nums">{formatDuration(t, settings.durationFormat)}</td>)}
                  <td className="text-right font-mono tabular-nums">{formatDuration(weekTotal, settings.durationFormat)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-ck-muted">Tip: type durations like <code>1:30</code>, <code>1h 30m</code>, or <code>1.5</code>. Editing a cell replaces that day's entries for the project with a single entry starting at 09:00. Submitted and approved weeks are read-only.</p>
    </div>
  )
}

function Cell({ value, onCommit, fmt, disabled, label, title }: {
  value: number; onCommit: (s: number) => void; fmt: 'full' | 'compact' | 'decimal'; disabled?: boolean; label: string; title?: string
}) {
  const { notify } = useFeedback()
  const display = value ? formatDuration(value, fmt) : ''
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const secs = text.trim() === '' ? 0 : parseDuration(text)
    setText(null)
    if (secs == null) return notify(`"${text}" isn't a valid duration. Try 1:30, 1h 30m or 1.5.`, { tone: 'error' })
    onCommit(secs)
  }
  return (
    <input
      aria-label={label}
      title={title}
      className="h-9 w-full rounded-sm border border-transparent bg-transparent text-center font-mono text-sm tabular-nums outline-none hover:border-ck-border focus:border-ck-blue focus:bg-white disabled:cursor-not-allowed disabled:text-ck-muted disabled:hover:border-transparent"
      placeholder={disabled ? '' : '0:00'}
      disabled={disabled}
      value={text ?? display}
      onFocus={() => setText(display)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

import { useMemo, useState } from 'react'
import { addWeeks, format, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Lock, Plus, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore, uid } from '../store'
import { Badge, Button, PageHeader, Popover, cn } from '../components/ui'
import { ProjectLabel, ProjectMenu } from '../components/ProjectPicker'
import { formatDuration, parseDuration, sumSeconds, toDateKey, weekDays, weekLabel } from '../lib/time'
import type { TimeEntry } from '../types'

interface Row { projectId: string | null; taskId: string | null }
const rowKey = (r: Row) => `${r.projectId ?? ''}|${r.taskId ?? ''}`

export default function Timesheet() {
  const { state, dispatch, addEntry, projectById, taskById } = useStore()
  const { settings } = state
  const [anchor, setAnchor] = useState(() => new Date())
  const [extraRows, setExtraRows] = useState<Row[]>([])
  const days = useMemo(() => weekDays(anchor, settings.weekStart), [anchor, settings.weekStart])
  const today = new Date()
  const weekKey = toDateKey(days[0])
  const approval = state.approvals.find((a) => a.memberId === state.currentUserId && a.weekStart === weekKey)
  const dayLocked = (d: Date) => !!settings.lockBefore && toDateKey(d) < settings.lockBefore
  const weekLocked = days.every(dayLocked) || approval?.status === 'Approved' || approval?.status === 'Pending'

  const weekEntries = useMemo(() => {
    const from = days[0].getTime()
    const to = days[6].getTime() + 86400000
    return state.entries.filter((e) => e.end !== null && new Date(e.start).getTime() >= from && new Date(e.start).getTime() < to)
  }, [state.entries, days])

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    for (const e of weekEntries) {
      const r = { projectId: e.projectId, taskId: e.taskId }
      map.set(rowKey(r), r)
    }
    for (const r of extraRows) map.set(rowKey(r), r)
    return [...map.values()].sort((a, b) => (projectById(a.projectId)?.name ?? 'zzz').localeCompare(projectById(b.projectId)?.name ?? 'zzz'))
  }, [weekEntries, extraRows, projectById])

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

  const removeRow = (r: Row) => {
    const ids = weekEntries.filter((e) => e.projectId === r.projectId && e.taskId === r.taskId).map((e) => e.id)
    if (ids.length && !confirm(`Delete ${ids.length} time entr${ids.length > 1 ? 'ies' : 'y'} in this row?`)) return
    if (ids.length) dispatch({ type: 'entry/deleteMany', ids })
    setExtraRows((rs) => rs.filter((x) => rowKey(x) !== rowKey(r)))
  }

  const copyLastWeek = () => {
    const prevDays = weekDays(addWeeks(anchor, -1), settings.weekStart)
    const from = prevDays[0].getTime(), to = prevDays[6].getTime() + 86400000
    const prev = state.entries.filter((e) => e.end !== null && new Date(e.start).getTime() >= from && new Date(e.start).getTime() < to)
    if (!prev.length) return alert('Last week has no time entries.')
    if (weekEntries.length && !confirm('This week already has entries. Copy last week on top of them?')) return
    for (const e of prev) {
      const s = new Date(e.start), en = new Date(e.end!)
      addEntry({ description: e.description, projectId: e.projectId, taskId: e.taskId, tagIds: e.tagIds, billable: e.billable, start: addWeeks(s, 1), end: addWeeks(en, 1) })
    }
  }

  const submit = () =>
    dispatch({ type: 'col/add', col: 'approvals', row: { id: uid(), memberId: state.currentUserId, weekStart: weekKey, status: 'Pending', note: '', submittedAt: new Date().toISOString(), decidedAt: null } })

  const dayTotals = days.map((d) => sumSeconds(weekEntries.filter((e) => isSameDay(new Date(e.start), d))))
  const weekTotal = sumSeconds(weekEntries)

  return (
    <div>
      <PageHeader title="Timesheet">
        {approval ? (
          <Link to="/approvals" className="inline-flex items-center gap-2 text-sm"><Badge tone={approval.status === 'Approved' ? 'green' : approval.status === 'Rejected' ? 'gray' : 'orange'}>{approval.status}</Badge><span className="text-ck-blue hover:underline">View approvals</span></Link>
        ) : (
          <Button variant="outline" size="sm" onClick={submit} disabled={weekTotal === 0}><Send size={13} /> Submit for approval</Button>
        )}
        <Button variant="outline" size="sm" onClick={copyLastWeek} disabled={weekLocked}>Copy last week</Button>
      </PageHeader>

      <div className="ck-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ck-border-light px-4 py-3">
          <div className="flex items-center rounded-sm border border-ck-border">
            <button type="button" className="px-2 py-1.5 hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, -1))} aria-label="Previous week"><ChevronLeft size={16} /></button>
            <span className="min-w-[180px] border-x border-ck-border px-3 py-1.5 text-center text-sm">{weekLabel(anchor, settings.weekStart)}</span>
            <button type="button" className="px-2 py-1.5 hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label="Next week"><ChevronRight size={16} /></button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          {weekLocked && <span className="inline-flex items-center gap-1 text-xs text-ck-muted"><Lock size={12} /> {approval?.status === 'Pending' ? 'Submitted, waiting for approval' : approval?.status === 'Approved' ? 'Approved and locked' : 'Locked'}</span>}
          <span className="ml-auto text-sm text-[#666]">Week total: <span className="font-mono text-ck-text">{formatDuration(weekTotal, settings.durationFormat)}</span></span>
        </div>

        <div className="overflow-x-auto">
          <table className="ck-table w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="w-[280px]">Project</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className={cn('text-center', isSameDay(d, today) && 'text-ck-blue')}>
                    <div className="inline-flex items-center gap-1">{format(d, 'EEE')}{dayLocked(d) && <Lock size={10} className="text-ck-muted" />}</div>
                    <div className="font-normal normal-case tracking-normal">{format(d, 'MMM d')}</div>
                  </th>
                ))}
                <th className="text-right">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowSecs = sumSeconds(weekEntries.filter((e) => e.projectId === r.projectId && e.taskId === r.taskId))
                return (
                  <tr key={rowKey(r)} className="hover:bg-ck-bg/40">
                    <td>
                      <div className="flex items-center gap-2">
                        <ProjectLabel projectId={r.projectId} taskId={r.taskId} placeholder="No project" />
                        {!projectById(r.projectId) && !r.projectId && <span className="text-sm text-ck-muted">(without project)</span>}
                        {r.taskId && !taskById(r.projectId, r.taskId) && <span className="text-xs text-ck-muted">(deleted task)</span>}
                      </div>
                    </td>
                    {days.map((d) => (
                      <td key={d.toISOString()} className={cn('p-1', isSameDay(d, today) && 'bg-ck-blue-light/40', dayLocked(d) && 'bg-ck-bg/60')}>
                        <Cell value={sumSeconds(cellEntries(r, d))} onCommit={(s) => setCell(r, d, s)} fmt={settings.durationFormat} disabled={weekLocked || dayLocked(d)} />
                      </td>
                    ))}
                    <td className="text-right font-mono">{formatDuration(rowSecs, settings.durationFormat)}</td>
                    <td className="text-center">
                      <button type="button" className="text-ck-muted hover:text-ck-red disabled:opacity-30" disabled={weekLocked} onClick={() => removeRow(r)} title="Remove row"><X size={16} /></button>
                    </td>
                  </tr>
                )
              })}
              {!weekLocked && (
                <tr>
                  <td colSpan={10} className="py-1.5">
                    <Popover
                      width={320}
                      trigger={() => (
                        <button type="button" className="inline-flex items-center gap-1 text-sm text-ck-blue hover:underline"><Plus size={14} /> Select project</button>
                      )}
                    >
                      {(close) => (
                        <ProjectMenu value={{ projectId: null, taskId: null }} onChange={(v) => { setExtraRows((rs) => [...rs, v]); close() }} />
                      )}
                    </Popover>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-ck-bg/60 font-medium">
                <td>Total</td>
                {dayTotals.map((t, i) => <td key={i} className="text-center font-mono">{formatDuration(t, settings.durationFormat)}</td>)}
                <td className="text-right font-mono">{formatDuration(weekTotal, settings.durationFormat)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-ck-muted">Tip: type durations like <code>1:30</code>, <code>1h 30m</code>, or <code>1.5</code>. Editing a cell replaces that day's entries for the project with a single entry starting at 09:00. Submitted and approved weeks are read-only.</p>
    </div>
  )
}

function Cell({ value, onCommit, fmt, disabled }: { value: number; onCommit: (s: number) => void; fmt: 'full' | 'compact' | 'decimal'; disabled?: boolean }) {
  const display = value ? formatDuration(value, fmt) : ''
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const secs = text.trim() === '' ? 0 : parseDuration(text)
    setText(null)
    if (secs == null) return
    onCommit(secs)
  }
  return (
    <input
      className="h-9 w-full rounded-sm border border-transparent bg-transparent text-center font-mono text-sm outline-none hover:border-ck-border focus:border-ck-blue focus:bg-white disabled:text-ck-muted disabled:hover:border-transparent"
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

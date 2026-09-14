import { useMemo, useState } from 'react'
import { addWeeks, format, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useStore, uid } from '../store'
import { Button, Field, Modal, PageHeader, ProjectDot, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { toDateKey, weekDays, weekLabel } from '../lib/time'
import type { Schedule } from '../types'

export default function SchedulePage() {
  const { state, projectById, can } = useStore()
  const { settings } = state
  const [anchor, setAnchor] = useState(() => new Date())
  const [editing, setEditing] = useState<Schedule | null>(null)
  const days = useMemo(() => weekDays(anchor, settings.weekStart), [anchor, settings.weekStart])
  const keys = days.map(toDateKey)
  const today = new Date()
  const canEdit = can.manage

  const policyById = (id: string) => state.timeOffPolicies.find((p) => p.id === id)

  const newAssignment = (memberId: string, day: string): Schedule => ({
    id: uid(), memberId, projectId: state.projects.find((p) => !p.archived && !p.isTemplate)?.id ?? null, startDate: day, endDate: day, hoursPerDay: 8, note: '',
  })

  const projectHours = state.projects.filter((p) => !p.isTemplate).map((p) => ({
    p,
    hours: state.schedules.filter((s) => s.projectId === p.id).reduce((a, s) => a + keys.filter((k, i) => s.startDate <= k && s.endDate >= k && days[i].getDay() !== 0 && days[i].getDay() !== 6).length * s.hoursPerDay, 0),
  })).filter((x) => x.hours > 0)

  return (
    <div>
      <PageHeader title="Schedule" description="Plan who works on which project each day and compare scheduled hours with each member's daily capacity.">
        {canEdit && <Button onClick={() => setEditing(newAssignment(state.currentUserId, toDateKey(today)))}><Plus size={16} /> Add assignment</Button>}
      </PageHeader>

      <div className="ck-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ck-border-light px-4 py-3">
          <div className="flex items-center rounded-sm border border-ck-border">
            <button type="button" className="flex h-8 w-8 items-center justify-center hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, -1))} aria-label="Previous week"><ChevronLeft size={16} /></button>
            <span className="min-w-[160px] border-x border-ck-border px-3 py-1.5 text-center text-sm" aria-live="polite">{weekLabel(anchor, settings.weekStart)}</span>
            <button type="button" className="flex h-8 w-8 items-center justify-center hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label="Next week"><ChevronRight size={16} /></button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <span className="basis-full text-xs text-ck-muted sm:ml-auto sm:basis-auto">
            Cells show scheduled hours vs. the member's daily capacity. {canEdit ? 'Click a cell to add an assignment.' : 'Only managers can change the schedule.'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="ck-table w-full min-w-[900px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-[150px] shadow-[inset_-1px_0_0_var(--color-ck-border-light)] sm:w-[200px]">Member</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className={cn('text-center', isSameDay(d, today) && 'text-ck-blue')} aria-current={isSameDay(d, today) ? 'date' : undefined}>
                    <div>{format(d, 'EEE')}</div><div className="font-normal normal-case tracking-normal">{format(d, 'MMM d')}</div>
                  </th>
                ))}
                <th className="text-right">Week</th>
              </tr>
            </thead>
            <tbody>
              {state.members.map((m) => {
                let weekHours = 0
                return (
                  <tr key={m.id} className="align-top">
                    <td className="sticky left-0 z-10 bg-white font-medium shadow-[inset_-1px_0_0_var(--color-ck-border-light)]">
                      <div className="truncate">{m.name}</div>
                      <div className="text-xs font-normal text-ck-muted">{m.workingHours}h / day</div>
                    </td>
                    {keys.map((k, i) => {
                      const items = state.schedules.filter((s) => s.memberId === m.id && s.startDate <= k && s.endDate >= k)
                      const off = state.timeOffRequests.filter((r) => r.memberId === m.id && r.status === 'Approved' && r.startDate <= k && r.endDate >= k)
                      const weekend = days[i].getDay() === 0 || days[i].getDay() === 6
                      const hours = weekend ? 0 : items.reduce((a, s) => a + s.hoursPerDay, 0)
                      weekHours += hours
                      const over = hours > m.workingHours
                      const dayLabel = format(days[i], 'EEEE, MMM d')
                      return (
                        <td
                          key={k}
                          className={cn('group p-1', canEdit && 'cursor-pointer hover:bg-ck-bg/60', weekend && 'bg-ck-bg/40', isSameDay(days[i], today) && 'bg-ck-blue-light/30')}
                          onClick={canEdit ? () => setEditing(newAssignment(m.id, k)) : undefined}
                        >
                          <div className="flex min-h-[56px] flex-col gap-1">
                            {off.map((r) => {
                              const p = policyById(r.policyId)
                              return <div key={r.id} className="truncate rounded-sm px-1.5 py-0.5 text-[11px] text-white" style={{ background: p?.color ?? '#999' }}>{p?.name ?? 'Time off'}</div>
                            })}
                            {items.map((s) => {
                              const p = projectById(s.projectId)
                              const summary = `${p?.name ?? 'Unassigned'}, ${s.hoursPerDay}h${s.note ? ` – ${s.note}` : ''}`
                              const cls = 'flex w-full items-center gap-1 truncate rounded-sm border-l-[3px] px-1.5 py-0.5 text-left text-[11px]'
                              const style = { borderColor: p?.color ?? '#999', background: `${p?.color ?? '#999'}22` }
                              const body = <><span className="truncate">{p?.name ?? 'Unassigned'}</span><span className="ml-auto font-mono tabular-nums text-ck-muted">{s.hoursPerDay}h</span></>
                              return canEdit ? (
                                <button key={s.id} type="button" title={summary} aria-label={`Edit assignment: ${m.name}, ${dayLabel}, ${summary}`} onClick={(e) => { e.stopPropagation(); setEditing(s) }} className={cls} style={style}>{body}</button>
                              ) : (
                                <div key={s.id} title={summary} className={cls} style={style}>{body}</div>
                              )
                            })}
                            {hours > 0 && (
                              <div className={cn('flex items-center justify-end gap-0.5 font-mono text-[10px] tabular-nums', over ? 'text-ck-red' : 'text-ck-muted')} title={over ? 'Over daily capacity' : undefined}>
                                {over && <TriangleAlert size={10} />}{hours}/{m.workingHours}h{over && <span className="sr-only"> (over capacity)</span>}
                              </div>
                            )}
                            {canEdit && (
                              <button
                                type="button" aria-label={`Add assignment for ${m.name} on ${dayLabel}`}
                                onClick={(e) => { e.stopPropagation(); setEditing(newAssignment(m.id, k)) }}
                                className="mt-auto flex h-7 w-full items-center justify-center rounded-sm text-ck-muted opacity-0 hover:bg-black/5 focus-visible:opacity-100 group-hover:opacity-100"
                              >
                                <Plus size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <td className="text-right font-mono tabular-nums">{weekHours}h<div className="text-xs text-ck-muted">/ {m.workingHours * 5}h</div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section className="ck-card mt-4 p-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ck-muted">Scheduled this week by project</h2>
        {projectHours.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projectHours.map(({ p, hours }) => (
              <li key={p.id} className="flex items-center gap-2 text-sm"><ProjectDot color={p.color} /><span className="flex-1 truncate">{p.name}</span><span className="font-mono tabular-nums">{hours}h</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#666]">Nothing is scheduled on a project this week.{canEdit && ' Click a cell in the grid to add an assignment.'}</p>
        )}
      </section>

      {editing && <AssignmentModal item={editing} isNew={!state.schedules.some((s) => s.id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function AssignmentModal({ item, isNew, onClose }: { item: Schedule; isNew: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const { notify } = useFeedback()
  const [s, setS] = useState<Schedule>(item)
  const errors = {
    start: !s.startDate ? 'Pick a start date.' : null,
    end: !s.endDate ? 'Pick an end date.' : s.startDate && s.endDate < s.startDate ? 'End date must be on or after the start date.' : null,
    hours: !(s.hoursPerDay > 0) ? 'Enter more than 0 hours.' : s.hoursPerDay > 24 ? 'A day has at most 24 hours.' : null,
  }
  const valid = !!s.memberId && !errors.start && !errors.end && !errors.hours
  const save = () => {
    if (!valid) return
    if (isNew) dispatch({ type: 'col/add', col: 'schedules', row: s })
    else dispatch({ type: 'col/update', col: 'schedules', id: s.id, patch: s })
    notify(isNew ? 'Assignment added' : 'Assignment saved')
    onClose()
  }
  const remove = () => {
    dispatch({ type: 'col/delete', col: 'schedules', id: item.id })
    notify('Assignment deleted', { action: { label: 'Undo', onClick: () => dispatch({ type: 'col/add', col: 'schedules', row: item }) } })
    onClose()
  }
  return (
    <Modal
      open onClose={onClose} title={isNew ? 'Add assignment' : 'Edit assignment'}
      footer={<>
        {!isNew && <Button variant="ghost" className="mr-auto text-ck-red" onClick={remove}><Trash2 size={15} /> Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid}>{isNew ? 'Add' : 'Save'}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Member">
            {(f) => (
              <select {...f} className="ck-select w-full" value={s.memberId} onChange={(e) => setS({ ...s, memberId: e.target.value })}>
                {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Project">
            {(f) => (
              <select {...f} className="ck-select w-full" value={s.projectId ?? ''} onChange={(e) => setS({ ...s, projectId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {state.projects.filter((p) => !p.archived && !p.isTemplate).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="From" error={errors.start}>
            {(f) => <input {...f} type="date" className="ck-input" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value, endDate: s.endDate < e.target.value ? e.target.value : s.endDate })} />}
          </Field>
          <Field label="To" error={errors.end}>
            {(f) => <input {...f} type="date" className="ck-input" value={s.endDate} min={s.startDate} onChange={(e) => setS({ ...s, endDate: e.target.value })} />}
          </Field>
          <Field label="Hours / day" error={errors.hours}>
            {(f) => <input {...f} type="number" min={0.5} max={24} step={0.5} className="ck-input tabular-nums" value={s.hoursPerDay} onChange={(e) => setS({ ...s, hoursPerDay: Number(e.target.value) || 0 })} />}
          </Field>
        </div>
        <Field label="Note">
          {(f) => <input {...f} className="ck-input" placeholder="Optional" value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} />}
        </Field>
        <p className="text-xs text-ck-muted">Weekends are skipped when counting scheduled hours.</p>
      </div>
    </Modal>
  )
}

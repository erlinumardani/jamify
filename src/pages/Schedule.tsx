import { useMemo, useState } from 'react'
import { addWeeks, format, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useStore, uid } from '../store'
import { Button, Modal, PageHeader, ProjectDot, cn } from '../components/ui'
import { toDateKey, weekDays, weekLabel } from '../lib/time'
import type { Schedule } from '../types'

export default function SchedulePage() {
  const { state, projectById } = useStore()
  const { settings } = state
  const [anchor, setAnchor] = useState(() => new Date())
  const [editing, setEditing] = useState<Schedule | null>(null)
  const days = useMemo(() => weekDays(anchor, settings.weekStart), [anchor, settings.weekStart])
  const keys = days.map(toDateKey)
  const today = new Date()

  const policyById = (id: string) => state.timeOffPolicies.find((p) => p.id === id)

  const newAssignment = (memberId: string, day: string): Schedule => ({
    id: uid(), memberId, projectId: state.projects.find((p) => !p.archived && !p.isTemplate)?.id ?? null, startDate: day, endDate: day, hoursPerDay: 8, note: '',
  })

  return (
    <div>
      <PageHeader title="Schedule">
        <Button onClick={() => setEditing(newAssignment(state.currentUserId, toDateKey(today)))}><Plus size={16} /> Add assignment</Button>
      </PageHeader>

      <div className="ck-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ck-border-light px-4 py-3">
          <div className="flex items-center rounded-sm border border-ck-border">
            <button type="button" className="px-2 py-1.5 hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, -1))} aria-label="Previous week"><ChevronLeft size={16} /></button>
            <span className="min-w-[180px] border-x border-ck-border px-3 py-1.5 text-center text-sm">{weekLabel(anchor, settings.weekStart)}</span>
            <button type="button" className="px-2 py-1.5 hover:bg-ck-bg" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label="Next week"><ChevronRight size={16} /></button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <span className="ml-auto text-xs text-ck-muted">Cells show scheduled hours vs. the member's daily capacity. Click a cell to add an assignment.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ck-table w-full min-w-[900px]">
            <thead>
              <tr>
                <th className="w-[200px]">Member</th>
                {days.map((d) => <th key={d.toISOString()} className={cn('text-center', isSameDay(d, today) && 'text-ck-blue')}><div>{format(d, 'EEE')}</div><div className="font-normal normal-case tracking-normal">{format(d, 'MMM d')}</div></th>)}
                <th className="text-right">Week</th>
              </tr>
            </thead>
            <tbody>
              {state.members.map((m) => {
                let weekHours = 0
                return (
                  <tr key={m.id} className="align-top">
                    <td className="font-medium">{m.name}<div className="text-xs font-normal text-ck-muted">{m.workingHours}h / day</div></td>
                    {keys.map((k, i) => {
                      const items = state.schedules.filter((s) => s.memberId === m.id && s.startDate <= k && s.endDate >= k)
                      const off = state.timeOffRequests.filter((r) => r.memberId === m.id && r.status === 'Approved' && r.startDate <= k && r.endDate >= k)
                      const weekend = days[i].getDay() === 0 || days[i].getDay() === 6
                      const hours = weekend ? 0 : items.reduce((a, s) => a + s.hoursPerDay, 0)
                      weekHours += hours
                      const over = hours > m.workingHours
                      return (
                        <td key={k} className={cn('cursor-pointer p-1 hover:bg-ck-bg/60', weekend && 'bg-ck-bg/40', isSameDay(days[i], today) && 'bg-ck-blue-light/30')} onClick={() => setEditing(newAssignment(m.id, k))}>
                          <div className="min-h-[56px] space-y-1">
                            {off.map((r) => {
                              const p = policyById(r.policyId)
                              return <div key={r.id} className="truncate rounded-sm px-1.5 py-0.5 text-[11px] text-white" style={{ background: p?.color ?? '#999' }}>{p?.name ?? 'Time off'}</div>
                            })}
                            {items.map((s) => {
                              const p = projectById(s.projectId)
                              return (
                                <button key={s.id} type="button" onClick={(e) => { e.stopPropagation(); setEditing(s) }} className="flex w-full items-center gap-1 truncate rounded-sm border-l-[3px] px-1.5 py-0.5 text-left text-[11px]" style={{ borderColor: p?.color ?? '#999', background: `${p?.color ?? '#999'}22` }}>
                                  <span className="truncate">{p?.name ?? 'Unassigned'}</span>
                                  <span className="ml-auto font-mono text-ck-muted">{s.hoursPerDay}h</span>
                                </button>
                              )
                            })}
                            {hours > 0 && <div className={cn('text-right font-mono text-[10px]', over ? 'text-ck-red' : 'text-ck-muted')}>{hours}/{m.workingHours}h</div>}
                          </div>
                        </td>
                      )
                    })}
                    <td className="text-right font-mono">{weekHours}h<div className="text-xs text-ck-muted">/ {m.workingHours * 5}h</div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* project capacity */}
      <div className="ck-card mt-4 p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ck-muted">Scheduled this week by project</div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {state.projects.filter((p) => !p.isTemplate).map((p) => {
            const hours = state.schedules.filter((s) => s.projectId === p.id).reduce((a, s) => a + keys.filter((k, i) => s.startDate <= k && s.endDate >= k && days[i].getDay() !== 0 && days[i].getDay() !== 6).length * s.hoursPerDay, 0)
            if (!hours) return null
            return <li key={p.id} className="flex items-center gap-2 text-sm"><ProjectDot color={p.color} /><span className="flex-1 truncate">{p.name}</span><span className="font-mono">{hours}h</span></li>
          })}
          {!state.schedules.length && <li className="text-sm text-ck-muted">No assignments scheduled.</li>}
        </ul>
      </div>

      {editing && <AssignmentModal item={editing} isNew={!state.schedules.some((s) => s.id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function AssignmentModal({ item, isNew, onClose }: { item: Schedule; isNew: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [s, setS] = useState<Schedule>(item)
  const valid = !!s.memberId && s.startDate <= s.endDate && s.hoursPerDay > 0
  const save = () => {
    if (!valid) return
    if (isNew) dispatch({ type: 'col/add', col: 'schedules', row: s })
    else dispatch({ type: 'col/update', col: 'schedules', id: s.id, patch: s })
    onClose()
  }
  return (
    <Modal
      open onClose={onClose} title={isNew ? 'Add assignment' : 'Edit assignment'}
      footer={<>
        {!isNew && <Button variant="ghost" className="mr-auto text-ck-red" onClick={() => { dispatch({ type: 'col/delete', col: 'schedules', id: s.id }); onClose() }}><Trash2 size={15} /> Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid}>{isNew ? 'Add' : 'Save'}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ck-label">Member</label>
            <select className="ck-select w-full" value={s.memberId} onChange={(e) => setS({ ...s, memberId: e.target.value })}>
              {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ck-label">Project</label>
            <select className="ck-select w-full" value={s.projectId ?? ''} onChange={(e) => setS({ ...s, projectId: e.target.value || null })}>
              <option value="">Unassigned</option>
              {state.projects.filter((p) => !p.archived && !p.isTemplate).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="ck-label">From</label>
            <input type="date" className="ck-input" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value, endDate: s.endDate < e.target.value ? e.target.value : s.endDate })} />
          </div>
          <div>
            <label className="ck-label">To</label>
            <input type="date" className="ck-input" value={s.endDate} min={s.startDate} onChange={(e) => setS({ ...s, endDate: e.target.value })} />
          </div>
          <div>
            <label className="ck-label">Hours / day</label>
            <input type="number" min={0.5} max={24} step={0.5} className="ck-input" value={s.hoursPerDay} onChange={(e) => setS({ ...s, hoursPerDay: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <div>
          <label className="ck-label">Note</label>
          <input className="ck-input" placeholder="Optional" value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} />
        </div>
        <p className="text-xs text-ck-muted">Weekends are skipped when counting scheduled hours.</p>
      </div>
    </Modal>
  )
}

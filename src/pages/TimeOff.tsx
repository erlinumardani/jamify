import { useState } from 'react'
import { format } from 'date-fns'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { useStore, uid } from '../store'
import { Badge, Button, EmptyState, Modal, PageHeader, Tabs } from '../components/ui'
import { ColorPicker } from './Projects'
import { countDays, toDateKey } from '../lib/time'
import type { RequestStatus, TimeOffPolicy, TimeOffRequest } from '../types'

type Tab = 'requests' | 'balances' | 'policies'

export default function TimeOff() {
  const { state, dispatch, memberById } = useStore()
  const [tab, setTab] = useState<Tab>('requests')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | RequestStatus>('all')
  const [policyName, setPolicyName] = useState('')
  const [policyDays, setPolicyDays] = useState('')
  const [policyColor, setPolicyColor] = useState('#4caf50')

  const policies = state.timeOffPolicies
  const policyById = (id: string) => policies.find((p) => p.id === id)
  const requests = [...state.timeOffRequests].filter((r) => filter === 'all' || r.status === filter).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const year = new Date().getFullYear()

  const usedDays = (memberId: string, policyId: string) =>
    state.timeOffRequests
      .filter((r) => r.memberId === memberId && r.policyId === policyId && r.status === 'Approved' && r.startDate.startsWith(String(year)))
      .reduce((a, r) => a + countDays(r.startDate, r.endDate), 0)

  const addPolicy = () => {
    const name = policyName.trim()
    if (!name) return
    const p: TimeOffPolicy = { id: uid(), name, color: policyColor, daysPerYear: policyDays === '' ? null : Number(policyDays) }
    dispatch({ type: 'col/add', col: 'timeOffPolicies', row: p })
    setPolicyName(''); setPolicyDays('')
  }

  const decide = (r: TimeOffRequest, status: RequestStatus) => dispatch({ type: 'col/update', col: 'timeOffRequests', id: r.id, patch: { status } })

  return (
    <div className="space-y-4">
      <PageHeader title="Time Off">
        <Button onClick={() => (policies.length ? setOpen(true) : setTab('policies'))}><Plus size={16} /> Request time off</Button>
      </PageHeader>

      <Tabs tabs={[{ id: 'requests', label: 'Requests' }, { id: 'balances', label: 'Balances' }, { id: 'policies', label: 'Policies' }]} value={tab} onChange={setTab} />

      {tab === 'requests' && (
        <div className="ck-card overflow-x-auto">
          <div className="flex items-center gap-2 border-b border-ck-border-light p-3">
            <select className="ck-select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          {requests.length === 0 ? (
            <EmptyState title="No time off requests" hint={policies.length ? 'Request vacation, sick leave or any other policy. Approved time off appears on the Calendar and Schedule.' : 'Create a time off policy first (e.g. Vacation, 20 days per year).'} action={policies.length ? <Button onClick={() => setOpen(true)}>Request time off</Button> : <Button onClick={() => setTab('policies')}>Create policy</Button>} />
          ) : (
            <table className="ck-table w-full min-w-[760px]">
              <thead><tr><th>Member</th><th>Policy</th><th>From</th><th>To</th><th className="text-right">Days</th><th>Note</th><th>Status</th><th className="w-28" /></tr></thead>
              <tbody>
                {requests.map((r) => {
                  const p = policyById(r.policyId)
                  return (
                    <tr key={r.id} className="hover:bg-ck-bg/40">
                      <td>{memberById(r.memberId)?.name ?? '—'}</td>
                      <td><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p?.color ?? '#999' }} />{p?.name ?? '—'}</span></td>
                      <td className="whitespace-nowrap">{format(new Date(r.startDate), 'MMM d, yyyy')}</td>
                      <td className="whitespace-nowrap">{format(new Date(r.endDate), 'MMM d, yyyy')}</td>
                      <td className="text-right font-mono">{countDays(r.startDate, r.endDate)}</td>
                      <td className="max-w-[240px] truncate text-[#555]">{r.note || <span className="text-ck-muted">—</span>}</td>
                      <td><Badge tone={r.status === 'Approved' ? 'green' : r.status === 'Rejected' ? 'gray' : 'orange'}>{r.status}</Badge></td>
                      <td className="text-right">
                        {r.status === 'Pending' && (
                          <span className="inline-flex gap-1">
                            <button type="button" title="Approve" className="rounded-full p-1 text-ck-green hover:bg-green-50" onClick={() => decide(r, 'Approved')}><Check size={16} /></button>
                            <button type="button" title="Reject" className="rounded-full p-1 text-ck-red hover:bg-red-50" onClick={() => decide(r, 'Rejected')}><X size={16} /></button>
                          </span>
                        )}
                        <button type="button" title="Delete" className="ml-1 rounded-full p-1 text-ck-muted hover:text-ck-red" onClick={() => confirm('Delete this request?') && dispatch({ type: 'col/delete', col: 'timeOffRequests', id: r.id })}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'balances' && (
        <div className="ck-card overflow-x-auto">
          {policies.length === 0 ? <EmptyState title="No policies yet" /> : (
            <table className="ck-table w-full">
              <thead><tr><th>Member</th>{policies.map((p) => <th key={p.id} className="text-right">{p.name} {year}</th>)}</tr></thead>
              <tbody>
                {state.members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    {policies.map((p) => {
                      const used = usedDays(m.id, p.id)
                      return (
                        <td key={p.id} className="text-right font-mono">
                          {p.daysPerYear != null ? <span className={used > p.daysPerYear ? 'text-ck-red' : ''}>{p.daysPerYear - used} left <span className="text-ck-muted">/ {p.daysPerYear}</span></span> : <span>{used} used</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-4 py-3 text-xs text-ck-muted">Balances count approved working days (weekends excluded) in the current year.</p>
        </div>
      )}

      {tab === 'policies' && (
        <div className="ck-card">
          <div className="flex flex-wrap items-end gap-3 border-b border-ck-border-light p-3">
            <div className="min-w-[200px] flex-1">
              <label className="ck-label">Policy name</label>
              <input className="ck-input" placeholder="e.g. Vacation" value={policyName} onChange={(e) => setPolicyName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPolicy()} />
            </div>
            <div className="w-40">
              <label className="ck-label">Days per year</label>
              <input type="number" min={0} className="ck-input" placeholder="Unlimited" value={policyDays} onChange={(e) => setPolicyDays(e.target.value)} />
            </div>
            <div>
              <label className="ck-label">Color</label>
              <ColorPicker value={policyColor} onChange={setPolicyColor} />
            </div>
            <Button onClick={addPolicy} disabled={!policyName.trim()}><Plus size={16} /> Add</Button>
          </div>
          {policies.length === 0 ? <EmptyState title="No policies yet" hint="Policies define the kinds of time off members can request, such as Vacation, Sick leave or Public holiday." /> : (
            <table className="ck-table w-full">
              <thead><tr><th>Name</th><th>Days per year</th><th className="text-right">Requests</th><th className="w-12" /></tr></thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="hover:bg-ck-bg/40">
                    <td>
                      <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                        <input className="rounded-sm border border-transparent bg-transparent px-1 outline-none hover:border-ck-border focus:border-ck-blue" defaultValue={p.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) dispatch({ type: 'col/update', col: 'timeOffPolicies', id: p.id, patch: { name: v } }); else e.target.value = p.name }} />
                      </span>
                    </td>
                    <td>
                      <input type="number" min={0} className="ck-input h-8 w-28" placeholder="Unlimited" value={p.daysPerYear ?? ''} onChange={(e) => dispatch({ type: 'col/update', col: 'timeOffPolicies', id: p.id, patch: { daysPerYear: e.target.value === '' ? null : Number(e.target.value) } })} />
                    </td>
                    <td className="text-right text-[#666]">{state.timeOffRequests.filter((r) => r.policyId === p.id).length}</td>
                    <td className="text-center">
                      <button type="button" className="text-ck-muted hover:text-ck-red" title="Delete policy" onClick={() => confirm(`Delete policy "${p.name}" and all its requests?`) && dispatch({ type: 'col/delete', col: 'timeOffPolicies', id: p.id })}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {open && <RequestModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function RequestModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const today = toDateKey(new Date())
  const [r, setR] = useState<TimeOffRequest>({
    id: uid(), memberId: state.currentUserId, policyId: state.timeOffPolicies[0]?.id ?? '', startDate: today, endDate: today, note: '', status: 'Pending',
  })
  const valid = !!r.policyId && !!r.startDate && !!r.endDate && r.startDate <= r.endDate
  const save = () => { if (!valid) return; dispatch({ type: 'col/add', col: 'timeOffRequests', row: r }); onClose() }
  return (
    <Modal open onClose={onClose} title="Request time off" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid}>Submit</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ck-label">Member</label>
            <select className="ck-select w-full" value={r.memberId} onChange={(e) => setR({ ...r, memberId: e.target.value })}>
              {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ck-label">Policy</label>
            <select className="ck-select w-full" value={r.policyId} onChange={(e) => setR({ ...r, policyId: e.target.value })}>
              {state.timeOffPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ck-label">From</label>
            <input type="date" className="ck-input" value={r.startDate} onChange={(e) => setR({ ...r, startDate: e.target.value, endDate: r.endDate < e.target.value ? e.target.value : r.endDate })} />
          </div>
          <div>
            <label className="ck-label">To</label>
            <input type="date" className="ck-input" value={r.endDate} min={r.startDate} onChange={(e) => setR({ ...r, endDate: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="ck-label">Note</label>
          <input className="ck-input" placeholder="Optional" value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} />
        </div>
        {valid && <p className="text-sm text-[#666]">{countDays(r.startDate, r.endDate)} working day(s)</p>}
      </div>
    </Modal>
  )
}

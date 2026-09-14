import { useId, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { CalendarOff, Check, ListChecks, Plus, Scale, Trash2, Undo2, X } from 'lucide-react'
import { useStore, uid } from '../store'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Tabs, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { ColorPicker } from './Projects'
import { countDays, fromDateKey, toDateKey } from '../lib/time'
import type { RequestStatus, TimeOffPolicy, TimeOffRequest } from '../types'

type Tab = 'requests' | 'balances' | 'policies'

const STATUS_TONE = { Pending: 'orange', Approved: 'green', Rejected: 'red' } as const
const fmtDay = (key: string) => format(fromDateKey(key), 'MMM d, yyyy')

function RowAction({ label, tone, onClick, children }: { label: string; tone: 'green' | 'red' | 'muted'; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" title={label} aria-label={label} onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
        tone === 'green' ? 'text-ck-green hover:bg-green-50' : tone === 'red' ? 'text-ck-red hover:bg-red-50' : 'text-ck-muted hover:bg-black/5 hover:text-ck-red',
      )}
    >
      {children}
    </button>
  )
}

export default function TimeOff() {
  const { state, dispatch, memberById, can } = useStore()
  const { confirm, notify } = useFeedback()
  const [tab, setTab] = useState<Tab>('requests')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | RequestStatus>('all')
  const [policyName, setPolicyName] = useState('')
  const [policyDays, setPolicyDays] = useState('')
  const [policyColor, setPolicyColor] = useState('#4caf50')
  const colorLabelId = useId()

  const me = state.currentUserId
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

  const decide = (r: TimeOffRequest, status: RequestStatus) => {
    dispatch({ type: 'col/update', col: 'timeOffRequests', id: r.id, patch: { status } })
    notify(status === 'Approved' ? 'Time off approved' : 'Time off rejected', {
      action: { label: 'Undo', onClick: () => dispatch({ type: 'col/update', col: 'timeOffRequests', id: r.id, patch: { status: r.status } }) },
    })
  }
  const remove = (r: TimeOffRequest) => {
    dispatch({ type: 'col/delete', col: 'timeOffRequests', id: r.id })
    notify(r.memberId === me && r.status === 'Pending' ? 'Request withdrawn' : 'Request deleted', {
      action: { label: 'Undo', onClick: () => dispatch({ type: 'col/add', col: 'timeOffRequests', row: r }) },
    })
  }
  const deletePolicy = async (p: TimeOffPolicy) => {
    const n = state.timeOffRequests.filter((r) => r.policyId === p.id).length
    const ok = await confirm({
      title: `Delete policy "${p.name}"?`,
      message: n ? `Its ${n} request${n === 1 ? ' is' : 's are'} deleted too, and balances for this policy disappear. This can't be undone.` : 'No requests use this policy yet.',
      confirmLabel: 'Delete policy',
      danger: true,
    })
    if (!ok) return
    dispatch({ type: 'col/delete', col: 'timeOffPolicies', id: p.id })
    notify(`Policy "${p.name}" deleted`)
  }

  const createPolicyAction = can.manage ? <Button variant="outline" onClick={() => setTab('policies')}>Create policy</Button> : undefined

  return (
    <div className="space-y-4">
      <PageHeader title="Time Off" description="Request vacation, sick leave and other time off, and see how much of each policy's yearly allowance is left.">
        <Button onClick={() => (policies.length ? setOpen(true) : setTab('policies'))}><Plus size={16} /> Request time off</Button>
      </PageHeader>

      <Tabs tabs={[{ id: 'requests', label: 'Requests' }, { id: 'balances', label: 'Balances' }, { id: 'policies', label: 'Policies' }]} value={tab} onChange={setTab} />

      {tab === 'requests' && (
        <div className="ck-card">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ck-border-light p-3">
            <select className="ck-select" aria-label="Filter by status" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            {!can.manage && <span className="text-xs text-ck-muted">You can withdraw your own requests while they're pending. Managers approve or reject them.</span>}
          </div>
          {requests.length === 0 ? (
            filter !== 'all' && state.timeOffRequests.length > 0 ? (
              <EmptyState icon={<CalendarOff size={40} />} title={`No ${filter.toLowerCase()} requests`} hint="Try another status filter." action={<Button variant="outline" onClick={() => setFilter('all')}>Show all requests</Button>} />
            ) : policies.length ? (
              <EmptyState icon={<CalendarOff size={40} />} title="No time off requests" hint="Approved time off appears on the Calendar and Schedule." action={<Button variant="outline" onClick={() => setOpen(true)}>Request time off</Button>} />
            ) : (
              <EmptyState
                icon={<CalendarOff size={40} />} title="No time off requests" action={createPolicyAction}
                hint={can.manage ? 'Create a time off policy first, e.g. Vacation with 20 days per year.' : 'A manager needs to create a time off policy before anyone can request time off.'}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="ck-table w-full min-w-[760px]">
                <thead><tr><th>Member</th><th>Policy</th><th>From</th><th>To</th><th className="text-right">Days</th><th>Note</th><th>Status</th><th className="w-32"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {requests.map((r) => {
                    const p = policyById(r.policyId)
                    const name = memberById(r.memberId)?.name ?? '—'
                    const mine = r.memberId === me
                    const detail = `${name}, ${p?.name ?? 'time off'} ${fmtDay(r.startDate)}`
                    return (
                      <tr key={r.id} className="hover:bg-ck-bg/40">
                        <td>{name}</td>
                        <td><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p?.color ?? '#999' }} />{p?.name ?? '—'}</span></td>
                        <td className="whitespace-nowrap">{fmtDay(r.startDate)}</td>
                        <td className="whitespace-nowrap">{fmtDay(r.endDate)}</td>
                        <td className="text-right font-mono tabular-nums">{countDays(r.startDate, r.endDate)}</td>
                        <td className="max-w-[240px] truncate text-[#555]" title={r.note || undefined}>{r.note || <span className="text-ck-muted">—</span>}</td>
                        <td><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                        <td className="whitespace-nowrap text-right">
                          <span className="inline-flex items-center gap-1">
                            {can.manage && r.status === 'Pending' && <>
                              <RowAction label={`Approve ${detail}`} tone="green" onClick={() => decide(r, 'Approved')}><Check size={16} /></RowAction>
                              <RowAction label={`Reject ${detail}`} tone="red" onClick={() => decide(r, 'Rejected')}><X size={16} /></RowAction>
                            </>}
                            {can.manage
                              ? <RowAction label={`Delete request: ${detail}`} tone="muted" onClick={() => remove(r)}><Trash2 size={15} /></RowAction>
                              : mine && r.status === 'Pending' && <Button size="sm" variant="ghost" onClick={() => remove(r)}><Undo2 size={13} /> Withdraw</Button>}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'balances' && (
        <div className="ck-card">
          {policies.length === 0 ? (
            <EmptyState icon={<Scale size={40} />} title="No policies yet" hint="Balances appear once a time off policy exists." action={createPolicyAction} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="ck-table w-full">
                  <thead><tr><th>Member</th>{policies.map((p) => <th key={p.id} className="whitespace-nowrap text-right">{p.name} {year}</th>)}</tr></thead>
                  <tbody>
                    {state.members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        {policies.map((p) => {
                          const used = usedDays(m.id, p.id)
                          return (
                            <td key={p.id} className="whitespace-nowrap text-right font-mono tabular-nums">
                              {p.daysPerYear == null
                                ? <span>{used} used</span>
                                : used > p.daysPerYear
                                  ? <span className="text-ck-red">{used - p.daysPerYear} over <span className="text-ck-muted">/ {p.daysPerYear}</span></span>
                                  : <span>{p.daysPerYear - used} left <span className="text-ck-muted">/ {p.daysPerYear}</span></span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-ck-border-light px-4 py-3 text-xs text-ck-muted">Balances count approved working days (weekends excluded) in the current year.</p>
            </>
          )}
        </div>
      )}

      {tab === 'policies' && (
        <div className="ck-card">
          {can.manage ? (
            <form className="flex flex-wrap items-end gap-3 border-b border-ck-border-light p-3" onSubmit={(e) => { e.preventDefault(); addPolicy() }}>
              <Field label="Policy name" className="min-w-[200px] flex-1">
                {(f) => <input {...f} className="ck-input" placeholder="e.g. Vacation" value={policyName} onChange={(e) => setPolicyName(e.target.value)} />}
              </Field>
              <Field label="Days per year" className="w-40">
                {(f) => <input {...f} type="number" min={0} className="ck-input" placeholder="Unlimited" value={policyDays} onChange={(e) => setPolicyDays(e.target.value)} />}
              </Field>
              <div role="group" aria-labelledby={colorLabelId}>
                <span id={colorLabelId} className="ck-label">Color</span>
                <ColorPicker value={policyColor} onChange={setPolicyColor} />
              </div>
              <Button type="submit" disabled={!policyName.trim()}><Plus size={16} /> Add</Button>
            </form>
          ) : (
            <p className="border-b border-ck-border-light px-4 py-3 text-sm text-[#666]">Only owners, admins and managers can add or change time off policies.</p>
          )}
          {policies.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={40} />} title="No policies yet"
              hint={can.manage ? 'Policies define the kinds of time off members can request, such as Vacation, Sick leave or Public holiday.' : 'Ask a manager to create a policy such as Vacation or Sick leave.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="ck-table w-full">
                <thead><tr><th>Name</th><th className="text-right">Days per year</th><th className="text-right">Requests</th>{can.manage && <th className="w-12"><span className="sr-only">Actions</span></th>}</tr></thead>
                <tbody>
                  {policies.map((p) => (
                    <tr key={p.id} className="hover:bg-ck-bg/40">
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
                          {can.manage ? (
                            <input
                              aria-label="Policy name" className="h-8 min-w-0 rounded-sm border border-transparent bg-transparent px-1 outline-none hover:border-ck-border focus:border-ck-blue" defaultValue={p.name}
                              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) dispatch({ type: 'col/update', col: 'timeOffPolicies', id: p.id, patch: { name: v } }); else e.target.value = p.name }}
                            />
                          ) : p.name}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {can.manage ? (
                          <input
                            type="number" min={0} aria-label={`Days per year for ${p.name}`} className="ck-input ml-auto h-8 w-28 text-right tabular-nums" placeholder="Unlimited" value={p.daysPerYear ?? ''}
                            onChange={(e) => dispatch({ type: 'col/update', col: 'timeOffPolicies', id: p.id, patch: { daysPerYear: e.target.value === '' ? null : Number(e.target.value) } })}
                          />
                        ) : p.daysPerYear ?? 'Unlimited'}
                      </td>
                      <td className="text-right tabular-nums text-[#666]">{state.timeOffRequests.filter((r) => r.policyId === p.id).length}</td>
                      {can.manage && (
                        <td className="text-center">
                          <RowAction label={`Delete policy ${p.name}`} tone="muted" onClick={() => deletePolicy(p)}><Trash2 size={15} /></RowAction>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {open && <RequestModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function RequestModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch, can } = useStore()
  const { notify } = useFeedback()
  const today = toDateKey(new Date())
  const [r, setR] = useState<TimeOffRequest>({
    id: uid(), memberId: state.currentUserId, policyId: state.timeOffPolicies[0]?.id ?? '', startDate: today, endDate: today, note: '', status: 'Pending',
  })
  const ordered = !!r.startDate && !!r.endDate && r.startDate <= r.endDate
  const days = ordered ? countDays(r.startDate, r.endDate) : 0
  const overlap = ordered ? state.timeOffRequests.find((o) => o.memberId === r.memberId && o.status !== 'Rejected' && o.startDate <= r.endDate && o.endDate >= r.startDate) : undefined
  const policy = state.timeOffPolicies.find((p) => p.id === r.policyId)
  const year = (r.startDate || today).slice(0, 4)
  const used = state.timeOffRequests
    .filter((o) => o.memberId === r.memberId && o.policyId === r.policyId && o.status === 'Approved' && o.startDate.startsWith(year))
    .reduce((a, o) => a + countDays(o.startDate, o.endDate), 0)
  const left = policy?.daysPerYear != null ? policy.daysPerYear - used : null

  const errors = {
    policy: !r.policyId ? 'Choose a policy.' : null,
    start: !r.startDate ? 'Pick a start date.' : null,
    end: !r.endDate ? 'Pick an end date.'
      : r.startDate && r.endDate < r.startDate ? 'End date must be on or after the start date.'
      : overlap ? `Overlaps an existing ${overlap.status.toLowerCase()} request (${fmtDay(overlap.startDate)} – ${fmtDay(overlap.endDate)}).`
      : ordered && days === 0 ? 'These dates fall on a weekend; include at least one working day.'
      : null,
  }
  const valid = !errors.policy && !errors.start && !errors.end
  const save = () => {
    if (!valid) return
    dispatch({ type: 'col/add', col: 'timeOffRequests', row: r })
    notify('Time off request submitted')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Request time off" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid}>Submit</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Member" help={can.manage ? undefined : 'You can only request time off for yourself.'}>
            {(f) => (
              <select {...f} className="ck-select w-full" value={r.memberId} disabled={!can.manage} onChange={(e) => setR({ ...r, memberId: e.target.value })}>
                {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Policy" error={errors.policy} help={policy ? (left != null ? `${left} of ${policy.daysPerYear} days left in ${year}` : `Unlimited · ${used} used in ${year}`) : undefined}>
            {(f) => (
              <select {...f} className="ck-select w-full" value={r.policyId} onChange={(e) => setR({ ...r, policyId: e.target.value })}>
                {state.timeOffPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From" error={errors.start}>
            {(f) => <input {...f} type="date" className="ck-input" value={r.startDate} onChange={(e) => setR({ ...r, startDate: e.target.value, endDate: r.endDate < e.target.value ? e.target.value : r.endDate })} />}
          </Field>
          <Field label="To" error={errors.end}>
            {(f) => <input {...f} type="date" className="ck-input" value={r.endDate} min={r.startDate} onChange={(e) => setR({ ...r, endDate: e.target.value })} />}
          </Field>
        </div>
        <Field label="Note">
          {(f) => <input {...f} className="ck-input" placeholder="Optional" value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} />}
        </Field>
        {valid && (
          <p className="text-sm text-[#666]" aria-live="polite">
            <span className="tabular-nums">{days}</span> working day{days === 1 ? '' : 's'}
            {left != null && days > left && <span className="text-ck-red"> · exceeds the remaining balance by {days - Math.max(left, 0)}</span>}
          </p>
        )}
      </div>
    </Modal>
  )
}

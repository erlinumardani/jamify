import { useMemo, useState } from 'react'
import { addDays, format, startOfWeek, subWeeks } from 'date-fns'
import { Check, Send, Trash2, X } from 'lucide-react'
import { useStore, uid } from '../store'
import { Badge, Button, EmptyState, PageHeader } from '../components/ui'
import { formatDuration, formatMoney, fromDateKey, sumSeconds, toDateKey } from '../lib/time'
import type { Approval, RequestStatus } from '../types'

export default function Approvals() {
  const { state, dispatch, memberById, currentUser, rateFor } = useStore()
  const { settings } = state
  const [memberId, setMemberId] = useState(state.currentUserId)
  const canDecide = ['Owner', 'Admin', 'Manager'].includes(currentUser.role)

  // the last 8 weeks for the selected member, with their submission state
  const weeks = useMemo(() => {
    const out: { key: string; start: Date; end: Date; secs: number; billable: number; amount: number; approval: Approval | undefined }[] = []
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: settings.weekStart })
    for (let i = 0; i < 8; i++) {
      const start = subWeeks(thisWeek, i)
      const end = addDays(start, 7)
      const entries = state.entries.filter((e) => e.userId === memberId && e.end && new Date(e.start) >= start && new Date(e.start) < end)
      const key = toDateKey(start)
      out.push({
        key, start, end: addDays(end, -1), secs: sumSeconds(entries), billable: sumSeconds(entries.filter((e) => e.billable)),
        amount: entries.reduce((a, e) => a + ((new Date(e.end!).getTime() - new Date(e.start).getTime()) / 3600000) * rateFor(e), 0),
        approval: state.approvals.find((a) => a.memberId === memberId && a.weekStart === key),
      })
    }
    return out
  }, [state.entries, state.approvals, memberId, settings.weekStart, rateFor])

  const pending = state.approvals.filter((a) => a.status === 'Pending').sort((a, b) => b.weekStart.localeCompare(a.weekStart))

  const submit = (weekStart: string) =>
    dispatch({ type: 'col/add', col: 'approvals', row: { id: uid(), memberId, weekStart, status: 'Pending', note: '', submittedAt: new Date().toISOString(), decidedAt: null } })
  const decide = (a: Approval, status: RequestStatus) => {
    dispatch({ type: 'col/update', col: 'approvals', id: a.id, patch: { status, decidedAt: new Date().toISOString() } })
    // approving a week locks it if the lock date is earlier
    if (status === 'Approved') {
      const weekEnd = toDateKey(addDays(fromDateKey(a.weekStart), 7))
      if (!settings.lockBefore || settings.lockBefore < weekEnd) dispatch({ type: 'settings/update', patch: { lockBefore: weekEnd } })
    }
  }
  const withdraw = (a: Approval) => dispatch({ type: 'col/delete', col: 'approvals', id: a.id })

  return (
    <div className="space-y-4">
      <PageHeader title="Approvals">
        <select className="ck-select" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </PageHeader>

      {canDecide && pending.length > 0 && (
        <div className="ck-card">
          <div className="border-b border-ck-border-light px-4 py-3 text-xs font-medium uppercase tracking-wide text-ck-muted">Waiting for your approval</div>
          <table className="ck-table w-full">
            <thead><tr><th>Member</th><th>Week</th><th className="text-right">Tracked</th><th>Submitted</th><th className="w-28" /></tr></thead>
            <tbody>
              {pending.map((a) => {
                const start = fromDateKey(a.weekStart)
                const secs = sumSeconds(state.entries.filter((e) => e.userId === a.memberId && e.end && new Date(e.start) >= start && new Date(e.start) < addDays(start, 7)))
                return (
                  <tr key={a.id}>
                    <td>{memberById(a.memberId)?.name ?? '—'}</td>
                    <td>{format(start, 'MMM d')} – {format(addDays(start, 6), 'MMM d, yyyy')}</td>
                    <td className="text-right font-mono">{formatDuration(secs, settings.durationFormat)}</td>
                    <td className="text-[#666]">{format(new Date(a.submittedAt), 'MMM d, HH:mm')}</td>
                    <td className="text-right">
                      <button type="button" title="Approve" className="rounded-full p-1 text-ck-green hover:bg-green-50" onClick={() => decide(a, 'Approved')}><Check size={16} /></button>
                      <button type="button" title="Reject" className="rounded-full p-1 text-ck-red hover:bg-red-50" onClick={() => decide(a, 'Rejected')}><X size={16} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ck-card overflow-x-auto">
        <div className="border-b border-ck-border-light px-4 py-3 text-xs font-medium uppercase tracking-wide text-ck-muted">Timesheets · {memberById(memberId)?.name}</div>
        {weeks.every((w) => w.secs === 0 && !w.approval) ? (
          <EmptyState title="Nothing to submit yet" hint="Track time during the week, then submit the timesheet for approval here. Approving a week locks its entries." />
        ) : (
          <table className="ck-table w-full min-w-[760px]">
            <thead><tr><th>Week</th><th className="text-right">Tracked</th><th className="text-right">Billable</th><th className="text-right">Amount</th><th>Status</th><th className="w-44" /></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.key} className="hover:bg-ck-bg/40">
                  <td>{format(w.start, 'MMM d')} – {format(w.end, 'MMM d, yyyy')}</td>
                  <td className="text-right font-mono">{formatDuration(w.secs, settings.durationFormat)}</td>
                  <td className="text-right font-mono">{formatDuration(w.billable, settings.durationFormat)}</td>
                  <td className="text-right">{formatMoney(w.amount, settings.currency)}</td>
                  <td>
                    {w.approval ? <Badge tone={w.approval.status === 'Approved' ? 'green' : w.approval.status === 'Rejected' ? 'gray' : 'orange'}>{w.approval.status}</Badge> : <span className="text-xs text-ck-muted">Not submitted</span>}
                  </td>
                  <td className="text-right">
                    {!w.approval && w.secs > 0 && <Button size="sm" variant="outline" onClick={() => submit(w.key)}><Send size={13} /> Submit</Button>}
                    {w.approval?.status === 'Pending' && (
                      <span className="inline-flex items-center gap-1">
                        {canDecide && <>
                          <button type="button" title="Approve" className="rounded-full p-1 text-ck-green hover:bg-green-50" onClick={() => decide(w.approval!, 'Approved')}><Check size={16} /></button>
                          <button type="button" title="Reject" className="rounded-full p-1 text-ck-red hover:bg-red-50" onClick={() => decide(w.approval!, 'Rejected')}><X size={16} /></button>
                        </>}
                        <button type="button" title="Withdraw" className="rounded-full p-1 text-ck-muted hover:text-ck-red" onClick={() => withdraw(w.approval!)}><Trash2 size={15} /></button>
                      </span>
                    )}
                    {w.approval?.status === 'Rejected' && <Button size="sm" variant="ghost" onClick={() => withdraw(w.approval!)}>Resubmit</Button>}
                    {w.approval?.status === 'Approved' && canDecide && <Button size="sm" variant="ghost" onClick={() => confirm('Reopen this week? Entries stay locked until you change the lock date in Settings.') && withdraw(w.approval!)}>Reopen</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

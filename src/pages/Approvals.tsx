import { useMemo, useState, type ReactNode } from 'react'
import { addDays, format, startOfWeek, subWeeks } from 'date-fns'
import { Check, CircleCheck, ClipboardCheck, Send, Undo2, X } from 'lucide-react'
import { useStore, uid } from '../store'
import { Badge, Button, EmptyState, PageHeader, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { formatDuration, formatMoney, fromDateKey, sumSeconds, toDateKey } from '../lib/time'
import type { Approval, RequestStatus } from '../types'

const STATUS_TONE = { Pending: 'orange', Approved: 'green', Rejected: 'red' } as const
const weekRange = (start: Date) => `${format(start, 'MMM d')} – ${format(addDays(start, 6), 'MMM d, yyyy')}`

function RowAction({ label, detail, tone, onClick, children }: { label: string; detail?: string; tone: 'green' | 'red'; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" title={label} aria-label={detail ? `${label} ${detail}` : label} onClick={onClick}
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors', tone === 'green' ? 'text-ck-green hover:bg-green-50' : 'text-ck-red hover:bg-red-50')}
    >
      {children}
    </button>
  )
}

export default function Approvals() {
  const { state, dispatch, memberById, can, rateFor } = useStore()
  const { confirm, notify } = useFeedback()
  const { settings } = state
  const [picked, setPicked] = useState(state.currentUserId)
  const canDecide = can.manage
  // members only see and submit their own timesheets
  const memberId = canDecide ? picked : state.currentUserId
  const memberName = memberById(memberId)?.name ?? ''

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

  const submit = (weekStart: string) => {
    dispatch({ type: 'col/add', col: 'approvals', row: { id: uid(), memberId, weekStart, status: 'Pending', note: '', submittedAt: new Date().toISOString(), decidedAt: null } })
    notify('Timesheet submitted for approval')
  }
  const decide = (a: Approval, status: RequestStatus) => {
    dispatch({ type: 'col/update', col: 'approvals', id: a.id, patch: { status, decidedAt: new Date().toISOString() } })
    if (status === 'Rejected') {
      notify('Timesheet rejected', { action: { label: 'Undo', onClick: () => dispatch({ type: 'col/update', col: 'approvals', id: a.id, patch: { status: 'Pending', decidedAt: null } }) } })
      return
    }
    // approving a week locks it if the lock date is earlier; only admins may move the workspace lock date
    const weekEnd = toDateKey(addDays(fromDateKey(a.weekStart), 7))
    const needsLock = !settings.lockBefore || settings.lockBefore < weekEnd
    if (needsLock && can.admin) dispatch({ type: 'settings/update', patch: { lockBefore: weekEnd } })
    notify(needsLock && !can.admin ? 'Timesheet approved. Ask an admin to lock the week in Settings.' : 'Timesheet approved and locked')
  }
  const withdraw = (a: Approval) => {
    dispatch({ type: 'col/delete', col: 'approvals', id: a.id })
    notify('Submission withdrawn', { action: { label: 'Undo', onClick: () => dispatch({ type: 'col/add', col: 'approvals', row: a }) } })
  }
  const resubmit = (a: Approval) => {
    dispatch({ type: 'col/update', col: 'approvals', id: a.id, patch: { status: 'Pending', submittedAt: new Date().toISOString(), decidedAt: null } })
    notify('Timesheet resubmitted for approval')
  }
  const reopen = async (a: Approval) => {
    const ok = await confirm({
      title: 'Reopen this week?',
      message: 'The approval is removed so the timesheet can be changed and submitted again. Entries stay locked until the lock date is moved in Settings.',
      confirmLabel: 'Reopen week',
    })
    if (!ok) return
    dispatch({ type: 'col/delete', col: 'approvals', id: a.id })
    notify('Week reopened')
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Approvals" description="Submit each week's timesheet for review; managers approve or reject it, and approving a week locks its entries.">
        {canDecide && (
          <select className="ck-select" aria-label="Member" value={memberId} onChange={(e) => setPicked(e.target.value)}>
            {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </PageHeader>

      {canDecide && (
        <section className="ck-card">
          <h2 className="border-b border-ck-border-light px-4 py-3 text-xs font-medium uppercase tracking-wide text-ck-muted">
            Waiting for your approval{pending.length > 0 && ` · ${pending.length}`}
          </h2>
          {pending.length === 0 ? (
            <EmptyState icon={<CircleCheck size={40} />} title="All caught up" hint="Timesheets that members submit for approval show up here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="ck-table w-full min-w-[600px]">
                <thead><tr><th>Member</th><th>Week</th><th className="text-right">Tracked</th><th>Submitted</th><th className="w-24"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {pending.map((a) => {
                    const start = fromDateKey(a.weekStart)
                    const secs = sumSeconds(state.entries.filter((e) => e.userId === a.memberId && e.end && new Date(e.start) >= start && new Date(e.start) < addDays(start, 7)))
                    const name = memberById(a.memberId)?.name ?? '—'
                    const detail = `${name}, ${weekRange(start)}`
                    return (
                      <tr key={a.id}>
                        <td>{name}</td>
                        <td className="whitespace-nowrap">{weekRange(start)}</td>
                        <td className="text-right font-mono tabular-nums">{formatDuration(secs, settings.durationFormat)}</td>
                        <td className="whitespace-nowrap text-[#666]">{format(new Date(a.submittedAt), 'MMM d, HH:mm')}</td>
                        <td className="whitespace-nowrap text-right">
                          <RowAction label="Approve" detail={detail} tone="green" onClick={() => decide(a, 'Approved')}><Check size={16} /></RowAction>
                          <RowAction label="Reject" detail={detail} tone="red" onClick={() => decide(a, 'Rejected')}><X size={16} /></RowAction>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="ck-card">
        <h2 className="border-b border-ck-border-light px-4 py-3 text-xs font-medium uppercase tracking-wide text-ck-muted">Timesheets · {memberName}</h2>
        {weeks.every((w) => w.secs === 0 && !w.approval) ? (
          <EmptyState
            icon={<ClipboardCheck size={40} />}
            title="Nothing to submit yet"
            hint={memberId === state.currentUserId ? 'Track time during the week, then submit its timesheet here for approval.' : `${memberName} hasn't tracked time in the last 8 weeks.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ck-table w-full min-w-[760px]">
              <thead><tr><th>Week</th><th className="text-right">Tracked</th><th className="text-right">Billable</th><th className="text-right">Amount</th><th>Status</th><th className="w-56"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.key} className="hover:bg-ck-bg/40">
                    <td className="whitespace-nowrap">{weekRange(w.start)}</td>
                    <td className="text-right font-mono tabular-nums">{formatDuration(w.secs, settings.durationFormat)}</td>
                    <td className="text-right font-mono tabular-nums">{formatDuration(w.billable, settings.durationFormat)}</td>
                    <td className="text-right tabular-nums">{formatMoney(w.amount, settings.currency)}</td>
                    <td>
                      {w.approval ? <Badge tone={STATUS_TONE[w.approval.status]}>{w.approval.status}</Badge> : <span className="text-xs text-ck-muted">Not submitted</span>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {!w.approval && w.secs > 0 && <Button size="sm" variant="outline" onClick={() => submit(w.key)}><Send size={13} /> Submit</Button>}
                      {w.approval?.status === 'Pending' && (
                        <span className="inline-flex items-center gap-1">
                          {canDecide && <>
                            <RowAction label="Approve" detail={`week of ${weekRange(w.start)}`} tone="green" onClick={() => decide(w.approval!, 'Approved')}><Check size={16} /></RowAction>
                            <RowAction label="Reject" detail={`week of ${weekRange(w.start)}`} tone="red" onClick={() => decide(w.approval!, 'Rejected')}><X size={16} /></RowAction>
                          </>}
                          <Button size="sm" variant="ghost" onClick={() => withdraw(w.approval!)}><Undo2 size={13} /> Withdraw</Button>
                        </span>
                      )}
                      {w.approval?.status === 'Rejected' && <Button size="sm" variant="outline" onClick={() => resubmit(w.approval!)}><Send size={13} /> Resubmit</Button>}
                      {w.approval?.status === 'Approved' && canDecide && <Button size="sm" variant="ghost" onClick={() => reopen(w.approval!)}>Reopen</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

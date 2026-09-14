import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MailWarning, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '../store'
import { Avatar, Badge, Button, Modal, PageHeader, Spinner, cn } from '../components/ui'
import { InviteMemberModal, InviteResults } from '../components/InviteMemberModal'
import { getSmtpSettings, sendInvites, type InviteRow } from '../lib/invites'
import type { Member, Role } from '../types'
import { entrySeconds, formatDuration } from '../lib/time'

const ROLES: Role[] = ['Owner', 'Admin', 'Manager', 'Member']
type Filter = 'all' | 'active' | 'invited'

export default function Team() {
  const { state, dispatch, currentUser, can, workspace } = useStore()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [resending, setResending] = useState<string[]>([])
  const [resent, setResent] = useState<InviteRow[] | null>(null)
  const [emailOff, setEmailOff] = useState(false)

  // tell admins up front when invitations can't be emailed
  useEffect(() => {
    if (!can.admin) return
    let cancelled = false
    getSmtpSettings(workspace.id).then((s) => { if (!cancelled) setEmailOff(!s) }).catch(() => { /* the banner is only a hint */ })
    return () => { cancelled = true }
  }, [can.admin, workspace.id])

  const invited = state.members.filter((m) => m.status === 'Pending')
  const counts: Record<Filter, number> = { all: state.members.length, active: state.members.length - invited.length, invited: invited.length }
  const shown = filter === 'all' ? state.members : state.members.filter((m) => (m.status === 'Pending') === (filter === 'invited'))

  const resend = async (members: Member[]) => {
    const ids = members.map((m) => m.id)
    setResending((cur) => [...cur, ...ids])
    const rows = await sendInvites(members)
    setResending((cur) => cur.filter((id) => !ids.includes(id)))
    setResent((prev) => (prev ? prev.map((r) => rows.find((x) => x.member.id === r.member.id) ?? r) : rows))
  }

  const tracked = (id: string) => state.entries.filter((e) => e.userId === id).reduce((a, e) => a + entrySeconds(e), 0)
  const cur = state.settings.currency

  return (
    <div>
      <PageHeader title="Team">
        {can.admin && <Button onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Invite members</Button>}
      </PageHeader>

      {can.admin && emailOff && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <MailWarning size={18} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1"><b>Invitation emails are off.</b> This workspace has no SMTP server, so invites only give you a link to share yourself.</span>
          <Link to="/settings#email" className="font-medium underline">Set up email</Link>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Filter members" className="inline-flex rounded-sm border border-ck-border bg-white p-0.5 text-sm">
          {(['all', 'active', 'invited'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn('rounded-sm px-3 py-1.5 capitalize transition-colors', filter === f ? 'bg-ck-blue-light font-medium text-ck-blue-dark' : 'text-[#555] hover:bg-ck-bg')}
            >
              {f} <span className="tabular-nums text-ck-muted">{counts[f]}</span>
            </button>
          ))}
        </div>
        {can.admin && invited.length > 1 && (
          <Button variant="outline" size="sm" disabled={resending.length > 0} onClick={() => resend(invited)}>
            {resending.length > 0 ? <Spinner size={12} /> : <RefreshCw size={13} />} Resend all {invited.length} invitations
          </Button>
        )}
      </div>

      <div className="ck-card overflow-x-auto">
        <table className="ck-table w-full min-w-[960px]">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Billable rate ({cur})</th><th>Cost rate ({cur})</th><th>Hours / day</th><th className="text-right">Tracked</th><th>Status</th><th className="w-12"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-[#666]">{filter === 'invited' ? 'No open invitations. Everyone has joined.' : 'No members here yet.'}</td></tr>
            )}
            {shown.map((m) => {
              const isMe = m.id === currentUser.id
              const isResending = resending.includes(m.id)
              const patch = (p: Partial<typeof m>) => dispatch({ type: 'member/update', id: m.id, patch: p })
              return (
                <tr key={m.id} className="hover:bg-ck-bg/40">
                  <td>
                    <span className="inline-flex items-center gap-2"><Avatar name={m.name} size={28} /> {m.name} {isMe && <span className="text-xs text-ck-muted">(you)</span>}</span>
                  </td>
                  <td className="text-[#666]">{m.email}</td>
                  <td>
                    <select className="ck-select h-8" aria-label={`Role of ${m.name}`} value={m.role} disabled={!can.admin || m.role === 'Owner'} onChange={(e) => patch({ role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r} value={r} disabled={r === 'Owner'}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" min={0} className="ck-input h-8 w-24" aria-label={`Billable rate of ${m.name}`} disabled={!can.admin} placeholder={`${state.settings.hourlyRate}`} value={m.hourlyRate ?? ''} onChange={(e) => patch({ hourlyRate: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} className="ck-input h-8 w-24" aria-label={`Cost rate of ${m.name}`} disabled={!can.admin} placeholder="0" value={m.costRate ?? ''} onChange={(e) => patch({ costRate: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} max={24} step={0.5} className="ck-input h-8 w-20" aria-label={`Hours per day of ${m.name}`} disabled={!can.admin} value={m.workingHours} onChange={(e) => patch({ workingHours: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="text-right font-mono tabular-nums">{formatDuration(tracked(m.id), state.settings.durationFormat)}</td>
                  <td>
                    {m.status === 'Active' ? <Badge tone="green">Active</Badge> : (
                      <span className="inline-flex items-center gap-2">
                        <Badge tone="orange">Invited</Badge>
                        {can.admin && (
                          <button type="button" className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-ck-blue-dark hover:underline disabled:opacity-60" disabled={isResending} onClick={() => resend([m])} aria-label={`Resend invitation to ${m.email}`}>
                            {isResending ? <Spinner size={11} /> : <RefreshCw size={12} aria-hidden="true" />} Resend
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="text-center">
                    {/* an Owner row without an account is a leftover duplicate and can go */}
                    {can.admin && !isMe && (m.role !== 'Owner' || !m.authUserId) && (
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ck-muted transition-colors hover:bg-red-50 hover:text-ck-red"
                        aria-label={`Remove ${m.name}`}
                        title="Remove from workspace"
                        onClick={() => confirm(`Remove ${m.name} from the workspace? They lose access, and their time off, approvals and schedules are removed too.`) && dispatch({ type: 'member/delete', id: m.id })}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[#666]">
        Billable rate is what you charge for the member's time; cost rate is what the member costs you. Reports use both to show profit.
        Invited people join when they open their invitation link; Resend emails them a new one.
      </p>

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Modal
        open={!!resent}
        onClose={() => resending.length === 0 && setResent(null)}
        title={resent && resent.length > 1 ? 'Invitations' : 'Invitation'}
        width={520}
        footer={<Button onClick={() => setResent(null)} disabled={resending.length > 0}>Done</Button>}
      >
        {resent && <InviteResults rows={resent} busy={resending.length > 0} onRetry={(failed) => resend(failed.map((r) => r.member))} />}
      </Modal>
    </div>
  )
}

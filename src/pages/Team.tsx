import { useState } from 'react'
import { RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '../store'
import { Avatar, Badge, Button, Modal, PageHeader } from '../components/ui'
import { InviteMemberModal, InviteOutcome } from '../components/InviteMemberModal'
import { sendInvite, type InviteResult } from '../lib/invites'
import type { Member, Role } from '../types'
import { entrySeconds, formatDuration } from '../lib/time'

const ROLES: Role[] = ['Owner', 'Admin', 'Manager', 'Member']

export default function Team() {
  const { state, dispatch, currentUser, can } = useStore()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [resent, setResent] = useState<{ email: string; res: InviteResult } | null>(null)

  const resend = async (m: Member) => {
    setResending(m.id)
    try {
      setResent({ email: m.email, res: await sendInvite(m.id) })
    } catch (e) {
      alert(`Could not send the invitation: ${(e as Error).message}`)
    } finally {
      setResending(null)
    }
  }

  const tracked = (id: string) => state.entries.filter((e) => e.userId === id).reduce((a, e) => a + entrySeconds(e), 0)
  const cur = state.settings.currency

  return (
    <div>
      <PageHeader title="Team">
        {can.admin && <Button onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Invite member</Button>}
      </PageHeader>
      <div className="ck-card overflow-x-auto">
        <table className="ck-table w-full min-w-[960px]">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Billable rate ({cur})</th><th>Cost rate ({cur})</th><th>Hours / day</th><th className="text-right">Tracked</th><th>Status</th><th className="w-12" /></tr></thead>
          <tbody>
            {state.members.map((m) => {
              const isMe = m.id === currentUser.id
              const patch = (p: Partial<typeof m>) => dispatch({ type: 'member/update', id: m.id, patch: p })
              return (
                <tr key={m.id} className="hover:bg-ck-bg/40">
                  <td>
                    <span className="inline-flex items-center gap-2"><Avatar name={m.name} size={28} /> {m.name} {isMe && <span className="text-xs text-ck-muted">(you)</span>}</span>
                  </td>
                  <td className="text-[#666]">{m.email}</td>
                  <td>
                    <select className="ck-select h-8" value={m.role} disabled={!can.admin || m.role === 'Owner'} onChange={(e) => patch({ role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r} value={r} disabled={r === 'Owner'}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" min={0} className="ck-input h-8 w-24" disabled={!can.admin} placeholder={`${state.settings.hourlyRate}`} value={m.hourlyRate ?? ''} onChange={(e) => patch({ hourlyRate: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} className="ck-input h-8 w-24" disabled={!can.admin} placeholder="0" value={m.costRate ?? ''} onChange={(e) => patch({ costRate: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} max={24} step={0.5} className="ck-input h-8 w-20" disabled={!can.admin} value={m.workingHours} onChange={(e) => patch({ workingHours: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="text-right font-mono">{formatDuration(tracked(m.id), state.settings.durationFormat)}</td>
                  <td>
                    {m.status === 'Active' ? <Badge tone="green">Active</Badge> : (
                      <span className="inline-flex items-center gap-2">
                        <Badge tone="orange">Invited</Badge>
                        {can.admin && (
                          <button type="button" className="inline-flex items-center gap-1 text-xs text-ck-blue hover:underline disabled:opacity-50" disabled={resending === m.id} onClick={() => resend(m)} title="Email a new invitation link">
                            <RefreshCw size={12} className={resending === m.id ? 'animate-spin' : undefined} /> Resend
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="text-center">
                    {/* an Owner row without an account is a leftover duplicate and can go */}
                    {can.admin && !isMe && (m.role !== 'Owner' || !m.authUserId) && (
                      <button type="button" className="text-ck-muted hover:text-ck-red" title="Remove" onClick={() => confirm(`Remove ${m.name} from the workspace? They lose access, and their time off, approvals and schedules are removed too.`) && dispatch({ type: 'member/delete', id: m.id })}>
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
      <p className="mt-3 text-xs text-ck-muted">
        Billable rate is what you charge for the member's time; cost rate is what the member costs you. Reports use both to show profit.
        Invited members join when they open their invitation link; Resend emails them a new one.
      </p>

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Modal open={!!resent} onClose={() => setResent(null)} title="Invitation" footer={<Button onClick={() => setResent(null)}>Done</Button>}>
        {resent && <InviteOutcome email={resent.email} result={resent.res} />}
      </Modal>
    </div>
  )
}

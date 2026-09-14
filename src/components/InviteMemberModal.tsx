import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, MailCheck, MailWarning } from 'lucide-react'
import { useStore, uid } from '../store'
import { sendInvite, type InviteResult } from '../lib/invites'
import { Button, Modal } from './ui'
import type { Member, Role } from '../types'

const INVITE_ROLES: Role[] = ['Member', 'Manager', 'Admin']

/** Adds a pending member (optionally with access to a project) and emails them an invitation. */
export function InviteMemberModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const { state, dispatch, flush } = useStore()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('Member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ email: string; res: InviteResult } | null>(null)

  const close = () => {
    setEmail(''); setName(''); setRole('Member'); setError(null); setResult(null); setBusy(false)
    onClose()
  }

  const submit = async () => {
    const em = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setError('Enter a valid email address.')
    if (state.members.some((m) => m.email.toLowerCase() === em.toLowerCase())) {
      return setError(projectId ? 'That person is already in the workspace: add them from the list instead.' : 'That person is already in the workspace.')
    }
    const member: Member = {
      id: uid(), name: name.trim() || em.split('@')[0], email: em, role, status: 'Pending',
      hourlyRate: null, costRate: null, workingHours: 8, authUserId: null,
    }
    setBusy(true); setError(null)
    dispatch({ type: 'member/add', member })
    if (projectId) dispatch({ type: 'project/addMember', projectId, memberId: member.id })
    // the edge function reads the member row, so it has to be saved first
    await flush()
    try {
      setResult({ email: em, res: await sendInvite(member.id) })
    } catch (e) {
      setError(`${member.name} was added, but the invitation could not be created: ${(e as Error).message}. Try "Resend" on the Team page.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? 'Invitation' : projectId ? 'Invite to project' : 'Invite member'}
      footer={result ? <Button onClick={close}>Done</Button> : (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send invitation'}</Button>
        </>
      )}
    >
      {result ? <InviteOutcome email={result.email} result={result.res} /> : (
        <div className="space-y-4">
          <div>
            <label className="ck-label">Email</label>
            <input autoFocus type="email" className="ck-input" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div>
              <label className="ck-label">Name (optional)</label>
              <input className="ck-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </div>
            <div>
              <label className="ck-label">Role</label>
              <select className="ck-select w-full" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {INVITE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          {error && <div className="rounded-sm bg-red-50 px-3 py-2 text-sm text-ck-red">{error}</div>}
          <p className="text-xs text-ck-muted">
            They get an email with a link to join{projectId ? ' and access to this project' : ''}. People without a Jamify account create one from that link.
            Members track their own time; managers also manage projects and approvals; admins manage people and settings.
          </p>
        </div>
      )}
    </Modal>
  )
}

/** What happened to an invitation email, plus the link to share by hand. */
export function InviteOutcome({ email, result }: { email: string; result: InviteResult }) {
  const { can } = useStore()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the field is selectable */
    }
  }
  return (
    <div className="space-y-4">
      {result.sent ? (
        <div className="flex gap-3 rounded-sm bg-green-50 px-3 py-2.5 text-sm text-green-800">
          <MailCheck size={18} className="mt-0.5 shrink-0" />
          <div>Invitation email sent to <b>{email}</b>. They join the workspace when they open the link.</div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-sm bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <MailWarning size={18} className="mt-0.5 shrink-0" />
          <div>
            <div>{result.error}</div>
            {result.reason === 'smtp_missing' && (
              <div className="mt-1">
                {can.admin ? <>Set up an SMTP server in <Link to="/settings#email" className="underline">Settings → Email</Link>, or send</> : 'Send'} the link below to {email} yourself.
              </div>
            )}
            {result.reason === 'smtp_error' && <div className="mt-1">Check the SMTP settings, or send the link below to {email} yourself.</div>}
          </div>
        </div>
      )}
      <div>
        <label className="ck-label">Invitation link</label>
        <div className="flex gap-2">
          <input readOnly className="ck-input font-mono text-xs" value={result.link} onFocus={(e) => e.target.select()} />
          <Button variant="outline" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</Button>
        </div>
        <p className="mt-1 text-xs text-ck-muted">Only {email} can use it. It expires in 14 days; sending a new invitation replaces it.</p>
      </div>
    </div>
  )
}

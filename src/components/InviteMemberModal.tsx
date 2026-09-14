import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, MailCheck, MailWarning, RefreshCw } from 'lucide-react'
import { useStore, uid } from '../store'
import { sendInvites, type InviteRow } from '../lib/invites'
import { Button, Modal, Spinner, cn } from './ui'
import { SmtpErrorHelp } from './SmtpErrorHelp'
import type { Member, Role } from '../types'

const INVITE_ROLES: Role[] = ['Member', 'Manager', 'Admin']
const ROLE_HELP: Record<string, string> = {
  Member: 'Tracks their own time on public projects and the private ones they are added to.',
  Manager: "Also manages projects, clients, approvals and everyone's time.",
  Admin: 'Also manages people, invitations and workspace settings.',
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Addresses separated by commas, semicolons, spaces or new lines, without duplicates. */
function parseEmails(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim()
    if (email && !out.some((x) => x.toLowerCase() === email.toLowerCase())) out.push(email)
  }
  return out
}

/** Adds pending members (optionally with access to a project) and emails each an invitation. */
export function InviteMemberModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const { state, dispatch, flush } = useStore()
  const [emails, setEmails] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('Member')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [rows, setRows] = useState<InviteRow[] | null>(null)

  const addresses = parseEmails(emails)
  const single = addresses.length <= 1
  const busy = progress !== null

  const close = () => {
    if (busy) return
    setEmails(''); setName(''); setRole('Member'); setError(null); setRows(null)
    onClose()
  }

  const run = async (members: Member[]) => {
    setProgress({ done: 0, total: members.length })
    const result = await sendInvites(members, (done) => setProgress({ done, total: members.length }))
    setProgress(null)
    setRows((prev) => (prev ? prev.map((r) => result.find((x) => x.member.id === r.member.id) ?? r) : result))
  }

  const submit = async () => {
    if (busy) return
    if (!addresses.length) return setError('Enter at least one email address.')
    const invalid = addresses.filter((a) => !EMAIL_RE.test(a))
    if (invalid.length) return setError(`Not a valid email address: ${invalid.join(', ')}`)
    const existing = addresses.filter((a) => state.members.some((m) => m.email.toLowerCase() === a.toLowerCase()))
    if (existing.length) {
      return setError(`Already in the workspace: ${existing.join(', ')}.${projectId ? ' Add them from the project member list instead.' : ''}`)
    }
    setError(null)
    const members: Member[] = addresses.map((email) => ({
      id: uid(), name: (single && name.trim()) || email.split('@')[0], email, role, status: 'Pending',
      hourlyRate: null, costRate: null, workingHours: 8, authUserId: null,
    }))
    for (const m of members) {
      dispatch({ type: 'member/add', member: m })
      if (projectId) dispatch({ type: 'project/addMember', projectId, memberId: m.id })
    }
    // the edge function reads the member rows, so they have to be saved first
    await flush()
    await run(members)
  }

  const sendingLabel = progress && (progress.total > 1 ? `Sending ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Sending…')

  return (
    <Modal
      open={open}
      onClose={close}
      width={520}
      title={rows ? (rows.length > 1 ? 'Invitations' : 'Invitation') : projectId ? 'Invite to project' : 'Invite members'}
      footer={rows ? <Button onClick={close} disabled={busy}>Done</Button> : (
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !addresses.length}>
            {busy ? <><Spinner /> {sendingLabel}</> : addresses.length > 1 ? `Send ${addresses.length} invitations` : 'Send invitation'}
          </Button>
        </>
      )}
    >
      {rows ? <InviteResults rows={rows} busy={busy} onRetry={(failed) => run(failed.map((r) => r.member))} /> : (
        <div className="space-y-4">
          <div>
            <label htmlFor="invite-emails" className="ck-label">Email {single ? 'address' : 'addresses'}</label>
            <input
              id="invite-emails" autoFocus inputMode="email" autoComplete="off" className="ck-input"
              placeholder="name@company.com, another@company.com"
              value={emails} onChange={(e) => { setEmails(e.target.value); setError(null) }} onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-invalid={!!error} aria-describedby="invite-emails-msg"
            />
            <p id="invite-emails-msg" role={error ? 'alert' : undefined} className={cn('mt-1 text-xs', error ? 'text-ck-red' : 'text-[#666]')}>
              {error ?? 'Invite several people at once by separating addresses with commas.'}
            </p>
          </div>
          <div className={cn('grid gap-4', single && 'sm:grid-cols-[1fr_150px]')}>
            {single && (
              <div>
                <label htmlFor="invite-name" className="ck-label">Name (optional)</label>
                <input id="invite-name" className="ck-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
              </div>
            )}
            <div>
              <label htmlFor="invite-role" className="ck-label">Role</label>
              <select id="invite-role" className="ck-select w-full" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-describedby="invite-role-help">
                {INVITE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <p id="invite-role-help" className="-mt-2 text-xs text-[#666]"><b>{role}:</b> {ROLE_HELP[role]}</p>
          <p className="rounded-sm bg-ck-bg px-3 py-2 text-xs text-[#555]">
            Each person gets an email with a link to join{projectId ? ' and access to this project' : ''}. People without a Jamify account create one from that link.
          </p>
        </div>
      )}
    </Modal>
  )
}

/** Per-person outcome of sending invitations, with a copyable link for each and a retry for failures. */
export function InviteResults({ rows, onRetry, busy }: { rows: InviteRow[]; onRetry?: (failed: InviteRow[]) => void; busy?: boolean }) {
  const { can } = useStore()
  const allSent = rows.every((r) => r.res?.sent)
  const smtpMissing = rows.some((r) => r.res?.reason === 'smtp_missing')
  const smtpError = rows.find((r) => r.res?.reason === 'smtp_error')?.res?.error
  const retryable = rows.filter((r) => r.error || r.res?.reason === 'smtp_error')
  const settingsLink = can.admin && <Link to="/settings#email" className="font-medium text-ck-blue-dark underline">Open email settings</Link>
  const retryButton = onRetry && retryable.length > 0 && (
    <button type="button" disabled={busy} onClick={() => onRetry(retryable)} className="inline-flex items-center gap-1 font-medium text-ck-blue-dark underline disabled:opacity-60">
      {busy ? <Spinner size={12} /> : <RefreshCw size={12} aria-hidden="true" />} Try again
    </button>
  )

  return (
    <div className="space-y-4">
      {allSent ? (
        <Notice tone="green" icon={<MailCheck size={18} />}>
          {rows.length === 1 ? <>Invitation email sent to <b>{rows[0].member.email}</b>.</> : <>{rows.length} invitation emails sent.</>} People join the workspace when they open their link.
        </Notice>
      ) : smtpMissing ? (
        <Notice tone="amber" icon={<MailWarning size={18} />}>
          <b>No email was sent</b> because this workspace has no SMTP server yet. Copy the {rows.length > 1 ? 'links' : 'link'} below and send {rows.length > 1 ? 'them' : 'it'} yourself.
          {settingsLink && <div className="mt-1">{settingsLink} to send invitations automatically.</div>}
        </Notice>
      ) : smtpError ? (
        <SmtpErrorHelp raw={smtpError} actions={<>{retryButton}{settingsLink}</>} />
      ) : (
        <Notice tone="amber" icon={<MailWarning size={18} />}>
          Some invitations could not be created. {retryButton}
        </Notice>
      )}
      <ul className="divide-y divide-ck-border-light rounded-sm border border-ck-border-light">
        {rows.map((r) => <InviteRowItem key={r.member.id} row={r} />)}
      </ul>
      <p className="text-xs text-[#666]">Each link works only for its address and expires in 14 days. Sending a new invitation replaces the old link.</p>
    </div>
  )
}

function InviteRowItem({ row }: { row: InviteRow }) {
  const [copied, setCopied] = useState(false)
  const link = row.res?.link
  const status = row.error
    ? { icon: MailWarning, cls: 'text-ck-red', text: `Invitation not created: ${row.error}` }
    : row.res?.sent
      ? { icon: MailCheck, cls: 'text-green-700', text: 'Email sent' }
      : { icon: MailWarning, cls: 'text-amber-800', text: 'Email not sent, share the link' }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: let the user copy it by hand
      window.prompt('Copy the invitation link', link)
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <status.icon size={18} className={cn('shrink-0', status.cls)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{row.member.email}</div>
        <div className={cn('text-xs', status.cls)}>{status.text}</div>
      </div>
      {link && (
        <Button size="sm" variant="outline" onClick={copy} aria-label={`Copy invitation link for ${row.member.email}`}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
        </Button>
      )}
    </li>
  )
}

function Notice({ tone, icon, children }: { tone: 'green' | 'amber'; icon: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className={cn('flex gap-3 rounded-sm px-3 py-2.5 text-sm', tone === 'green' ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900')}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

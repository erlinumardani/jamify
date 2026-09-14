import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, Send, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { Button, PasswordInput, Spinner, cn } from './ui'
import { SmtpErrorHelp } from './SmtpErrorHelp'
import { useFeedback } from './feedback'
import { deleteSmtpSettings, getSmtpSettings, saveSmtpSettings, sendTestEmail, type SmtpSettings as SavedSmtp } from '../lib/invites'

interface Provider {
  id: string
  label: string
  host: string
  /** fixed username, when the provider uses one */
  username?: string
  usernameHelp: string
  passwordHelp: string
  link?: { href: string; label: string }
  /** app passwords are shown in groups of four; the server wants them without spaces */
  stripSpaces?: boolean
}

// every preset accepts implicit TLS on 465, which Supabase Edge Functions can reach
const PROVIDERS: Provider[] = [
  {
    id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', stripSpaces: true,
    usernameHelp: 'Your full Gmail or Google Workspace address.',
    passwordHelp: 'An App Password (16 letters), not your normal password. It needs 2-Step Verification.',
    link: { href: 'https://myaccount.google.com/apppasswords', label: 'Create an App Password' },
  },
  {
    id: 'resend', label: 'Resend', host: 'smtp.resend.com', username: 'resend',
    usernameHelp: 'Always "resend".',
    passwordHelp: 'A Resend API key. Send from a domain you verified in Resend.',
    link: { href: 'https://resend.com/api-keys', label: 'Resend API keys' },
  },
  {
    id: 'sendgrid', label: 'SendGrid', host: 'smtp.sendgrid.net', username: 'apikey',
    usernameHelp: 'Always "apikey".',
    passwordHelp: 'A SendGrid API key with Mail Send access.',
    link: { href: 'https://app.sendgrid.com/settings/api_keys', label: 'SendGrid API keys' },
  },
  {
    id: 'mailgun', label: 'Mailgun', host: 'smtp.mailgun.org',
    usernameHelp: 'The SMTP login of your sending domain.',
    passwordHelp: 'The password of that SMTP login.',
  },
  {
    id: 'zoho', label: 'Zoho Mail', host: 'smtp.zoho.com',
    usernameHelp: 'Your Zoho Mail address.',
    passwordHelp: 'An app-specific password from your Zoho account security settings.',
  },
]

interface Form { host: string; port: string; secure: boolean; username: string; password: string; fromEmail: string; fromName: string }

const EMPTY: Form = { host: '', port: '465', secure: true, username: '', password: '', fromEmail: '', fromName: '' }
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const toForm = (s: SavedSmtp | null): Form =>
  s ? { host: s.host, port: String(s.port), secure: s.secure, username: s.username, password: '', fromEmail: s.fromEmail, fromName: s.fromName } : EMPTY

/** Per-workspace SMTP server used by the invite edge function. Admins only. */
export function SmtpSettings() {
  const { workspace } = useStore()
  const { user } = useAuth()
  const { confirm } = useFeedback()
  const [saved, setSaved] = useState<SavedSmtp | null | undefined>(undefined)
  const [form, setForm] = useState<Form>(EMPTY)
  const [other, setOther] = useState(false)
  const [editServer, setEditServer] = useState(false)
  const [touched, setTouched] = useState({ host: false, fromEmail: false })
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [smtpError, setSmtpError] = useState<string | null>(null)
  const hostRef = useRef<HTMLInputElement>(null)
  const fromRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    getSmtpSettings(workspace.id)
      .then((s) => { if (!cancelled) { setSaved(s); setForm(toForm(s)) } })
      .catch((e: Error) => { if (!cancelled) { setSaved(null); setNotice({ ok: false, text: e.message }) } })
    return () => { cancelled = true }
  }, [workspace.id])

  const provider = PROVIDERS.find((p) => p.host === form.host.trim().toLowerCase())
  const selected = provider?.id ?? (other || form.host.trim() ? 'other' : null)
  const port = Number(form.port)
  const portError = port === 25 || port === 587
    ? `Supabase can't open connections to port ${port}. Use 465 with SSL/TLS, or 2525 with STARTTLS.`
    : !Number.isInteger(port) || port < 1 || port > 65535 ? 'Port must be a number between 1 and 65535.' : null
  const hostError = touched.host && !form.host.trim() ? 'Enter the SMTP server, for example smtp.gmail.com.' : null
  const fromError = touched.fromEmail && !EMAIL_RE.test(form.fromEmail.trim()) ? 'Enter a valid address, for example no-reply@yourcompany.com.' : null
  const showServer = !provider || editServer || !!portError
  const senderMismatch = provider?.id === 'gmail' && EMAIL_RE.test(form.username.trim()) && EMAIL_RE.test(form.fromEmail.trim())
    && form.username.trim().toLowerCase() !== form.fromEmail.trim().toLowerCase()
  const dirty = !saved || form.password !== '' || form.host !== saved.host || port !== saved.port || form.secure !== saved.secure
    || form.username !== saved.username || form.fromEmail !== saved.fromEmail || form.fromName !== saved.fromName

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setNotice(null)
    setSmtpError(null)
  }

  const chooseProvider = (p: Provider) => {
    const presetUsername = PROVIDERS.some((x) => x.username && x.username === form.username)
    set({ host: p.host, port: '465', secure: true, username: p.username ?? (presetUsername ? '' : form.username) })
    setOther(false)
    setEditServer(false)
  }
  const chooseOther = () => {
    if (provider) set({ host: '', username: provider.username ? '' : form.username })
    setOther(true)
    setEditServer(true)
    requestAnimationFrame(() => hostRef.current?.focus())
  }

  const test = async (afterSave: boolean) => {
    setBusy('test')
    try {
      const r = await sendTestEmail(workspace.id)
      if (r.ok) setNotice({ ok: true, text: `${afterSave ? 'Saved. ' : ''}A test email was sent to ${r.to}. Check the inbox, and the spam folder if it isn't there.` })
      else setSmtpError(r.error ?? 'Unknown error')
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setTouched({ host: true, fromEmail: true })
    if (!form.host.trim() || portError) {
      setEditServer(true)
      requestAnimationFrame(() => hostRef.current?.focus())
      return
    }
    if (!EMAIL_RE.test(form.fromEmail.trim())) return fromRef.current?.focus()
    setBusy('save'); setNotice(null); setSmtpError(null)
    try {
      await saveSmtpSettings(workspace.id, {
        host: form.host, port, secure: form.secure, username: form.username,
        password: provider?.stripSpaces ? form.password.replace(/\s+/g, '') : form.password,
        fromEmail: form.fromEmail, fromName: form.fromName,
      })
      const s = await getSmtpSettings(workspace.id)
      setSaved(s)
      setForm(toForm(s))
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message })
      setBusy(null)
      return
    }
    await test(true)
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Remove email settings?',
      message: 'Invitations will no longer be emailed. You can still copy and share invitation links.',
      confirmLabel: 'Remove settings',
      danger: true,
    })
    if (!ok) return
    setBusy('remove'); setNotice(null); setSmtpError(null)
    try {
      await deleteSmtpSettings(workspace.id)
      setSaved(null); setForm(EMPTY); setOther(false)
      setNotice({ ok: true, text: 'SMTP settings removed. Inviting someone now shows a link to share instead of sending an email.' })
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  if (saved === undefined) return <div className="h-40 animate-pulse rounded-sm bg-ck-bg" aria-label="Loading email settings" />

  return (
    <div className="space-y-5">
      <div className={cn('flex items-start gap-3 rounded-sm px-3 py-2.5 text-sm', saved ? 'bg-green-50 text-green-900' : 'bg-ck-bg text-[#555]')}>
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', saved ? 'bg-ck-green' : 'bg-ck-muted')} aria-hidden="true" />
        <div>
          {saved
            ? <><b>Invitation emails are set up.</b> They are sent as {saved.fromName ? `${saved.fromName} <${saved.fromEmail}>` : saved.fromEmail} through {saved.host}:{saved.port}.</>
            : <><b>Invitation emails are off.</b> Until a server is set up, share each invitation link yourself.</>}
        </div>
      </div>

      <fieldset>
        <legend className="ck-label">Email provider</legend>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => <Chip key={p.id} selected={selected === p.id} onClick={() => chooseProvider(p)}>{p.label}</Chip>)}
          <Chip selected={selected === 'other'} onClick={chooseOther}>Other</Chip>
        </div>
      </fieldset>

      {selected && (
        <>
          {showServer ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_110px_160px]">
              <Field id="smtp-host" label="SMTP server" error={hostError}>
                <input
                  ref={hostRef} id="smtp-host" className="ck-input" placeholder="smtp.example.com" autoComplete="off"
                  value={form.host} onChange={(e) => set({ host: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, host: true }))}
                  aria-invalid={!!hostError} aria-describedby="smtp-host-msg"
                />
              </Field>
              <Field id="smtp-port" label="Port" error={portError}>
                <input
                  id="smtp-port" type="number" inputMode="numeric" min={1} max={65535} className="ck-input"
                  value={form.port} onChange={(e) => set({ port: e.target.value })} aria-invalid={!!portError} aria-describedby="smtp-port-msg"
                />
              </Field>
              <Field id="smtp-security" label="Security">
                <select
                  id="smtp-security" className="ck-select w-full" value={form.secure ? 'ssl' : 'starttls'}
                  onChange={(e) => {
                    const secure = e.target.value === 'ssl'
                    // follow the usual port for the mode unless a custom one was typed
                    set({ secure, port: secure && form.port === '2525' ? '465' : !secure && form.port === '465' ? '2525' : form.port })
                  }}
                >
                  <option value="ssl">SSL/TLS</option>
                  <option value="starttls">STARTTLS</option>
                </select>
              </Field>
            </div>
          ) : (
            <p className="text-sm text-[#555]">
              Server <b>{form.host}</b>, port {form.port}, {form.secure ? 'SSL/TLS' : 'STARTTLS'}.{' '}
              <button type="button" className="text-ck-blue hover:underline" onClick={() => setEditServer(true)}>Change</button>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="smtp-username" label="Username" help={provider?.usernameHelp}>
              <input
                id="smtp-username" className="ck-input" autoComplete="off" value={form.username}
                placeholder={provider?.id === 'gmail' ? 'you@gmail.com' : ''}
                onChange={(e) => set({ username: e.target.value })} aria-describedby="smtp-username-msg"
              />
            </Field>
            <Field
              id="smtp-password"
              label="Password"
              help={
                <>
                  {provider?.passwordHelp}
                  {saved?.hasPassword && <> Leave empty to keep the saved password.</>}
                  {provider?.link && (
                    <>{' '}<a href={provider.link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-ck-blue-dark underline">{provider.link.label}<ExternalLink size={11} aria-hidden="true" /></a></>
                  )}
                </>
              }
            >
              <PasswordInput
                id="smtp-password" autoComplete="new-password" value={form.password}
                placeholder={saved?.hasPassword ? '••••••••  saved' : ''}
                onChange={(e) => set({ password: e.target.value })} aria-describedby="smtp-password-msg"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="smtp-from" label="Send from" error={fromError} help="The address invitations come from.">
              <input
                ref={fromRef} id="smtp-from" type="email" className="ck-input" placeholder="no-reply@yourcompany.com"
                value={form.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, fromEmail: true }))}
                aria-invalid={!!fromError} aria-describedby="smtp-from-msg"
              />
            </Field>
            <Field id="smtp-from-name" label="Sender name" help="Shown as the sender in the inbox.">
              <input
                id="smtp-from-name" className="ck-input" placeholder={workspace.name}
                value={form.fromName} onChange={(e) => set({ fromName: e.target.value })} aria-describedby="smtp-from-name-msg"
              />
            </Field>
          </div>
          {senderMismatch && (
            <div className="rounded-sm bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Gmail sends as <b>{form.username.trim()}</b> unless {form.fromEmail.trim()} is added as a "Send mail as" address in Gmail.{' '}
              <button type="button" className="font-medium underline" onClick={() => set({ fromEmail: form.username.trim() })}>Send from {form.username.trim()}</button>
            </div>
          )}
        </>
      )}

      <div aria-live="polite" className="space-y-2 empty:hidden">
        {notice && (
          <div role={notice.ok ? 'status' : 'alert'} className={cn('rounded-sm px-3 py-2 text-sm', notice.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900')}>{notice.text}</div>
        )}
        {smtpError && <SmtpErrorHelp raw={smtpError} host={form.host} />}
      </div>

      {(selected || saved) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ck-border-light pt-4">
          {dirty ? (
            <Button onClick={save} disabled={!!busy}>
              {busy ? <><Spinner /> {busy === 'save' ? 'Saving…' : 'Sending test…'}</> : 'Save and send test'}
            </Button>
          ) : (
            <Button onClick={() => test(false)} disabled={!!busy}>
              {busy === 'test' ? <><Spinner /> Sending…</> : <><Send size={15} /> Send test email</>}
            </Button>
          )}
          {dirty && saved && <Button variant="ghost" disabled={!!busy} onClick={() => { setForm(toForm(saved)); setNotice(null); setSmtpError(null) }}>Discard changes</Button>}
          <span className="text-xs text-[#666]">The test goes to {user.email}.</span>
          {saved && !dirty && (
            <Button variant="ghost" className="ml-auto text-ck-red hover:bg-red-50" disabled={!!busy} onClick={remove}>
              {busy === 'remove' ? <Spinner /> : <Trash2 size={15} />} Remove
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-9 rounded-full border px-4 text-sm transition-colors',
        selected ? 'border-ck-blue bg-ck-blue-light font-medium text-ck-blue-dark' : 'border-ck-border bg-white text-[#555] hover:border-ck-blue hover:text-ck-text',
      )}
    >
      {children}
    </button>
  )
}

function Field({ id, label, help, error, children }: { id: string; label: string; help?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="ck-label">{label}</label>
      {children}
      {error
        ? <p id={`${id}-msg`} role="alert" className="mt-1 text-xs text-ck-red">{error}</p>
        : help ? <p id={`${id}-msg`} className="mt-1 text-xs text-[#666]">{help}</p> : null}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { Button } from './ui'
import { deleteSmtpSettings, getSmtpSettings, saveSmtpSettings, sendTestEmail, type SmtpSettings as SavedSmtp } from '../lib/invites'

const PRESETS = [
  { id: 'gmail', label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', username: '', hint: 'Username is your full address; password is an App Password (Google Account → Security → 2-Step Verification → App passwords).' },
  { id: 'resend', label: 'Resend', host: 'smtp.resend.com', username: 'resend', hint: 'Password is a Resend API key. The sender address must be on a domain verified in Resend.' },
  { id: 'sendgrid', label: 'SendGrid', host: 'smtp.sendgrid.net', username: 'apikey', hint: 'Username is literally "apikey"; password is a SendGrid API key.' },
  { id: 'mailgun', label: 'Mailgun', host: 'smtp.mailgun.org', username: '', hint: 'Use the SMTP login and password of your Mailgun sending domain.' },
  { id: 'zoho', label: 'Zoho Mail', host: 'smtp.zoho.com', username: '', hint: 'Username is your Zoho address; password is an app-specific password.' },
]

interface Form { host: string; port: string; secure: boolean; username: string; password: string; fromEmail: string; fromName: string }

const EMPTY: Form = { host: '', port: '465', secure: true, username: '', password: '', fromEmail: '', fromName: '' }
const toForm = (s: SavedSmtp | null): Form =>
  s ? { host: s.host, port: String(s.port), secure: s.secure, username: s.username, password: '', fromEmail: s.fromEmail, fromName: s.fromName } : EMPTY

/** Per-workspace SMTP server used by the invite edge function. Admins only. */
export function SmtpSettings() {
  const { workspace } = useStore()
  const { user } = useAuth()
  const [saved, setSaved] = useState<SavedSmtp | null | undefined>(undefined)
  const [form, setForm] = useState<Form>(EMPTY)
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setSaved(undefined)
    getSmtpSettings(workspace.id)
      .then((s) => { if (!cancelled) { setSaved(s); setForm(toForm(s)) } })
      .catch((e: Error) => { if (!cancelled) { setSaved(null); setMessage({ ok: false, text: e.message }) } })
    return () => { cancelled = true }
  }, [workspace.id])

  const set = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setMessage(null) }
  const port = Number(form.port)
  const blockedPort = port === 25 || port === 587
  const dirty = !saved || form.password !== '' || form.host !== saved.host || port !== saved.port || form.secure !== saved.secure
    || form.username !== saved.username || form.fromEmail !== saved.fromEmail || form.fromName !== saved.fromName

  const run = async (kind: 'save' | 'test' | 'remove', fn: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(kind); setMessage(null)
    try {
      setMessage(await fn())
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const save = () => run('save', async () => {
    await saveSmtpSettings(workspace.id, {
      host: form.host, port, secure: form.secure, username: form.username, password: form.password,
      fromEmail: form.fromEmail, fromName: form.fromName,
    })
    const s = await getSmtpSettings(workspace.id)
    setSaved(s); setForm(toForm(s))
    return { ok: true, text: 'Saved. Send a test email to check that the server accepts it.' }
  })

  const test = () => run('test', async () => {
    const r = await sendTestEmail(workspace.id)
    return r.ok ? { ok: true, text: `Test email sent to ${r.to}. Check the inbox (and the spam folder).` } : { ok: false, text: `Sending failed: ${r.error}` }
  })

  const remove = () => {
    if (!confirm('Remove the SMTP settings? Invitations will no longer be emailed, but you can still copy and share invitation links.')) return
    void run('remove', async () => {
      await deleteSmtpSettings(workspace.id)
      setSaved(null); setForm(EMPTY)
      return { ok: true, text: 'SMTP settings removed.' }
    })
  }

  if (saved === undefined) return <div className="text-sm text-ck-muted">Loading…</div>

  return (
    <div className="space-y-4">
      <div>
        <label className="ck-label">Provider</label>
        <select
          className="ck-select w-full sm:w-80"
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value)
            if (!p) return
            set({ host: p.host, port: '465', secure: true, ...(p.username ? { username: p.username } : {}) })
            setHint(p.hint)
          }}
        >
          <option value="">Fill in from a provider…</option>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {hint && <p className="mt-1 text-xs text-[#666]">{hint}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_100px_160px]">
        <div>
          <label className="ck-label">SMTP host</label>
          <input className="ck-input" placeholder="smtp.example.com" value={form.host} onChange={(e) => set({ host: e.target.value })} autoComplete="off" />
        </div>
        <div>
          <label className="ck-label">Port</label>
          <input type="number" min={1} max={65535} className="ck-input" value={form.port} onChange={(e) => set({ port: e.target.value })} />
        </div>
        <div>
          <label className="ck-label">Security</label>
          <select
            className="ck-select w-full"
            value={form.secure ? 'ssl' : 'starttls'}
            onChange={(e) => {
              const secure = e.target.value === 'ssl'
              // follow the usual port for the chosen mode unless a custom one was typed
              const port = secure && form.port === '2525' ? '465' : !secure && form.port === '465' ? '2525' : form.port
              set({ secure, port })
            }}
          >
            <option value="ssl">SSL/TLS</option>
            <option value="starttls">STARTTLS</option>
          </select>
        </div>
      </div>
      {blockedPort && (
        <p className="text-xs text-ck-red">
          Supabase Edge Functions can't connect to port {port}. Use 465 with SSL/TLS or 2525 with STARTTLS; most providers offer one of them.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="ck-label">Username</label>
          <input className="ck-input" value={form.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" />
        </div>
        <div>
          <label className="ck-label">Password</label>
          <input
            type="password"
            className="ck-input"
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder={saved?.hasPassword ? 'Saved (leave empty to keep)' : ''}
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="ck-label">Sender email</label>
          <input type="email" className="ck-input" placeholder="no-reply@yourcompany.com" value={form.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} />
        </div>
        <div>
          <label className="ck-label">Sender name</label>
          <input className="ck-input" placeholder={workspace.name} value={form.fromName} onChange={(e) => set({ fromName: e.target.value })} />
        </div>
      </div>

      {message && (
        <div className={message.ok ? 'rounded-sm bg-green-50 px-3 py-2 text-sm text-green-800' : 'rounded-sm bg-red-50 px-3 py-2 text-sm text-ck-red'}>{message.text}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!!busy || !dirty || !form.host.trim() || !form.fromEmail.trim() || blockedPort}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" onClick={test} disabled={!!busy || !saved || dirty} title={dirty ? 'Save your changes first' : undefined}>
          <Send size={15} /> {busy === 'test' ? 'Sending…' : 'Send test email'}
        </Button>
        {saved && <Button variant="ghost" onClick={remove} disabled={!!busy}><Trash2 size={15} /> Remove</Button>}
        {saved && !dirty && <span className="text-xs text-ck-muted">The test goes to {user.email}.</span>}
      </div>
    </div>
  )
}

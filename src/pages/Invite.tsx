import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { acceptInvitation, getInvitation, signUpFromInvite, type InvitationInfo } from '../lib/invites'
import { PENDING_INVITE_KEY, WORKSPACE_KEY, readLocal, writeLocal } from '../lib/local'
import { GoogleIcon } from '../auth'
import { Avatar, PasswordInput, Spinner } from '../components/ui'

/** /invite/:token — works signed out: log in or create the invited account, then join the workspace. */
export default function InvitePage({ token }: { token: string }) {
  const [info, setInfo] = useState<InvitationInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // back from Google sign-in started on this page: join without another click
  const [autoAccept] = useState(() => readLocal(PENDING_INVITE_KEY) === token)

  useEffect(() => {
    writeLocal(PENDING_INVITE_KEY, null)
    getInvitation(token)
      .then((i) => { setInfo(i); setName(i.memberName ?? '') })
      .catch((e: Error) => setLoadError(e.message))
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [token])

  const email = info?.email ?? ''
  const signedInAs = session?.user.email ?? ''
  const emailMatches = !!session && signedInAs.toLowerCase() === email.toLowerCase()

  const accept = async () => {
    setBusy(true); setError(null)
    try {
      const workspaceId = await acceptInvitation(token)
      writeLocal(WORKSPACE_KEY, workspaceId)
      window.location.replace('/')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  useEffect(() => {
    if (autoAccept && emailMatches && (info?.status === 'valid' || info?.status === 'accepted')) void accept()
    // accept() only reads token; run once the session and invitation are known
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAccept, emailMatches, info?.status])

  const logIn = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setBusy(false); return }
    await accept()
  }

  const signUp = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await signUpFromInvite(token, password, name)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await accept()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const continueWithGoogle = async () => {
    setBusy(true); setError(null)
    // the OAuth redirect lands on the app root; AuthProvider sends the user back here
    writeLocal(PENDING_INVITE_KEY, token)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account', login_hint: email } },
    })
    if (error) { writeLocal(PENDING_INVITE_KEY, null); setError(error.message); setBusy(false) }
  }

  if (loadError) return <Shell><p className="text-sm text-ck-red">{loadError}</p><HomeLink /></Shell>
  if (!info || session === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-6"><span className="h-5 w-5 animate-spin rounded-full border-2 border-ck-border border-t-ck-blue" /></div>
      </Shell>
    )
  }
  if (info.status === 'invalid') {
    return <Shell title="Invitation not found"><p className="text-sm text-[#666]">This invitation link is not valid. It may have been replaced by a newer invitation.</p><HomeLink /></Shell>
  }
  if (info.status === 'expired') {
    return <Shell title="Invitation expired"><p className="text-sm text-[#666]">Ask {info.inviterName ?? 'the person who invited you'} to send a new invitation.</p><HomeLink /></Shell>
  }
  if (info.status === 'accepted' && !emailMatches) {
    return <Shell title="Invitation already accepted"><p className="text-sm text-[#666]">Log in as {email} to open {info.workspaceName}.</p><HomeLink /></Shell>
  }

  const googleButton = (
    <button
      type="button"
      onClick={continueWithGoogle}
      disabled={busy}
      className="flex h-10 w-full items-center justify-center gap-3 rounded-sm border border-ck-border bg-white text-sm font-medium text-ck-text transition-colors hover:bg-ck-bg disabled:opacity-60"
    >
      <GoogleIcon /> Continue with Google
    </button>
  )

  return (
    <Shell title={`Join ${info.workspaceName}`}>
      <div className="flex items-center gap-3">
        <Avatar name={info.workspaceName ?? 'Workspace'} size={40} />
        <p className="text-sm text-[#555]">
          {info.inviterName ? <><b>{info.inviterName}</b> invited you to track time in </> : 'You were invited to '}
          <b>{info.workspaceName}</b> on Jamify.
        </p>
      </div>
      <div className="rounded-sm bg-ck-bg px-3 py-2 text-sm text-[#555]">Invitation for <b>{email}</b></div>

      {session ? (
        emailMatches ? (
          <button type="button" onClick={accept} disabled={busy} className={primaryCls}>
            {busy ? <><Spinner /> Joining…</> : info.status === 'accepted' ? 'Open workspace' : 'Join workspace'}
          </button>
        ) : (
          <>
            <p className="text-sm text-[#555]">You're logged in as <b>{signedInAs}</b>. Log out and continue as {email} to accept this invitation.</p>
            <button type="button" onClick={() => supabase.auth.signOut()} className={primaryCls}>Log out and continue</button>
          </>
        )
      ) : info.userExists ? (
        <form onSubmit={logIn} className="space-y-4">
          {googleButton}
          <Divider />
          <div>
            <label htmlFor="invite-password" className="ck-label">Password</label>
            <PasswordInput id="invite-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" autoFocus />
          </div>
          <button type="submit" disabled={busy} className={primaryCls}>{busy ? <><Spinner /> Logging in…</> : 'Log in and join'}</button>
        </form>
      ) : (
        <form onSubmit={signUp} className="space-y-4">
          {googleButton}
          <Divider />
          <div>
            <label htmlFor="invite-name" className="ck-label">Your name</label>
            <input id="invite-name" className="ck-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="name" />
          </div>
          <div>
            <label htmlFor="invite-new-password" className="ck-label">Choose a password</label>
            <PasswordInput id="invite-new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" autoFocus aria-describedby="invite-new-password-help" />
            <p id="invite-new-password-help" className="mt-1 text-xs text-[#666]">You'll log in with {email} and this password.</p>
          </div>
          <button type="submit" disabled={busy} className={primaryCls}>{busy ? <><Spinner /> Creating account…</> : 'Create account and join'}</button>
        </form>
      )}
      {error && <div role="alert" className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>}
    </Shell>
  )
}

const primaryCls = 'inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-ck-blue text-sm font-medium uppercase tracking-wide text-white hover:bg-ck-blue-dark disabled:opacity-60'

function Shell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-ck-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-2xl font-medium tracking-tight">jamify</span>
        </div>
        <div className="ck-card space-y-4 p-6">
          {title && <h1 className="text-lg font-normal">{title}</h1>}
          {children}
        </div>
      </div>
    </div>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ck-muted">
      <span className="h-px flex-1 bg-ck-border-light" />
      or
      <span className="h-px flex-1 bg-ck-border-light" />
    </div>
  )
}

function HomeLink() {
  return <a href="/" className="inline-block text-sm text-ck-blue hover:underline">Go to Jamify</a>
}

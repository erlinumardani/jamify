import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

interface AuthApi {
  user: AuthUser
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthApi | null>(null)

function toUser(s: Session): AuthUser {
  const email = s.user.email ?? ''
  const meta = s.user.user_metadata as { name?: string; full_name?: string; avatar_url?: string; picture?: string } | undefined
  return {
    id: s.user.id,
    email,
    name: meta?.name || meta?.full_name || email.split('@')[0] || 'Me',
    avatarUrl: meta?.avatar_url || meta?.picture || null,
  }
}

/** Reads an OAuth error that Supabase appended to the URL after a failed redirect, then cleans the URL. */
function takeOAuthError(): string | null {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const desc = url.searchParams.get('error_description') ?? hash.get('error_description')
  const code = url.searchParams.get('error') ?? hash.get('error')
  if (!desc && !code) return null
  for (const k of ['error', 'error_code', 'error_description']) url.searchParams.delete(k)
  window.history.replaceState({}, '', url.pathname + url.search)
  return desc ? desc.replace(/\+/g, ' ') : code
}

export function AuthProvider({ children }: { children: (user: AuthUser) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // drop the ?code=... left behind by the OAuth redirect
      if (event === 'SIGNED_IN' && new URL(window.location.href).searchParams.has('code')) {
        const url = new URL(window.location.href)
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.pathname + url.search)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-ck-border border-t-ck-blue" />
      </div>
    )
  }
  if (!session) return <AuthPage />

  const user = toUser(session)
  return (
    <AuthContext.Provider value={{ user, signOut: async () => { await supabase.auth.signOut() } }}>
      {children(user)}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(() => takeOAuthError())
  const [notice, setNotice] = useState<string | null>(null)

  const signInWithGoogle = async () => {
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    })
    if (error) { setError(error.message); setBusy(false) }
    // on success the browser navigates away to Google
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() || undefined } } })
        if (error) throw error
        if (!data.session) setNotice('Account created. Check your inbox and confirm your email address, then sign in.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-ck-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-2xl font-medium tracking-tight">jamify</span>
        </div>
        <form onSubmit={submit} className="ck-card space-y-4 p-6">
          <h1 className="text-lg font-normal">{mode === 'signin' ? 'Log in' : 'Create your account'}</h1>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="flex h-10 w-full items-center justify-center gap-3 rounded-sm border border-ck-border bg-white text-sm font-medium text-ck-text transition-colors hover:bg-ck-bg disabled:opacity-60"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ck-muted">
            <span className="h-px flex-1 bg-ck-border-light" />
            or
            <span className="h-px flex-1 bg-ck-border-light" />
          </div>
          {mode === 'signup' && (
            <div>
              <label className="ck-label">Name</label>
              <input className="ck-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </div>
          )}
          <div>
            <label className="ck-label">Email</label>
            <input className="ck-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" autoFocus />
          </div>
          <div>
            <label className="ck-label">Password</label>
            <input className="ck-input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </div>
          {error && <div className="rounded-sm bg-red-50 px-3 py-2 text-sm text-ck-red">{error}</div>}
          {notice && <div className="rounded-sm bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}
          <button type="submit" disabled={busy} className="h-10 w-full rounded-sm bg-ck-blue text-sm font-medium uppercase tracking-wide text-white hover:bg-ck-blue-dark disabled:opacity-60">
            {busy ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
          <div className="text-center text-sm text-[#666]">
            {mode === 'signin' ? (
              <>Don't have an account? <button type="button" className="text-ck-blue hover:underline" onClick={() => { setMode('signup'); setError(null) }}>Sign up</button></>
            ) : (
              <>Already have an account? <button type="button" className="text-ck-blue hover:underline" onClick={() => { setMode('signin'); setError(null) }}>Log in</button></>
            )}
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-ck-muted">Your data is stored securely in Supabase and only visible to you.</p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

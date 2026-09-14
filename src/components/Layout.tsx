import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Briefcase, Calendar, CalendarRange, Check, ChevronDown, ClipboardCheck, Clock, FileText, FolderKanban,
  HelpCircle, LayoutDashboard, LogOut, Menu, Palmtree, Plus, Receipt, Settings, Square, Table2, Tag, Users, X,
} from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { Avatar, Button, Modal, Popover, Spinner, cn } from './ui'
import { entrySeconds, formatDuration } from '../lib/time'

const nav = [
  { section: 'Track', items: [
    { to: '/tracker', label: 'Time Tracker', icon: Clock },
    { to: '/calendar', label: 'Calendar', icon: Calendar },
    { to: '/timesheet', label: 'Timesheet', icon: Table2 },
    { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
    { to: '/time-off', label: 'Time Off', icon: Palmtree },
    { to: '/schedule', label: 'Schedule', icon: CalendarRange },
  ]},
  { section: 'Analyze', items: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/expenses', label: 'Expenses', icon: Receipt },
    { to: '/invoices', label: 'Invoices', icon: FileText },
  ]},
  { section: 'Manage', items: [
    { to: '/projects', label: 'Projects', icon: FolderKanban },
    { to: '/team', label: 'Team', icon: Users },
    { to: '/clients', label: 'Clients', icon: Briefcase },
    { to: '/tags', label: 'Tags', icon: Tag },
  ]},
]

const linkCls = (isActive: boolean) =>
  cn(
    'flex items-center gap-3 border-l-[3px] py-1.5 pl-[17px] pr-4 text-sm transition-colors',
    isActive ? 'border-ck-blue bg-ck-blue-light text-ck-blue-dark' : 'border-transparent text-[#555] hover:bg-black/[0.03] hover:text-ck-text',
  )

export default function Layout() {
  const { state, running, now, currentUser, stopTimer, syncError, clearSyncError } = useStore()
  const { user, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const showMiniTimer = running && !location.pathname.startsWith('/tracker')

  // every page opens at the top instead of the previous page's scroll position
  useEffect(() => { mainRef.current?.scrollTo(0, 0) }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])
  const pending = state.approvals.filter((a) => a.status === 'Pending').length + state.timeOffRequests.filter((r) => r.status === 'Pending').length

  const sidebar = (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-ck-border-light bg-ck-sidebar">
      <div className="flex h-14 items-center gap-2 px-5">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <span className="text-lg font-medium tracking-tight">jamify</span>
        <button type="button" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-ck-muted hover:bg-black/5 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-1">
        {nav.map((group) => (
          <div key={group.section} className="mb-2">
            <div className="px-5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ck-muted">{group.section}</div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => linkCls(isActive)}>
                <item.icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.to === '/approvals' && pending > 0 && (
                  <span className="min-w-[18px] rounded-full bg-ck-blue px-1.5 text-center text-[10px] font-medium leading-[18px] text-white">
                    {pending}<span className="sr-only"> waiting for a decision</span>
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-ck-border-light py-2">
        <NavLink to="/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => linkCls(isActive)}>
          <Settings size={18} strokeWidth={1.75} />
          Settings
        </NavLink>
        <a href="https://github.com/erlinumardani/jamify#readme" target="_blank" rel="noreferrer" className={linkCls(false)}>
          <HelpCircle size={18} strokeWidth={1.75} />
          Help
        </a>
      </div>
    </aside>
  )

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded-sm focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg">
        Skip to content
      </a>
      <div className="hidden h-full lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
          <div className="h-full shadow-2xl">{sidebar}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ck-border-light bg-white px-4 lg:px-6">
          <button type="button" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-[#555] hover:bg-black/5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
            <Menu size={22} />
          </button>
          <WorkspaceSwitcher />
          <span className="hidden rounded-sm bg-ck-blue-light px-2 py-0.5 text-[11px] font-medium uppercase text-ck-blue-dark sm:inline">Pro</span>

          <div className="ml-auto flex items-center gap-3">
            {showMiniTimer && (
              <div className="flex items-center gap-1 rounded-sm border border-ck-border-light bg-ck-bg py-0.5 pl-2 pr-0.5 text-sm">
                <NavLink to="/tracker" className="flex items-center gap-2 rounded-sm px-0.5 hover:text-ck-blue" aria-label="Timer running, open the time tracker">
                  <span className="h-2 w-2 rounded-full bg-ck-red ck-pulse" aria-hidden="true" />
                  <span className="font-mono tabular-nums">{formatDuration(entrySeconds(running, now))}</span>
                </NavLink>
                <button
                  type="button"
                  onClick={stopTimer}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-ck-red text-white hover:bg-ck-red-dark"
                  aria-label="Stop timer"
                  title="Stop timer"
                >
                  <Square size={10} fill="currentColor" aria-hidden="true" />
                </button>
              </div>
            )}
            <Popover
              align="right"
              width={240}
              trigger={() => (
                <button type="button" className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-black/5" aria-label="Account menu" aria-haspopup="menu">
                  <span className="hidden text-sm text-[#555] md:inline">{currentUser.name}</span>
                  <Avatar name={currentUser.name} size={30} src={user.avatarUrl} />
                </button>
              )}
            >
              {() => (
                <div className="py-1 text-sm">
                  <div className="border-b border-ck-border-light px-3 py-2">
                    <div className="font-medium">{user.name}</div>
                    <div className="truncate text-xs text-ck-muted">{user.email}</div>
                  </div>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-ck-bg" onClick={() => signOut()}>
                    <LogOut size={15} /> Log out
                  </button>
                </div>
              )}
            </Popover>
          </div>
        </header>

        {syncError && (
          <div role="alert" className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
            <AlertTriangle size={16} className="shrink-0 text-ck-red" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{syncError}</span>
            <button type="button" className="text-xs font-medium uppercase hover:underline" onClick={() => window.location.reload()}>Reload</button>
            <button type="button" className="text-xs font-medium uppercase hover:underline" onClick={clearSyncError}>Dismiss</button>
          </div>
        )}
        <main ref={mainRef} id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          <div className="mx-auto max-w-[1280px] p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function WorkspaceSwitcher() {
  const { workspace, workspaces, switchWorkspace, can } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const itemCls = 'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ck-bg'

  return (
    <>
    <Popover
      width={260}
      trigger={() => (
        <button type="button" className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium hover:bg-black/5">
          <span className="max-w-[200px] truncate">{workspace.name}</span>
          <ChevronDown size={16} className="text-ck-muted" />
        </button>
      )}
    >
      {(close) => (
        <div className="py-1 text-sm">
          <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ck-muted">Workspaces</div>
          {workspaces.map((w) => (
            <button key={w.id} type="button" className={itemCls} onClick={() => { close(); if (w.id !== workspace.id) switchWorkspace(w.id) }}>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.ownerId !== user.id && <span className="text-[10px] font-medium uppercase text-ck-muted">joined</span>}
              {w.id === workspace.id && <Check size={15} className="shrink-0 text-ck-blue" />}
            </button>
          ))}
          <div className="my-1 border-t border-ck-border-light" />
          {can.admin && (
            <button type="button" className={itemCls} onClick={() => { close(); navigate('/settings') }}>
              <Settings size={15} className="text-ck-muted" /> Workspace settings
            </button>
          )}
          <button type="button" className={itemCls} onClick={() => { close(); setCreating(true) }}>
            <Plus size={15} className="text-ck-muted" /> Create workspace
          </button>
        </div>
      )}
    </Popover>
    <CreateWorkspaceModal open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createWorkspace } = useStore()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setName(''); setError(null)
    onClose()
  }
  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true); setError(null)
    try {
      // switches to the new workspace, which reloads the app
      await createWorkspace(name.trim())
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create workspace"
      footer={<>
        <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !name.trim()}>{busy ? <><Spinner /> Creating…</> : 'Create'}</Button>
      </>}
    >
      <label htmlFor="new-workspace-name" className="ck-label">Workspace name</label>
      <input
        id="new-workspace-name" autoFocus className="ck-input" placeholder="e.g. Acme Studio" value={name}
        onChange={(e) => { setName(e.target.value); setError(null) }} onKeyDown={(e) => e.key === 'Enter' && submit()}
        aria-invalid={!!error} aria-describedby="new-workspace-msg"
      />
      <p id="new-workspace-msg" role={error ? 'alert' : undefined} className={cn('mt-1 text-xs', error ? 'text-ck-red' : 'text-[#666]')}>
        {error ?? "You'll own it and can invite people. Switch between workspaces from this menu."}
      </p>
    </Modal>
  )
}

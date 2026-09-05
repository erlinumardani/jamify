import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Briefcase, Calendar, CalendarRange, ChevronDown, ClipboardCheck, Clock, FileText, FolderKanban,
  HelpCircle, LayoutDashboard, LogOut, Menu, Palmtree, Receipt, Settings, Square, Table2, Tag, Users, X,
} from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { Avatar, Popover, cn } from './ui'
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
  const showMiniTimer = running && !location.pathname.startsWith('/tracker')
  const pending = state.approvals.filter((a) => a.status === 'Pending').length + state.timeOffRequests.filter((r) => r.status === 'Pending').length

  const sidebar = (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-ck-border-light bg-ck-sidebar">
      <div className="flex h-14 items-center gap-2 px-5">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <span className="text-lg font-medium tracking-tight">jamify</span>
        <button type="button" className="ml-auto text-ck-muted lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-1">
        {nav.map((group) => (
          <div key={group.section} className="mb-2">
            <div className="px-5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ck-muted">{group.section}</div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => linkCls(isActive)}>
                <item.icon size={18} strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                {item.to === '/approvals' && pending > 0 && <span className="rounded-full bg-ck-blue px-1.5 text-[10px] font-medium text-white">{pending}</span>}
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
      <div className="hidden h-full lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="h-full shadow-2xl">{sidebar}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ck-border-light bg-white px-4 lg:px-6">
          <button type="button" className="text-[#555] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <NavLink to="/settings" className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium hover:bg-black/5">
            <span className="max-w-[200px] truncate">{state.settings.workspaceName}</span>
            <ChevronDown size={16} className="text-ck-muted" />
          </NavLink>
          <span className="hidden rounded-sm bg-ck-blue-light px-2 py-0.5 text-[11px] font-medium uppercase text-ck-blue-dark sm:inline">Pro</span>

          <div className="ml-auto flex items-center gap-3">
            {showMiniTimer && (
              <NavLink to="/tracker" className="flex items-center gap-2 rounded-sm border border-ck-border-light bg-ck-bg px-2.5 py-1 text-sm hover:border-ck-blue">
                <span className="h-2 w-2 rounded-full bg-ck-red ck-pulse" />
                <span className="font-mono tabular-nums">{formatDuration(entrySeconds(running, now))}</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); stopTimer() }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-ck-red text-white hover:bg-ck-red-dark"
                  title="Stop timer"
                >
                  <Square size={9} fill="currentColor" />
                </button>
              </NavLink>
            )}
            <Popover
              align="right"
              width={240}
              trigger={() => (
                <button type="button" className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-black/5">
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
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-ck-red">
            <AlertTriangle size={16} />
            <span className="min-w-0 flex-1 truncate">{syncError}</span>
            <button type="button" className="text-xs font-medium uppercase hover:underline" onClick={() => window.location.reload()}>Reload</button>
            <button type="button" className="text-xs font-medium uppercase hover:underline" onClick={clearSyncError}>Dismiss</button>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1280px] p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

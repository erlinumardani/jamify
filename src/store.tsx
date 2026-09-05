import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  AppState, Client, CollectionName, EntryDraft, Expense, Member, Project, Settings, Tag, Task, TimeEntry,
} from './types'
import { emptyState, loadState, persist } from './lib/db'
import type { AuthUser } from './auth'

const uid = () => crypto.randomUUID()

type CollectionItem = AppState[CollectionName][number]

export type Action =
  | { type: 'entry/add'; entry: TimeEntry }
  | { type: 'entry/addMany'; entries: TimeEntry[] }
  | { type: 'entry/update'; id: string; patch: Partial<TimeEntry> }
  | { type: 'entry/updateMany'; ids: string[]; patch: Partial<TimeEntry> }
  | { type: 'entry/delete'; id: string }
  | { type: 'entry/deleteMany'; ids: string[] }
  | { type: 'timer/start'; entry: TimeEntry }
  | { type: 'timer/stop'; at: string }
  | { type: 'project/add'; project: Project }
  | { type: 'project/update'; id: string; patch: Partial<Project> }
  | { type: 'project/delete'; id: string }
  | { type: 'task/add'; projectId: string; task: Task }
  | { type: 'task/update'; projectId: string; taskId: string; patch: Partial<Task> }
  | { type: 'task/delete'; projectId: string; taskId: string }
  | { type: 'client/add'; client: Client }
  | { type: 'client/update'; id: string; patch: Partial<Client> }
  | { type: 'client/delete'; id: string }
  | { type: 'tag/add'; tag: Tag }
  | { type: 'tag/update'; id: string; patch: Partial<Tag> }
  | { type: 'tag/delete'; id: string }
  | { type: 'member/add'; member: Member }
  | { type: 'member/update'; id: string; patch: Partial<Member> }
  | { type: 'member/delete'; id: string }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'col/add'; col: CollectionName; row: CollectionItem }
  | { type: 'col/update'; col: CollectionName; id: string; patch: Partial<CollectionItem> }
  | { type: 'col/delete'; col: CollectionName; id: string }
  | { type: 'expense/updateMany'; ids: string[]; patch: Partial<Expense> }
  | { type: 'state/replace'; state: AppState }

export function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case 'entry/add':
      return { ...state, entries: [a.entry, ...state.entries] }
    case 'entry/addMany':
      return { ...state, entries: [...a.entries, ...state.entries] }
    case 'entry/update':
      return { ...state, entries: state.entries.map((e) => (e.id === a.id ? { ...e, ...a.patch } : e)) }
    case 'entry/updateMany': {
      const set = new Set(a.ids)
      return { ...state, entries: state.entries.map((e) => (set.has(e.id) ? { ...e, ...a.patch } : e)) }
    }
    case 'entry/delete':
      return { ...state, entries: state.entries.filter((e) => e.id !== a.id) }
    case 'entry/deleteMany': {
      const set = new Set(a.ids)
      return { ...state, entries: state.entries.filter((e) => !set.has(e.id)) }
    }
    case 'timer/start': {
      const entries = state.entries.map((e) => (e.end === null ? { ...e, end: a.entry.start } : e))
      return { ...state, entries: [a.entry, ...entries] }
    }
    case 'timer/stop':
      return { ...state, entries: state.entries.map((e) => (e.end === null ? { ...e, end: a.at } : e)) }
    case 'project/add':
      return { ...state, projects: [...state.projects, a.project] }
    case 'project/update':
      return { ...state, projects: state.projects.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) }
    case 'project/delete':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== a.id),
        entries: state.entries.map((e) => (e.projectId === a.id ? { ...e, projectId: null, taskId: null } : e)),
        expenses: state.expenses.map((x) => (x.projectId === a.id ? { ...x, projectId: null } : x)),
        schedules: state.schedules.map((x) => (x.projectId === a.id ? { ...x, projectId: null } : x)),
      }
    case 'task/add':
      return { ...state, projects: state.projects.map((p) => (p.id === a.projectId ? { ...p, tasks: [...p.tasks, a.task] } : p)) }
    case 'task/update':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === a.projectId ? { ...p, tasks: p.tasks.map((t) => (t.id === a.taskId ? { ...t, ...a.patch } : t)) } : p,
        ),
      }
    case 'task/delete':
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === a.projectId ? { ...p, tasks: p.tasks.filter((t) => t.id !== a.taskId) } : p)),
        entries: state.entries.map((e) => (e.taskId === a.taskId ? { ...e, taskId: null } : e)),
      }
    case 'client/add':
      return { ...state, clients: [...state.clients, a.client] }
    case 'client/update':
      return { ...state, clients: state.clients.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)) }
    case 'client/delete':
      return {
        ...state,
        clients: state.clients.filter((c) => c.id !== a.id),
        projects: state.projects.map((p) => (p.clientId === a.id ? { ...p, clientId: null } : p)),
        invoices: state.invoices.map((i) => (i.clientId === a.id ? { ...i, clientId: null } : i)),
      }
    case 'tag/add':
      return { ...state, tags: [...state.tags, a.tag] }
    case 'tag/update':
      return { ...state, tags: state.tags.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) }
    case 'tag/delete':
      return {
        ...state,
        tags: state.tags.filter((t) => t.id !== a.id),
        entries: state.entries.map((e) => (e.tagIds.includes(a.id) ? { ...e, tagIds: e.tagIds.filter((x) => x !== a.id) } : e)),
      }
    case 'member/add':
      return { ...state, members: [...state.members, a.member] }
    case 'member/update':
      return { ...state, members: state.members.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)) }
    case 'member/delete':
      return {
        ...state,
        members: state.members.filter((m) => m.id !== a.id),
        timeOffRequests: state.timeOffRequests.filter((r) => r.memberId !== a.id),
        approvals: state.approvals.filter((r) => r.memberId !== a.id),
        schedules: state.schedules.filter((r) => r.memberId !== a.id),
      }
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...a.patch } }
    case 'col/add':
      return { ...state, [a.col]: [a.row, ...(state[a.col] as CollectionItem[])] }
    case 'col/update':
      return { ...state, [a.col]: (state[a.col] as CollectionItem[]).map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) }
    case 'col/delete': {
      const next = { ...state, [a.col]: (state[a.col] as CollectionItem[]).filter((x) => x.id !== a.id) }
      if (a.col === 'timeOffPolicies') next.timeOffRequests = state.timeOffRequests.filter((r) => r.policyId !== a.id)
      if (a.col === 'invoices') {
        next.entries = state.entries.map((e) => (e.invoiceId === a.id ? { ...e, invoiceId: null } : e))
        next.expenses = state.expenses.map((x) => (x.invoiceId === a.id ? { ...x, invoiceId: null } : x))
      }
      return next
    }
    case 'expense/updateMany': {
      const set = new Set(a.ids)
      return { ...state, expenses: state.expenses.map((x) => (set.has(x.id) ? { ...x, ...a.patch } : x)) }
    }
    case 'state/replace':
      return a.state
    default:
      return state
  }
}

export interface StoreApi {
  state: AppState
  dispatch: (a: Action) => void
  now: number
  running: TimeEntry | null
  currentUser: Member
  syncError: string | null
  clearSyncError: () => void
  projectById: (id: string | null) => Project | undefined
  clientById: (id: string | null) => Client | undefined
  tagById: (id: string) => Tag | undefined
  taskById: (projectId: string | null, taskId: string | null) => Task | undefined
  memberById: (id: string | null) => Member | undefined
  /** billable hourly rate for an entry: task → project → member → workspace */
  rateFor: (e: TimeEntry) => number
  /** internal labor cost per hour for an entry's member */
  costRateFor: (e: TimeEntry) => number
  /** true when the entry starts before the workspace lock date */
  isLocked: (e: Pick<TimeEntry, 'start'>) => boolean
  /** validation message for required fields, or null when the draft is complete */
  missingFields: (d: EntryDraft) => string | null
  startTimer: (draft: EntryDraft) => void
  stopTimer: () => void
  continueEntry: (e: TimeEntry) => void
  addEntry: (draft: EntryDraft & { start: Date; end: Date }) => TimeEntry
  updateEntry: (id: string, patch: Partial<TimeEntry>) => void
  deleteEntry: (id: string) => void
  addProject: (p: Omit<Project, 'id' | 'tasks' | 'archived'> & { tasks?: Task[] }) => Project
  addClient: (name: string) => Client
  addTag: (name: string) => Tag
  wipeData: () => void
  importData: (s: AppState) => void
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState(null)
    setLoadError(null)
    loadState(user.id, { name: user.name, email: user.email })
      .then((s) => { if (!cancelled) setState(s) })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [user.id, user.name, user.email, reloadKey])

  // writes are applied optimistically, then pushed to Supabase in order
  const queue = useRef<Promise<void>>(Promise.resolve())
  const dispatch = useCallback((a: Action) => {
    setState((s) => (s ? reducer(s, a) : s))
    queue.current = queue.current
      .then(() => persist(user.id, a))
      .catch((e: Error) => {
        console.error('sync failed', a.type, e)
        setSyncError(`Could not save "${a.type}": ${e.message}`)
      })
  }, [user.id])

  const running = useMemo(() => state?.entries.find((e) => e.end === null) ?? null, [state?.entries])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    document.title = running ? `${formatTitle(now - new Date(running.start).getTime())} · Jamify` : 'Jamify'
  }, [running, now])

  const api = useMemo<StoreApi | null>(() => {
    if (!state) return null
    const projectById = (id: string | null) => (id ? state.projects.find((p) => p.id === id) : undefined)
    const clientById = (id: string | null) => (id ? state.clients.find((c) => c.id === id) : undefined)
    const tagById = (id: string) => state.tags.find((t) => t.id === id)
    const taskById = (projectId: string | null, taskId: string | null) =>
      taskId ? projectById(projectId)?.tasks.find((t) => t.id === taskId) : undefined
    const memberById = (id: string | null) => (id ? state.members.find((m) => m.id === id) : undefined)
    const currentUser = memberById(state.currentUserId) ?? state.members[0] ?? {
      id: '', name: user.name, email: user.email, role: 'Owner' as const, status: 'Active' as const, hourlyRate: null, costRate: null, workingHours: 8,
    }
    const missingFields = (d: EntryDraft) => {
      const s = state.settings
      const missing: string[] = []
      if (s.requireDescription && !d.description.trim()) missing.push('description')
      if (s.requireProject && !d.projectId) missing.push('project')
      if (s.requireTags && d.tagIds.length === 0) missing.push('at least one tag')
      return missing.length ? `Required: ${missing.join(', ')}` : null
    }
    const start = (draft: EntryDraft) =>
      dispatch({ type: 'timer/start', entry: { id: uid(), ...draft, start: new Date().toISOString(), end: null, userId: state.currentUserId, invoiceId: null } })
    return {
      state, dispatch, now, running, currentUser, syncError,
      clearSyncError: () => setSyncError(null),
      projectById, clientById, tagById, taskById, memberById,
      rateFor: (e) => {
        if (!e.billable) return 0
        const t = taskById(e.projectId, e.taskId)
        if (t?.hourlyRate != null) return t.hourlyRate
        const p = projectById(e.projectId)
        if (p?.hourlyRate != null) return p.hourlyRate
        const m = memberById(e.userId)
        if (m?.hourlyRate != null) return m.hourlyRate
        return state.settings.hourlyRate
      },
      costRateFor: (e) => memberById(e.userId)?.costRate ?? 0,
      isLocked: (e) => !!state.settings.lockBefore && e.start.slice(0, 10) < state.settings.lockBefore,
      missingFields,
      startTimer: start,
      stopTimer: () => dispatch({ type: 'timer/stop', at: new Date().toISOString() }),
      continueEntry: (e) => start({ description: e.description, projectId: e.projectId, taskId: e.taskId, tagIds: e.tagIds, billable: e.billable }),
      addEntry: ({ start: s, end, ...draft }) => {
        const entry: TimeEntry = { id: uid(), ...draft, start: s.toISOString(), end: end.toISOString(), userId: state.currentUserId, invoiceId: null }
        dispatch({ type: 'entry/add', entry })
        return entry
      },
      updateEntry: (id, patch) => dispatch({ type: 'entry/update', id, patch }),
      deleteEntry: (id) => dispatch({ type: 'entry/delete', id }),
      addProject: ({ tasks, ...p }) => {
        const project: Project = { ...p, id: uid(), archived: false, tasks: (tasks ?? []).map((t) => ({ ...t, id: uid() })) }
        dispatch({ type: 'project/add', project })
        return project
      },
      addClient: (name) => {
        const client: Client = { id: uid(), name, archived: false }
        dispatch({ type: 'client/add', client })
        return client
      },
      addTag: (name) => {
        const tag: Tag = { id: uid(), name, archived: false }
        dispatch({ type: 'tag/add', tag })
        return tag
      },
      wipeData: () => {
        const fresh = emptyState({ name: user.name, email: user.email }, currentUser.id ? currentUser : undefined)
        fresh.settings = { ...fresh.settings, workspaceName: state.settings.workspaceName }
        dispatch({ type: 'state/replace', state: fresh })
      },
      importData: (s) => dispatch({ type: 'state/replace', state: s }),
    }
  }, [state, now, running, syncError, dispatch, user.name, user.email])

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-base text-[#666]">Could not load your workspace</div>
        <div className="max-w-md text-sm text-ck-red">{loadError}</div>
        <button type="button" className="rounded-sm bg-ck-blue px-4 py-2 text-sm font-medium uppercase text-white" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
      </div>
    )
  }
  if (!api) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-ck-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ck-border border-t-ck-blue" />
          Loading your workspace…
        </div>
      </div>
    )
  }
  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

function formatTitle(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(r)}`
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export { uid }

import { supabase } from './supabase'
import {
  DEFAULT_SETTINGS,
  type AppState, type Client, type CollectionName, type Member, type Project, type Settings, type Tag, type Task, type TimeEntry,
} from '../types'
import type { Action } from '../store'

/* ── row shapes for the core tables ─────────────────────────── */

interface WorkspaceRow {
  user_id: string; name: string; currency: string; hourly_rate: number; week_start: number
  time_format: string; duration_format: string; billable_by_default: boolean
  rounding_minutes: number; rounding_mode: string; lock_before: string | null
  require_project: boolean; require_description: boolean; require_tags: boolean
  daily_target_hours: number | null; weekly_target_hours: number | null; budget_alert_percent: number
}
interface MemberRow { id: string; name: string; email: string; role: string; status: string; hourly_rate: number | null; cost_rate: number | null; working_hours: number }
interface ClientRow { id: string; name: string; archived: boolean }
interface ProjectRow {
  id: string; name: string; client_id: string | null; color: string; billable: boolean; archived: boolean
  hourly_rate: number | null; estimate_hours: number | null; budget: number | null; is_template: boolean; favorite: boolean; note: string
}
interface TaskRow { id: string; project_id: string; name: string; done: boolean; position: number; hourly_rate: number | null }
interface TagRow { id: string; name: string; archived: boolean }
interface EntryRow {
  id: string; description: string; project_id: string | null; task_id: string | null; tag_ids: string[]
  billable: boolean; start_at: string; end_at: string | null; member_id: string | null; invoice_id: string | null
}

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v))

/* ── generic camelCase ↔ snake_case mapping for the newer tables ── */

export const COLLECTION_TABLES: Record<CollectionName, string> = {
  expenses: 'expenses',
  invoices: 'invoices',
  timeOffPolicies: 'time_off_policies',
  timeOffRequests: 'time_off_requests',
  approvals: 'approvals',
  schedules: 'schedules',
}
const NUMERIC_KEYS: Record<CollectionName, string[]> = {
  expenses: ['amount'],
  invoices: ['taxPercent', 'discountPercent'],
  timeOffPolicies: ['daysPerYear'],
  timeOffRequests: [],
  approvals: [],
  schedules: ['hoursPerDay'],
}
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

export function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[snake(k)] = v
  return out
}
function fromRow(col: CollectionName, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id' || k === 'created_at') continue
    const ck = camel(k)
    out[ck] = NUMERIC_KEYS[col].includes(ck) ? num(v as number | null) : v
  }
  return out
}

/* ── app → row ──────────────────────────────────────────────── */

const entryToRow = (e: TimeEntry): EntryRow => ({
  id: e.id, description: e.description, project_id: e.projectId, task_id: e.taskId, tag_ids: e.tagIds,
  billable: e.billable, start_at: e.start, end_at: e.end, member_id: e.userId, invoice_id: e.invoiceId,
})
function entryPatch(p: Partial<TimeEntry>): Partial<EntryRow> {
  const r: Partial<EntryRow> = {}
  if ('description' in p) r.description = p.description
  if ('projectId' in p) r.project_id = p.projectId ?? null
  if ('taskId' in p) r.task_id = p.taskId ?? null
  if ('tagIds' in p) r.tag_ids = p.tagIds
  if ('billable' in p) r.billable = p.billable
  if ('start' in p) r.start_at = p.start
  if ('end' in p) r.end_at = p.end ?? null
  if ('userId' in p) r.member_id = p.userId ?? null
  if ('invoiceId' in p) r.invoice_id = p.invoiceId ?? null
  return r
}
const projectToRow = (p: Project): ProjectRow => ({
  id: p.id, name: p.name, client_id: p.clientId, color: p.color, billable: p.billable, archived: p.archived,
  hourly_rate: p.hourlyRate, estimate_hours: p.estimateHours, budget: p.budget, is_template: p.isTemplate, favorite: p.favorite, note: p.note,
})
function projectPatch(p: Partial<Project>): Partial<ProjectRow> {
  const r: Partial<ProjectRow> = {}
  if ('name' in p) r.name = p.name
  if ('clientId' in p) r.client_id = p.clientId ?? null
  if ('color' in p) r.color = p.color
  if ('billable' in p) r.billable = p.billable
  if ('archived' in p) r.archived = p.archived
  if ('hourlyRate' in p) r.hourly_rate = p.hourlyRate ?? null
  if ('estimateHours' in p) r.estimate_hours = p.estimateHours ?? null
  if ('budget' in p) r.budget = p.budget ?? null
  if ('isTemplate' in p) r.is_template = p.isTemplate
  if ('favorite' in p) r.favorite = p.favorite
  if ('note' in p) r.note = p.note
  return r
}
const taskToRow = (t: Task, projectId: string, position: number): TaskRow => ({ id: t.id, project_id: projectId, name: t.name, done: t.done, position, hourly_rate: t.hourlyRate })
function taskPatch(p: Partial<Task>): Partial<TaskRow> {
  const r: Partial<TaskRow> = {}
  if ('name' in p) r.name = p.name
  if ('done' in p) r.done = p.done
  if ('hourlyRate' in p) r.hourly_rate = p.hourlyRate ?? null
  return r
}
const memberToRow = (m: Member): MemberRow => ({ id: m.id, name: m.name, email: m.email, role: m.role, status: m.status, hourly_rate: m.hourlyRate, cost_rate: m.costRate, working_hours: m.workingHours })
function memberPatch(p: Partial<Member>): Partial<MemberRow> {
  const r: Partial<MemberRow> = {}
  if ('name' in p) r.name = p.name
  if ('email' in p) r.email = p.email
  if ('role' in p) r.role = p.role
  if ('status' in p) r.status = p.status
  if ('hourlyRate' in p) r.hourly_rate = p.hourlyRate ?? null
  if ('costRate' in p) r.cost_rate = p.costRate ?? null
  if ('workingHours' in p) r.working_hours = p.workingHours
  return r
}
const settingsToRow = (s: Settings): Omit<WorkspaceRow, 'user_id'> => ({
  name: s.workspaceName, currency: s.currency, hourly_rate: s.hourlyRate, week_start: s.weekStart,
  time_format: s.timeFormat, duration_format: s.durationFormat, billable_by_default: s.billableByDefault,
  rounding_minutes: s.roundingMinutes, rounding_mode: s.roundingMode, lock_before: s.lockBefore,
  require_project: s.requireProject, require_description: s.requireDescription, require_tags: s.requireTags,
  daily_target_hours: s.dailyTargetHours, weekly_target_hours: s.weeklyTargetHours, budget_alert_percent: s.budgetAlertPercent,
})
function settingsPatch(p: Partial<Settings>): Partial<WorkspaceRow> {
  const r: Partial<WorkspaceRow> = {}
  if ('workspaceName' in p) r.name = p.workspaceName
  if ('currency' in p) r.currency = p.currency
  if ('hourlyRate' in p) r.hourly_rate = p.hourlyRate
  if ('weekStart' in p) r.week_start = p.weekStart
  if ('timeFormat' in p) r.time_format = p.timeFormat
  if ('durationFormat' in p) r.duration_format = p.durationFormat
  if ('billableByDefault' in p) r.billable_by_default = p.billableByDefault
  if ('roundingMinutes' in p) r.rounding_minutes = p.roundingMinutes
  if ('roundingMode' in p) r.rounding_mode = p.roundingMode
  if ('lockBefore' in p) r.lock_before = p.lockBefore ?? null
  if ('requireProject' in p) r.require_project = p.requireProject
  if ('requireDescription' in p) r.require_description = p.requireDescription
  if ('requireTags' in p) r.require_tags = p.requireTags
  if ('dailyTargetHours' in p) r.daily_target_hours = p.dailyTargetHours ?? null
  if ('weeklyTargetHours' in p) r.weekly_target_hours = p.weeklyTargetHours ?? null
  if ('budgetAlertPercent' in p) r.budget_alert_percent = p.budgetAlertPercent
  return r
}

/* ── row → app ──────────────────────────────────────────────── */

const rowToEntry = (r: EntryRow, fallbackMember: string): TimeEntry => ({
  id: r.id, description: r.description, projectId: r.project_id, taskId: r.task_id, tagIds: r.tag_ids ?? [],
  billable: r.billable, start: r.start_at, end: r.end_at, userId: r.member_id ?? fallbackMember, invoiceId: r.invoice_id,
})

function rowToSettings(w: WorkspaceRow): Settings {
  return {
    workspaceName: w.name, currency: w.currency, hourlyRate: Number(w.hourly_rate),
    weekStart: w.week_start === 0 ? 0 : 1, timeFormat: w.time_format as Settings['timeFormat'],
    durationFormat: w.duration_format as Settings['durationFormat'], billableByDefault: w.billable_by_default,
    roundingMinutes: Number(w.rounding_minutes ?? 0), roundingMode: (w.rounding_mode as Settings['roundingMode']) ?? 'nearest',
    lockBefore: w.lock_before, requireProject: !!w.require_project, requireDescription: !!w.require_description, requireTags: !!w.require_tags,
    dailyTargetHours: num(w.daily_target_hours), weeklyTargetHours: num(w.weekly_target_hours),
    budgetAlertPercent: Number(w.budget_alert_percent ?? 80),
  }
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/* ── empty workspace for a brand-new user ───────────────────── */

export function emptyState(user: { name: string; email: string }, existingOwner?: Member): AppState {
  const owner: Member = existingOwner ?? {
    id: crypto.randomUUID(), name: user.name, email: user.email, role: 'Owner', status: 'Active', hourlyRate: null, costRate: null, workingHours: 8,
  }
  return {
    version: 2,
    clients: [], projects: [], tags: [], entries: [], members: [owner],
    settings: { workspaceName: `${user.name}'s workspace`, ...DEFAULT_SETTINGS },
    currentUserId: owner.id,
    expenses: [], invoices: [], timeOffPolicies: [], timeOffRequests: [], approvals: [], schedules: [],
  }
}

/* ── load ───────────────────────────────────────────────────── */

export async function loadState(userId: string, user: { name: string; email: string }): Promise<AppState> {
  const [ws, members, clients, projects, tasks, tags, entries, expenses, invoices, policies, requests, approvals, schedules] = await Promise.all([
    supabase.from('workspaces').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('members').select('*').order('created_at'),
    supabase.from('clients').select('*').order('created_at'),
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('tasks').select('*').order('position').order('created_at'),
    supabase.from('tags').select('*').order('created_at'),
    supabase.from('time_entries').select('*').order('start_at', { ascending: false }),
    supabase.from('expenses').select('*').order('date', { ascending: false }),
    supabase.from('invoices').select('*').order('issue_date', { ascending: false }),
    supabase.from('time_off_policies').select('*').order('created_at'),
    supabase.from('time_off_requests').select('*').order('start_date', { ascending: false }),
    supabase.from('approvals').select('*').order('week_start', { ascending: false }),
    supabase.from('schedules').select('*').order('start_date'),
  ])
  const wsRow = check<WorkspaceRow | null>(ws)
  if (!wsRow) {
    const fresh = emptyState(user)
    await replaceAll(userId, fresh)
    return fresh
  }
  const memberRows = check<MemberRow[]>(members)
  const taskRows = check<TaskRow[]>(tasks)
  const memberList: Member[] = memberRows.map((m) => ({
    id: m.id, name: m.name, email: m.email, role: m.role as Member['role'], status: m.status as Member['status'],
    hourlyRate: num(m.hourly_rate), costRate: num(m.cost_rate), workingHours: Number(m.working_hours ?? 8),
  }))
  let owner = memberList.find((m) => m.role === 'Owner') ?? memberList[0]
  if (!owner) {
    // workspace exists but has no members (e.g. after a wipe) – recreate the owner
    owner = { id: crypto.randomUUID(), name: user.name, email: user.email, role: 'Owner', status: 'Active', hourlyRate: null, costRate: null, workingHours: 8 }
    check(await supabase.from('members').insert(memberToRow(owner)))
    memberList.push(owner)
  }
  const col = <T>(name: CollectionName, res: { data: unknown; error: { message: string } | null }) =>
    check<Record<string, unknown>[]>(res as { data: Record<string, unknown>[] | null; error: { message: string } | null }).map((r) => fromRow(name, r) as T)
  return {
    version: 2,
    settings: rowToSettings(wsRow),
    members: memberList,
    currentUserId: owner.id,
    clients: check<ClientRow[]>(clients).map((c): Client => ({ id: c.id, name: c.name, archived: c.archived })),
    tags: check<TagRow[]>(tags).map((t): Tag => ({ id: t.id, name: t.name, archived: t.archived })),
    projects: check<ProjectRow[]>(projects).map((p): Project => ({
      id: p.id, name: p.name, clientId: p.client_id, color: p.color, billable: p.billable, archived: p.archived,
      hourlyRate: num(p.hourly_rate), estimateHours: num(p.estimate_hours), budget: num(p.budget),
      isTemplate: !!p.is_template, favorite: !!p.favorite, note: p.note ?? '',
      tasks: taskRows.filter((t) => t.project_id === p.id).map((t): Task => ({ id: t.id, name: t.name, done: t.done, hourlyRate: num(t.hourly_rate) })),
    })),
    entries: check<EntryRow[]>(entries).map((e) => rowToEntry(e, owner!.id)),
    expenses: col('expenses', expenses),
    invoices: col('invoices', invoices),
    timeOffPolicies: col('timeOffPolicies', policies),
    timeOffRequests: col('timeOffRequests', requests),
    approvals: col('approvals', approvals),
    schedules: col('schedules', schedules),
  }
}

/* ── replace everything (wipe / import) ─────────────────────── */

export async function replaceAll(userId: string, s: AppState): Promise<void> {
  // children first so foreign keys never block
  for (const table of ['time_entries', 'expenses', 'invoices', 'schedules', 'approvals', 'time_off_requests', 'time_off_policies', 'tasks', 'projects', 'clients', 'tags', 'members']) {
    check(await supabase.from(table).delete().eq('user_id', userId))
  }
  check(await supabase.from('workspaces').upsert({ user_id: userId, ...settingsToRow(s.settings) }))
  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    for (let i = 0; i < rows.length; i += 500) check(await supabase.from(table).insert(rows.slice(i, i + 500)))
  }
  await insert('members', s.members.map((m) => ({ ...memberToRow(m) })))
  await insert('clients', s.clients.map((c) => ({ id: c.id, name: c.name, archived: c.archived })))
  await insert('tags', s.tags.map((t) => ({ id: t.id, name: t.name, archived: t.archived })))
  await insert('projects', s.projects.map((p) => ({ ...projectToRow(p) })))
  await insert('tasks', s.projects.flatMap((p) => p.tasks.map((t, i) => ({ ...taskToRow(t, p.id, i) }))))
  await insert('invoices', (s.invoices ?? []).map((x) => toRow(x as unknown as Record<string, unknown>)))
  await insert('time_entries', s.entries.map((e) => ({ ...entryToRow(e) })))
  await insert('expenses', (s.expenses ?? []).map((x) => toRow(x as unknown as Record<string, unknown>)))
  await insert('time_off_policies', (s.timeOffPolicies ?? []).map((x) => toRow(x as unknown as Record<string, unknown>)))
  await insert('time_off_requests', (s.timeOffRequests ?? []).map((x) => toRow(x as unknown as Record<string, unknown>)))
  await insert('approvals', (s.approvals ?? []).map((x) => toRow(x as unknown as Record<string, unknown>)))
  await insert('schedules', (s.schedules ?? []).map((x) => toRow(x as unknown as Record<string, unknown>)))
}

/* ── write-through for each store action ───────────────────── */

export async function persist(userId: string, a: Action): Promise<void> {
  switch (a.type) {
    case 'entry/add':
      return void check(await supabase.from('time_entries').insert(entryToRow(a.entry)))
    case 'entry/addMany':
      if (!a.entries.length) return
      for (let i = 0; i < a.entries.length; i += 500) check(await supabase.from('time_entries').insert(a.entries.slice(i, i + 500).map(entryToRow)))
      return
    case 'entry/update':
      return void check(await supabase.from('time_entries').update(entryPatch(a.patch)).eq('id', a.id))
    case 'entry/updateMany':
      if (!a.ids.length) return
      return void check(await supabase.from('time_entries').update(entryPatch(a.patch)).in('id', a.ids))
    case 'entry/delete':
      return void check(await supabase.from('time_entries').delete().eq('id', a.id))
    case 'entry/deleteMany':
      if (!a.ids.length) return
      return void check(await supabase.from('time_entries').delete().in('id', a.ids))
    case 'timer/start':
      check(await supabase.from('time_entries').update({ end_at: a.entry.start }).is('end_at', null).eq('user_id', userId))
      return void check(await supabase.from('time_entries').insert(entryToRow(a.entry)))
    case 'timer/stop':
      return void check(await supabase.from('time_entries').update({ end_at: a.at }).is('end_at', null).eq('user_id', userId))
    case 'project/add': {
      check(await supabase.from('projects').insert(projectToRow(a.project)))
      if (a.project.tasks.length) check(await supabase.from('tasks').insert(a.project.tasks.map((t, i) => taskToRow(t, a.project.id, i))))
      return
    }
    case 'project/update':
      return void check(await supabase.from('projects').update(projectPatch(a.patch)).eq('id', a.id))
    case 'project/delete':
      return void check(await supabase.from('projects').delete().eq('id', a.id))
    case 'task/add': {
      const { count } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', a.projectId)
      return void check(await supabase.from('tasks').insert(taskToRow(a.task, a.projectId, count ?? 0)))
    }
    case 'task/update':
      return void check(await supabase.from('tasks').update(taskPatch(a.patch)).eq('id', a.taskId))
    case 'task/delete':
      return void check(await supabase.from('tasks').delete().eq('id', a.taskId))
    case 'client/add':
      return void check(await supabase.from('clients').insert({ id: a.client.id, name: a.client.name, archived: a.client.archived }))
    case 'client/update':
      return void check(await supabase.from('clients').update(a.patch).eq('id', a.id))
    case 'client/delete':
      return void check(await supabase.from('clients').delete().eq('id', a.id))
    case 'tag/add':
      return void check(await supabase.from('tags').insert({ id: a.tag.id, name: a.tag.name, archived: a.tag.archived }))
    case 'tag/update':
      return void check(await supabase.from('tags').update(a.patch).eq('id', a.id))
    case 'tag/delete':
      return void check(await supabase.from('tags').delete().eq('id', a.id))
    case 'member/add':
      return void check(await supabase.from('members').insert(memberToRow(a.member)))
    case 'member/update':
      return void check(await supabase.from('members').update(memberPatch(a.patch)).eq('id', a.id))
    case 'member/delete':
      return void check(await supabase.from('members').delete().eq('id', a.id))
    case 'settings/update':
      return void check(await supabase.from('workspaces').update(settingsPatch(a.patch)).eq('user_id', userId))
    case 'col/add':
      return void check(await supabase.from(COLLECTION_TABLES[a.col]).insert(toRow(a.row as unknown as Record<string, unknown>)))
    case 'col/update':
      return void check(await supabase.from(COLLECTION_TABLES[a.col]).update(toRow(a.patch as Record<string, unknown>)).eq('id', a.id))
    case 'col/delete':
      return void check(await supabase.from(COLLECTION_TABLES[a.col]).delete().eq('id', a.id))
    case 'expense/updateMany':
      if (!a.ids.length) return
      return void check(await supabase.from('expenses').update(toRow(a.patch as Record<string, unknown>)).in('id', a.ids))
    case 'state/replace':
      return replaceAll(userId, a.state)
  }
}

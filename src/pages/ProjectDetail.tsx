import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, FolderX, Globe, ListChecks, Lock, Plus, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '../store'
import { Avatar, Badge, Button, EmptyState, Field, ProjectDot, Tabs, Toggle, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { InviteMemberModal } from '../components/InviteMemberModal'
import { ColorPicker, FavoriteButton, Progress } from './Projects'
import { entrySeconds, formatDuration, formatMoney } from '../lib/time'
import type { Member, Project, Task } from '../types'

type Tab = 'tasks' | 'status' | 'access' | 'settings'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch, clientById, rateFor, costRateFor, can } = useStore()
  const { confirm, notify } = useFeedback()
  const project = state.projects.find((p) => p.id === id)
  const [tab, setTab] = useState<Tab>('tasks')
  const [taskName, setTaskName] = useState('')
  // what the name field shows while it is being edited; an empty name is never saved
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  const entries = useMemo(() => state.entries.filter((e) => e.projectId === id), [state.entries, id])
  const expenses = useMemo(() => state.expenses.filter((e) => e.projectId === id), [state.expenses, id])

  if (!project) {
    return (
      <div className="ck-card">
        <EmptyState
          icon={<FolderX size={40} />}
          title="Project not found"
          hint="It may have been deleted, or you don't have access to it."
          action={<Link to="/projects" className="text-sm font-medium text-ck-blue hover:underline">Back to projects</Link>}
        />
      </div>
    )
  }

  const total = entries.reduce((a, e) => a + entrySeconds(e), 0)
  const billableSecs = entries.filter((e) => e.billable).reduce((a, e) => a + entrySeconds(e), 0)
  const timeAmount = entries.reduce((a, e) => a + (entrySeconds(e) / 3600) * rateFor(e), 0)
  const expenseAmount = expenses.filter((x) => x.billable).reduce((a, x) => a + x.amount, 0)
  const laborCost = entries.reduce((a, e) => a + (entrySeconds(e) / 3600) * costRateFor(e), 0) + expenses.reduce((a, x) => a + x.amount, 0)
  const amount = timeAmount + expenseAmount
  // projects are written by managers only; the settings fieldset can't disable the toggles
  const update = (patch: Partial<Project>) => { if (can.manage) dispatch({ type: 'project/update', id: project.id, patch }) }
  const cur = state.settings.currency

  const newTask = taskName.trim()
  const taskTaken = !!newTask && project.tasks.some((t) => t.name.toLowerCase() === newTask.toLowerCase())
  const addTask = () => {
    if (!newTask || taskTaken) return
    dispatch({ type: 'task/add', projectId: project.id, task: { id: crypto.randomUUID(), name: newTask, done: false, hourlyRate: null } })
    setTaskName('')
    notify(`Task "${newTask}" added`)
  }

  const deleteTask = async (task: Task) => {
    const n = entries.filter((e) => e.taskId === task.id).length
    const ok = await confirm({
      title: `Delete task "${task.name}"?`,
      message: n ? `Its ${plural(n, 'time entry', 'time entries')} ${n === 1 ? 'stays' : 'stay'} on the project without a task.` : 'No time has been tracked on it.',
      confirmLabel: 'Delete task',
      danger: true,
    })
    if (!ok) return
    dispatch({ type: 'task/delete', projectId: project.id, taskId: task.id })
    notify(`Task "${task.name}" deleted`)
  }

  const toggleArchive = () => {
    const archived = !project.archived
    update({ archived })
    notify(`Project "${project.name}" ${archived ? 'archived' : 'restored'}`, { action: { label: 'Undo', onClick: () => update({ archived: !archived }) } })
  }

  const deleteProject = async () => {
    const kept = [entries.length && plural(entries.length, 'time entry', 'time entries'), expenses.length && plural(expenses.length, 'expense')].filter(Boolean).join(' and ')
    const ok = await confirm({
      title: `Delete project "${project.name}"?`,
      message: `${kept ? `Its ${kept} ${entries.length + expenses.length === 1 ? 'is' : 'are'} kept without a project.` : 'No time or expenses are recorded on it.'} Its tasks are deleted. This can't be undone.`,
      confirmLabel: 'Delete project',
      danger: true,
    })
    if (!ok) return
    dispatch({ type: 'project/delete', id: project.id })
    navigate('/projects')
    notify(`Project "${project.name}" deleted`)
  }

  const byTask = project.tasks.map((t) => ({ task: t, secs: entries.filter((e) => e.taskId === t.id).reduce((a, e) => a + entrySeconds(e), 0) }))
  const noTaskSecs = entries.filter((e) => !e.taskId).reduce((a, e) => a + entrySeconds(e), 0)
  const byMember = state.members.map((m) => ({ m, secs: entries.filter((e) => e.userId === m.id).reduce((a, e) => a + entrySeconds(e), 0) })).filter((x) => x.secs > 0)

  return (
    <div className="space-y-4">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-ck-muted hover:text-ck-text"><ArrowLeft size={14} aria-hidden="true" /> Projects</Link>
      <div className="flex flex-wrap items-center gap-3">
        <ProjectDot color={project.color} size={14} />
        <h1 className="min-w-0 break-words text-2xl font-light" style={{ color: project.color }}>{project.name}</h1>
        {project.clientId && <span className="text-[#666]">— {clientById(project.clientId)?.name}</span>}
        <FavoriteButton name={project.name} favorite={project.favorite} canToggle={can.manage} size={18} onToggle={() => update({ favorite: !project.favorite })} />
        {project.archived && <span className="rounded-sm bg-black/5 px-2 py-0.5 text-xs font-medium uppercase text-ck-muted">Archived</span>}
        {project.isTemplate && <span className="rounded-sm bg-ck-blue-light px-2 py-0.5 text-xs font-medium uppercase text-ck-blue-dark">Template</span>}
        {!project.isPublic && <span className="inline-flex items-center gap-1 rounded-sm bg-black/5 px-2 py-0.5 text-xs font-medium uppercase text-ck-muted"><Lock size={11} aria-hidden="true" /> Private</span>}
        <span className="ml-auto font-mono text-lg tabular-nums text-[#555]" title="Total tracked"><span className="sr-only">Total tracked: </span>{formatDuration(total, state.settings.durationFormat)}</span>
      </div>

      {/* the tab bar scrolls sideways on narrow screens instead of widening the page */}
      <div className="overflow-x-auto [&>div]:w-max [&>div]:min-w-full">
        <Tabs tabs={[{ id: 'tasks', label: 'Tasks' }, { id: 'status', label: 'Status' }, { id: 'access', label: 'Access' }, { id: 'settings', label: 'Settings' }]} value={tab} onChange={setTab} />
      </div>

      {tab === 'tasks' && (
        <div className="ck-card">
          {can.manage && (
            <div className="border-b border-ck-border-light p-3">
              <div className="flex gap-2">
                <input
                  className="ck-input min-w-0 flex-1"
                  aria-label="New task name"
                  aria-invalid={taskTaken || undefined}
                  aria-describedby={taskTaken ? 'task-name-error' : undefined}
                  placeholder="Add new task"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTask()}
                />
                <Button onClick={addTask} disabled={!newTask || taskTaken}><Plus size={16} aria-hidden="true" /> Add</Button>
              </div>
              {taskTaken && <p id="task-name-error" role="alert" className="mt-1 text-xs text-ck-red">This project already has a task with that name.</p>}
            </div>
          )}
          {project.tasks.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={40} />}
              title="No tasks yet"
              hint={can.manage ? 'Split the project into tasks to see where time goes. Each task can have its own rate.' : 'A manager can split this project into tasks.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="ck-table w-full min-w-[560px]">
                <thead><tr><th>Task</th><th className="w-40">Hourly rate ({cur})</th><th className="text-right">Tracked</th><th className="w-24 text-right">Status</th>{can.manage && <th className="w-14"><span className="sr-only">Actions</span></th>}</tr></thead>
                <tbody>
                  {byTask.map(({ task, secs }) => (
                    <tr key={task.id} className="hover:bg-ck-bg/40">
                      <td>
                        {can.manage ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={task.done}
                            title={task.done ? 'Mark as active' : 'Mark as done'}
                            className="inline-flex items-center gap-2 text-left"
                            onClick={() => dispatch({ type: 'task/update', projectId: project.id, taskId: task.id, patch: { done: !task.done } })}
                          >
                            <span aria-hidden="true" className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border', task.done ? 'border-ck-green bg-ck-green text-white' : 'border-ck-border')}>{task.done && <Check size={12} strokeWidth={3} />}</span>
                            <span className={cn(task.done && 'text-ck-muted line-through')}>{task.name}</span>
                          </button>
                        ) : <span className={cn(task.done && 'text-ck-muted line-through')}>{task.name}</span>}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="ck-input tabular-nums"
                          aria-label={`Hourly rate for ${task.name} (${cur})`}
                          disabled={!can.manage}
                          placeholder={project.hourlyRate != null ? `Project: ${project.hourlyRate}` : 'Inherit'}
                          value={task.hourlyRate ?? ''}
                          onChange={(e) => dispatch({ type: 'task/update', projectId: project.id, taskId: task.id, patch: { hourlyRate: e.target.value === '' ? null : Number(e.target.value) } })}
                        />
                      </td>
                      <td className="text-right font-mono tabular-nums">{formatDuration(secs, state.settings.durationFormat)}</td>
                      <td className="text-right text-xs uppercase text-ck-muted">{task.done ? 'Done' : 'Active'}</td>
                      {can.manage && (
                        <td className="text-center">
                          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ck-muted transition-colors hover:bg-red-50 hover:text-ck-red" aria-label={`Delete task ${task.name}`} title="Delete task" onClick={() => deleteTask(task)}>
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'status' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="ck-card p-4">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ck-muted">Overview</h2>
            <dl className="space-y-2 text-sm">
              <Row k="Total tracked" v={formatDuration(total, state.settings.durationFormat)} />
              <Row k="Billable time" v={formatDuration(billableSecs, state.settings.durationFormat)} />
              <Row k="Billable amount (time)" v={formatMoney(timeAmount, cur)} />
              <Row k="Billable expenses" v={formatMoney(expenseAmount, cur)} />
              <Row k="Total billable" v={formatMoney(amount, cur)} />
              <Row k="Cost (labor + expenses)" v={formatMoney(laborCost, cur)} />
              <Row k="Profit" v={formatMoney(amount - laborCost, cur)} />
              <Row k="Entries" v={String(entries.length)} />
            </dl>
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 text-xs text-ck-muted">Estimate</div>
                <Progress pct={project.estimateHours ? (total / 3600 / project.estimateHours) * 100 : null} label={project.estimateHours ? `${(total / 3600).toFixed(1)}h of ${project.estimateHours}h` : 'No estimate set'} alertAt={state.settings.budgetAlertPercent} />
              </div>
              <div>
                <div className="mb-1 text-xs text-ck-muted">Budget</div>
                <Progress pct={project.budget ? (amount / project.budget) * 100 : null} label={project.budget ? `${formatMoney(amount, cur)} of ${formatMoney(project.budget, cur)}` : 'No budget set'} alertAt={state.settings.budgetAlertPercent} />
              </div>
            </div>
          </div>
          <div className="ck-card p-4">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ck-muted">By task</h2>
            <ul className="space-y-2 text-sm">
              {byTask.map(({ task, secs }) => <BarRow key={task.id} label={task.name} secs={secs} total={total} color={project.color} fmt={state.settings.durationFormat} />)}
              {noTaskSecs > 0 && <BarRow label="Without task" secs={noTaskSecs} total={total} color="#c6d2d9" fmt={state.settings.durationFormat} />}
              {total === 0 && <li className="text-ck-muted">No time tracked yet.</li>}
            </ul>
            <h2 className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-ck-muted">By member</h2>
            <ul className="space-y-2 text-sm">
              {byMember.map(({ m, secs }) => <BarRow key={m.id} label={m.name} secs={secs} total={total} color={project.color} fmt={state.settings.durationFormat} />)}
              {!byMember.length && <li className="text-ck-muted">No time tracked yet.</li>}
            </ul>
            {expenses.length > 0 && (
              <>
                <h2 className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-ck-muted">Expenses</h2>
                <ul className="space-y-1 text-sm">
                  {expenses.slice(0, 8).map((x) => (
                    <li key={x.id} className="flex justify-between gap-3"><span className="min-w-0">{x.date} · {x.category}{x.note && <span className="text-ck-muted"> · {x.note}</span>}</span><span className="shrink-0 font-mono tabular-nums">{formatMoney(x.amount, cur)}</span></li>
                  ))}
                </ul>
                <Link to="/expenses" className="mt-2 inline-block text-xs text-ck-blue hover:underline">All expenses</Link>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'access' && <ProjectAccess project={project} />}

      {tab === 'settings' && (
        <>
          {!can.manage && (
            <div className="rounded-sm bg-ck-blue-light px-4 py-3 text-sm text-ck-blue-dark">Only owners, admins and managers can change project settings.</div>
          )}
          <fieldset disabled={!can.manage} className="grid min-w-0 items-start gap-4 md:grid-cols-2">
            <div className="ck-card space-y-4 p-4">
              <Field label="Name" error={nameDraft !== null && !nameDraft.trim() ? 'Enter a project name. The saved name is kept until you do.' : null}>
                {(fp) => (
                  <input
                    {...fp}
                    className="ck-input"
                    value={nameDraft ?? project.name}
                    onChange={(e) => { const v = e.target.value; setNameDraft(v); if (v.trim()) update({ name: v }) }}
                    onBlur={() => setNameDraft(null)}
                  />
                )}
              </Field>
              <Field label="Client">
                {(fp) => (
                  <select {...fp} className="ck-select w-full" value={project.clientId ?? ''} onChange={(e) => update({ clientId: e.target.value || null })}>
                    <option value="">No client</option>
                    {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </Field>
              <div>
                <span className="ck-label">Color</span>
                <ColorPicker value={project.color} onChange={(color) => update({ color })} label="Project color" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={`Hourly rate (${cur})`}>
                  {(fp) => <input {...fp} type="number" min={0} className="ck-input" placeholder={`Workspace: ${state.settings.hourlyRate}`} value={project.hourlyRate ?? ''} onChange={(e) => update({ hourlyRate: e.target.value === '' ? null : Number(e.target.value) })} />}
                </Field>
                <Field label="Estimate (hours)">
                  {(fp) => <input {...fp} type="number" min={0} className="ck-input" placeholder="None" value={project.estimateHours ?? ''} onChange={(e) => update({ estimateHours: e.target.value === '' ? null : Number(e.target.value) })} />}
                </Field>
                <Field label={`Budget (${cur})`}>
                  {(fp) => <input {...fp} type="number" min={0} className="ck-input" placeholder="None" value={project.budget ?? ''} onChange={(e) => update({ budget: e.target.value === '' ? null : Number(e.target.value) })} />}
                </Field>
              </div>
              <Field label="Note">
                {(fp) => <textarea {...fp} className="ck-input h-20 py-2" placeholder="Internal notes about this project" value={project.note} onChange={(e) => update({ note: e.target.value })} />}
              </Field>
              <Toggle checked={project.billable} onChange={(billable) => update({ billable })} label="Billable by default" />
              <Toggle checked={project.favorite} onChange={(favorite) => update({ favorite })} label="Favorite (pinned at the top of pickers)" />
              <Toggle checked={project.isTemplate} onChange={(isTemplate) => update({ isTemplate })} label="Use as template (hidden from pickers, selectable when creating projects)" />
            </div>
            <section className="ck-card space-y-4 border-red-200! p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ck-red">Danger zone</h2>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{project.archived ? 'Restore project' : 'Archive project'}</div>
                  <p className="text-sm text-[#666]">{project.archived ? 'Shows it in pickers again.' : 'Hides it from pickers. Its time entries are kept.'}</p>
                </div>
                <Button variant="outline" onClick={toggleArchive}>{project.archived ? 'Restore' : 'Archive'}</Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ck-border-light pt-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Delete project</div>
                  <p className="text-sm text-[#666]">Removes the project and its tasks. Its time entries and expenses are kept without a project.</p>
                </div>
                <Button variant="danger" onClick={deleteProject}><Trash2 size={15} aria-hidden="true" /> Delete</Button>
              </div>
            </section>
          </fieldset>
        </>
      )}
    </div>
  )
}

const SEES_ALL: Member['role'][] = ['Owner', 'Admin', 'Manager']

function ProjectAccess({ project }: { project: Project }) {
  const { state, dispatch, memberById, can } = useStore()
  const { notify } = useFeedback()
  const [pick, setPick] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const withAccess = project.memberIds.map((id) => memberById(id)).filter((m): m is Member => !!m)
  const addable = state.members.filter((m) => !project.memberIds.includes(m.id))

  const add = () => {
    if (!pick) return
    dispatch({ type: 'project/addMember', projectId: project.id, memberId: pick })
    setPick('')
  }

  const remove = (m: Member) => {
    dispatch({ type: 'project/removeMember', projectId: project.id, memberId: m.id })
    notify(`${m.name} removed from the project`, { action: { label: 'Undo', onClick: () => dispatch({ type: 'project/addMember', projectId: project.id, memberId: m.id }) } })
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <div className="ck-card space-y-3 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ck-muted">Visibility</h2>
        {[true, false].map((pub) => (
          <label
            key={String(pub)}
            className={cn(
              'flex gap-3 rounded-sm border p-3',
              project.isPublic === pub ? 'border-ck-blue bg-ck-blue-light/40' : 'border-ck-border-light',
              can.manage ? 'cursor-pointer' : 'cursor-not-allowed opacity-70',
            )}
          >
            <input type="radio" name="visibility" className="mt-1" checked={project.isPublic === pub} disabled={!can.manage} onChange={() => dispatch({ type: 'project/update', id: project.id, patch: { isPublic: pub } })} />
            <span>
              <span className="flex items-center gap-1.5 font-medium">{pub ? <Globe size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />} {pub ? 'Public' : 'Private'}</span>
              <span className="block text-sm text-[#666]">
                {pub ? 'Everyone in the workspace can see this project and track time on it.' : 'Only the project members, plus owners, admins and managers.'}
              </span>
            </span>
          </label>
        ))}
        {!can.manage && <p className="text-xs text-[#666]">Only owners, admins and managers can change who has access.</p>}
      </div>

      <div className="ck-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ck-muted">Project members</h2>
          {can.admin && <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}><UserPlus size={14} aria-hidden="true" /> Invite by email</Button>}
        </div>
        {project.isPublic ? (
          <div className="flex items-start gap-3 rounded-sm bg-ck-bg p-3 text-sm text-[#555]">
            <Globe size={16} className="mt-0.5 shrink-0 text-ck-muted" aria-hidden="true" />
            <div>
              Everyone in the workspace ({state.members.length} {state.members.length === 1 ? 'person' : 'people'}) can see this project and track time on it.
              {can.manage && (
                <> <button type="button" className="text-ck-blue-dark hover:underline" onClick={() => dispatch({ type: 'project/update', id: project.id, patch: { isPublic: false } })}>Make it private</button> to choose who has access.</>
              )}
            </div>
          </div>
        ) : (
          <>
            {can.manage && (
              <div className="mb-3 flex gap-2">
                <label htmlFor="project-add-member" className="sr-only">Add a workspace member</label>
                <select id="project-add-member" className="ck-select min-w-0 flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{addable.length ? 'Add a workspace member…' : 'Everyone already has access'}</option>
                  {addable.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
                </select>
                <Button onClick={add} disabled={!pick}><Plus size={16} aria-hidden="true" /> Add</Button>
              </div>
            )}
            {withAccess.length === 0 ? (
              <div className="py-6 text-center text-sm text-[#666]">Only owners, admins and managers can see this project. Add the people who work on it.</div>
            ) : (
              <ul className="divide-y divide-ck-border-light">
                {withAccess.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2">
                    <Avatar name={m.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{m.name}</div>
                      <div className="truncate text-xs text-ck-muted">{m.email}{SEES_ALL.includes(m.role) && ` · ${m.role}, sees every project`}</div>
                    </div>
                    {m.status === 'Pending' && <Badge tone="orange">Invited</Badge>}
                    {can.manage && (
                      <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ck-muted hover:bg-red-50 hover:text-ck-red" aria-label={`Remove ${m.name} from project`} title="Remove from project" onClick={() => remove(m)}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} projectId={project.id} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-[#666]">{k}</dt><dd className="text-right font-mono tabular-nums">{v}</dd></div>
}

function BarRow({ label, secs, total, color, fmt }: { label: string; secs: number; total: number; color: string; fmt: 'full' | 'compact' | 'decimal' }) {
  return (
    <li>
      <div className="flex justify-between gap-3"><span className="min-w-0 truncate">{label}</span><span className="shrink-0 font-mono tabular-nums text-[#666]">{formatDuration(secs, fmt)}</span></div>
      <div className="mt-1 h-1 rounded-full bg-ck-border-light" aria-hidden="true"><div className="h-1 rounded-full" style={{ width: `${total ? (secs / total) * 100 : 0}%`, background: color }} /></div>
    </li>
  )
}

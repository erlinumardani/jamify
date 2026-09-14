import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, FolderKanban, Lock, Plus, Search, SearchX, Star } from 'lucide-react'
import { useStore } from '../store'
import { Button, EmptyState, Field, Modal, PageHeader, ProjectDot, Toggle, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { entrySeconds, formatDuration, formatMoney } from '../lib/time'
import { PROJECT_COLORS } from '../types'

export default function Projects() {
  const { state, dispatch, clientById, addProject, rateFor, can } = useStore()
  const { notify } = useFeedback()
  const navigate = useNavigate()
  const { settings } = state
  const [filter, setFilter] = useState<'active' | 'archived' | 'templates' | 'all'>('active')
  const [q, setQ] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [open, setOpen] = useState(false)

  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[6])
  const [billable, setBillable] = useState(settings.billableByDefault)
  const [templateId, setTemplateId] = useState('')

  const stats = useMemo(() => {
    const m = new Map<string, { secs: number; amount: number }>()
    for (const e of state.entries) {
      if (!e.projectId) continue
      const s = m.get(e.projectId) ?? { secs: 0, amount: 0 }
      const secs = entrySeconds(e)
      s.secs += secs; s.amount += (secs / 3600) * rateFor(e)
      m.set(e.projectId, s)
    }
    for (const x of state.expenses) {
      if (!x.projectId || !x.billable) continue
      const s = m.get(x.projectId) ?? { secs: 0, amount: 0 }
      s.amount += x.amount
      m.set(x.projectId, s)
    }
    return m
  }, [state.entries, state.expenses, rateFor])

  const templates = state.projects.filter((p) => p.isTemplate)
  const list = state.projects
    .filter((p) => filter === 'all' || (filter === 'templates' ? p.isTemplate : !p.isTemplate && (filter === 'archived') === p.archived))
    .filter((p) => !clientFilter || p.clientId === clientFilter)
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))
  const filtered = !!q || !!clientFilter || filter !== 'active'
  const clearFilters = () => { setFilter('active'); setClientFilter(''); setQ('') }

  const template = templates.find((x) => x.id === templateId)
  const trimmed = name.trim()
  const targetClient = clientId || template?.clientId || null
  const duplicate = !!trimmed && state.projects.some((p) => !p.isTemplate && p.clientId === targetClient && p.name.toLowerCase() === trimmed.toLowerCase())

  const create = () => {
    if (!trimmed || duplicate) return
    const t = template
    const p = addProject({
      name: trimmed, clientId: targetClient, color: t?.color ?? color, billable: t ? t.billable : billable,
      hourlyRate: t?.hourlyRate ?? null, estimateHours: t?.estimateHours ?? null, budget: t?.budget ?? null,
      isTemplate: false, favorite: false, note: t?.note ?? '', tasks: t?.tasks.map((x) => ({ ...x, done: false })) ?? [],
    })
    setOpen(false); setName(''); setClientId(''); setColor(PROJECT_COLORS[6]); setBillable(settings.billableByDefault); setTemplateId('')
    notify(`Project "${p.name}" created`, { action: { label: 'Open', onClick: () => navigate(`/projects/${p.id}`) } })
  }

  const emptyTitle = q ? `No projects match "${q}"`
    : filter === 'archived' ? 'No archived projects'
    : filter === 'templates' ? 'No project templates'
    : clientFilter ? 'No projects for this client' : 'No active projects'

  return (
    <div>
      <PageHeader title="Projects">
        {can.manage && <Button onClick={() => setOpen(true)}><Plus size={16} aria-hidden="true" /> Create new project</Button>}
      </PageHeader>

      <div className="ck-card mb-4 flex flex-wrap items-center gap-2 p-3">
        <select className="ck-select" aria-label="Project status" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="active">Show active</option>
          <option value="archived">Show archived</option>
          <option value="templates">Show templates</option>
          <option value="all">Show all</option>
        </select>
        <select className="ck-select min-w-0" aria-label="Client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="relative min-w-[200px] flex-1 sm:ml-auto sm:flex-none">
          <Search size={15} aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ck-muted" />
          <input type="search" className="ck-input pl-8" aria-label="Search projects by name" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="ck-card overflow-x-auto">
        {list.length === 0 ? (
          state.projects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban size={40} />}
              title="No projects yet"
              hint={can.manage ? 'Projects group time entries and track estimates and budgets.' : 'Projects appear here once a manager creates one you can access.'}
              action={can.manage ? <Button onClick={() => setOpen(true)}><Plus size={16} aria-hidden="true" /> Create new project</Button> : undefined}
            />
          ) : (
            <EmptyState
              icon={<SearchX size={40} />}
              title={emptyTitle}
              hint={filter === 'templates' && !q && !clientFilter ? 'Turn on "Use as template" in a project\'s settings to reuse its tasks and rates.' : 'Try a different search or filter.'}
              action={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : <Button variant="outline" onClick={() => setFilter('all')}>Show all projects</Button>}
            />
          )
        ) : (
          <table className="ck-table w-full min-w-[820px]">
            <thead>
              <tr><th className="w-8"><span className="sr-only">Favorite</span></th><th>Name</th><th>Client</th><th className="text-right">Tracked</th><th className="text-right">Amount</th><th className="w-[180px]">Estimate</th><th className="w-[180px]">Budget</th><th>Billable</th></tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = stats.get(p.id) ?? { secs: 0, amount: 0 }
                const estPct = p.estimateHours ? (s.secs / 3600 / p.estimateHours) * 100 : null
                const budPct = p.budget ? (s.amount / p.budget) * 100 : null
                return (
                  <tr key={p.id} className="hover:bg-ck-bg/40">
                    <td className="pl-2 pr-0">
                      <FavoriteButton name={p.name} favorite={p.favorite} canToggle={can.manage} size={16} onToggle={() => dispatch({ type: 'project/update', id: p.id, patch: { favorite: !p.favorite } })} />
                    </td>
                    <td>
                      <Link to={`/projects/${p.id}`} className="inline-flex items-center gap-2 font-medium hover:underline" style={{ color: p.color }}>
                        <ProjectDot color={p.color} size={10} /> {p.name}
                        {!p.isPublic && <><Lock size={12} className="text-ck-muted" aria-hidden="true" /><span className="sr-only">(private)</span></>}
                        {p.archived && <span className="rounded-sm bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ck-muted">archived</span>}
                        {p.isTemplate && <span className="rounded-sm bg-ck-blue-light px-1.5 py-0.5 text-[10px] font-medium uppercase text-ck-blue-dark">template</span>}
                      </Link>
                    </td>
                    <td className="text-[#555]">{clientById(p.clientId)?.name ?? <span className="text-ck-muted">—</span>}</td>
                    <td className="text-right font-mono tabular-nums">{formatDuration(s.secs, settings.durationFormat)}</td>
                    <td className="text-right tabular-nums">{p.billable ? formatMoney(s.amount, settings.currency) : <span className="text-ck-muted">—</span>}</td>
                    <td><Progress pct={estPct} label={estPct !== null ? `${(s.secs / 3600).toFixed(1)} / ${p.estimateHours}h` : null} alertAt={settings.budgetAlertPercent} /></td>
                    <td><Progress pct={budPct} label={budPct !== null ? `${formatMoney(s.amount, settings.currency)} / ${formatMoney(p.budget!, settings.currency)}` : null} alertAt={settings.budgetAlertPercent} /></td>
                    <td>{p.billable ? <span className="text-ck-blue">Yes</span> : <span className="text-ck-muted">No</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create new project"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} disabled={!trimmed || duplicate}>Create</Button></>}
      >
        <div className="space-y-4">
          <Field label="Name" error={duplicate ? `A project named "${trimmed}" already exists${targetClient ? ' for this client' : ''}.` : null}>
            {(fp) => <input {...fp} autoFocus className="ck-input" placeholder="Enter project name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />}
          </Field>
          {templates.length > 0 && (
            <Field label="Start from template" help={template ? 'Copies the template\'s color, rates, estimate, budget and tasks.' : undefined}>
              {(fp) => (
                <select {...fp} className="ck-select w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">No template</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} tasks)</option>)}
                </select>
              )}
            </Field>
          )}
          <Field label="Client">
            {(fp) => (
              <select {...fp} className="ck-select w-full" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {state.clients.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          {!templateId && (
            <>
              <div>
                <span className="ck-label">Color</span>
                <ColorPicker value={color} onChange={setColor} label="Project color" />
              </div>
              <Toggle checked={billable} onChange={setBillable} label="Billable" />
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

/** Star toggle for managers; a plain indicator for everyone else (favorites are shared across the workspace). */
export function FavoriteButton({ name, favorite, canToggle, size, onToggle }: { name: string; favorite: boolean; canToggle: boolean; size: number; onToggle: () => void }) {
  const star = <Star size={size} aria-hidden="true" className={cn(favorite && 'fill-amber-400 text-amber-400')} />
  if (!canToggle) return favorite ? <span className="inline-flex h-8 w-8 items-center justify-center">{star}<span className="sr-only">Favorite</span></span> : null
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={`Favorite ${name}`}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={onToggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ck-muted transition-colors hover:bg-black/5 hover:text-amber-500"
    >
      {star}
    </button>
  )
}

export function Progress({ pct, label, alertAt }: { pct: number | null; label: string | null; alertAt: number }) {
  if (pct === null) return <span className="text-xs text-ck-muted">{label ?? '—'}</span>
  const over = pct >= 100
  const warn = !over && pct >= alertAt
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-ck-border-light" aria-hidden="true">
          <div className={cn('h-1.5 rounded-full', over ? 'bg-ck-red' : warn ? 'bg-amber-500' : 'bg-ck-green')} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className={cn('w-10 text-right text-xs tabular-nums', over ? 'text-ck-red' : warn ? 'text-amber-700' : 'text-ck-muted')}>{Math.round(pct)}%</span>
        {(over || warn) && <><AlertTriangle size={13} aria-hidden="true" className={over ? 'text-ck-red' : 'text-amber-700'} /><span className="sr-only">{over ? 'over the limit' : 'near the limit'}</span></>}
      </div>
      {label && <div className="mt-0.5 text-[11px] tabular-nums text-ck-muted">{label}</div>}
    </div>
  )
}

export function ColorPicker({ value, onChange, label = 'Color' }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', value === c ? 'border-ck-text' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

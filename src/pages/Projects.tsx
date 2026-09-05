import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Plus, Search, Star } from 'lucide-react'
import { useStore } from '../store'
import { Button, EmptyState, Modal, PageHeader, ProjectDot, Toggle, cn } from '../components/ui'
import { entrySeconds, formatDuration, formatMoney } from '../lib/time'
import { PROJECT_COLORS } from '../types'

export default function Projects() {
  const { state, dispatch, clientById, addProject, rateFor } = useStore()
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

  const create = () => {
    if (!name.trim()) return
    const t = templates.find((x) => x.id === templateId)
    addProject({
      name: name.trim(), clientId: clientId || t?.clientId || null, color: t?.color ?? color, billable: t ? t.billable : billable,
      hourlyRate: t?.hourlyRate ?? null, estimateHours: t?.estimateHours ?? null, budget: t?.budget ?? null,
      isTemplate: false, favorite: false, note: t?.note ?? '', tasks: t?.tasks.map((x) => ({ ...x, done: false })) ?? [],
    })
    setOpen(false); setName(''); setClientId(''); setColor(PROJECT_COLORS[6]); setBillable(settings.billableByDefault); setTemplateId('')
  }

  return (
    <div>
      <PageHeader title="Projects">
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Create new project</Button>
      </PageHeader>

      <div className="ck-card mb-4 flex flex-wrap items-center gap-2 p-3">
        <select className="ck-select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="active">Show active</option>
          <option value="archived">Show archived</option>
          <option value="templates">Show templates</option>
          <option value="all">Show all</option>
        </select>
        <select className="ck-select" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ck-muted" />
          <input className="ck-input pl-8" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="ck-card overflow-x-auto">
        {list.length === 0 ? (
          <EmptyState title="No projects found" hint="Projects let you group time entries, set budgets and track progress." action={<Button onClick={() => setOpen(true)}>Create new project</Button>} />
        ) : (
          <table className="ck-table w-full min-w-[820px]">
            <thead>
              <tr><th className="w-8" /><th>Name</th><th>Client</th><th className="text-right">Tracked</th><th className="text-right">Amount</th><th className="w-[180px]">Estimate</th><th className="w-[180px]">Budget</th><th>Billable</th></tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = stats.get(p.id) ?? { secs: 0, amount: 0 }
                const estPct = p.estimateHours ? (s.secs / 3600 / p.estimateHours) * 100 : null
                const budPct = p.budget ? (s.amount / p.budget) * 100 : null
                return (
                  <tr key={p.id} className="hover:bg-ck-bg/40">
                    <td className="pr-0">
                      <button type="button" title={p.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => dispatch({ type: 'project/update', id: p.id, patch: { favorite: !p.favorite } })} className="text-ck-muted hover:text-amber-500">
                        <Star size={16} className={cn(p.favorite && 'fill-amber-400 text-amber-400')} />
                      </button>
                    </td>
                    <td>
                      <Link to={`/projects/${p.id}`} className="inline-flex items-center gap-2 font-medium hover:underline" style={{ color: p.color }}>
                        <ProjectDot color={p.color} size={10} /> {p.name}
                        {p.archived && <span className="rounded-sm bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ck-muted">archived</span>}
                        {p.isTemplate && <span className="rounded-sm bg-ck-blue-light px-1.5 py-0.5 text-[10px] font-medium uppercase text-ck-blue-dark">template</span>}
                      </Link>
                    </td>
                    <td className="text-[#555]">{clientById(p.clientId)?.name ?? <span className="text-ck-muted">—</span>}</td>
                    <td className="text-right font-mono">{formatDuration(s.secs, settings.durationFormat)}</td>
                    <td className="text-right">{p.billable ? formatMoney(s.amount, settings.currency) : <span className="text-ck-muted">—</span>}</td>
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
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} disabled={!name.trim()}>Create</Button></>}
      >
        <div className="space-y-4">
          <div>
            <label className="ck-label">Name</label>
            <input autoFocus className="ck-input" placeholder="Enter project name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          </div>
          {templates.length > 0 && (
            <div>
              <label className="ck-label">Start from template</label>
              <select className="ck-select w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">No template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} tasks)</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="ck-label">Client</label>
            <select className="ck-select w-full" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client</option>
              {state.clients.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!templateId && (
            <>
              <div>
                <label className="ck-label">Color</label>
                <ColorPicker value={color} onChange={setColor} />
              </div>
              <Toggle checked={billable} onChange={setBillable} label="Billable" />
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

export function Progress({ pct, label, alertAt }: { pct: number | null; label: string | null; alertAt: number }) {
  if (pct === null) return <span className="text-xs text-ck-muted">—</span>
  const over = pct >= 100
  const warn = !over && pct >= alertAt
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-ck-border-light">
          <div className={cn('h-1.5 rounded-full', over ? 'bg-ck-red' : warn ? 'bg-amber-500' : 'bg-ck-green')} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className={cn('w-10 text-right text-xs', over ? 'text-ck-red' : warn ? 'text-amber-600' : 'text-ck-muted')}>{Math.round(pct)}%</span>
        {(over || warn) && <AlertTriangle size={13} className={over ? 'text-ck-red' : 'text-amber-600'} />}
      </div>
      {label && <div className="mt-0.5 text-[10px] text-ck-muted">{label}</div>}
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn('h-6 w-6 rounded-full border-2 transition-transform hover:scale-110', value === c ? 'border-ck-text' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

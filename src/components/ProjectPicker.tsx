import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Star } from 'lucide-react'
import { useStore } from '../store'
import { Popover, ProjectDot, cn } from './ui'
import type { Project } from '../types'
import { PROJECT_COLORS } from '../types'

export interface ProjectSelection {
  projectId: string | null
  taskId: string | null
}

export function ProjectLabel({ projectId, taskId, className, placeholder = 'Project' }: ProjectSelection & { className?: string; placeholder?: string }) {
  const { projectById, clientById, taskById } = useStore()
  const p = projectById(projectId)
  if (!p) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-ck-blue', className)}>
        <Plus size={14} /> {placeholder}
      </span>
    )
  }
  const task = taskById(projectId, taskId)
  const client = clientById(p.clientId)
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} style={{ color: p.color }}>
      <ProjectDot color={p.color} />
      <span className="truncate">
        {p.name}
        {task && <span className="text-ck-text">: {task.name}</span>}
        {client && <span className="text-ck-muted"> - {client.name}</span>}
      </span>
    </span>
  )
}

export function ProjectPicker({
  value, onChange, className, align = 'left', placeholder, disabled,
}: {
  value: ProjectSelection
  onChange: (v: ProjectSelection) => void
  className?: string
  align?: 'left' | 'right'
  placeholder?: string
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <div className={cn('flex max-w-full items-center px-2 py-1 text-left text-sm opacity-70', className)}>
        <ProjectLabel {...value} placeholder={placeholder} />
      </div>
    )
  }
  return (
    <Popover
      align={align}
      width={320}
      className={className}
      trigger={() => (
        <button type="button" className="flex max-w-full items-center rounded-sm px-2 py-1 text-left text-sm hover:bg-black/5">
          <ProjectLabel {...value} placeholder={placeholder} />
        </button>
      )}
    >
      {(close) => <ProjectMenu value={value} onChange={(v) => { onChange(v); close() }} />}
    </Popover>
  )
}

export function ProjectMenu({ value, onChange }: { value: ProjectSelection; onChange: (v: ProjectSelection) => void }) {
  const { state, clientById, addProject } = useStore()
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(value.projectId)

  const { favorites, groups } = useMemo(() => {
    const active = state.projects.filter((p) => !p.archived && !p.isTemplate && p.name.toLowerCase().includes(q.toLowerCase()))
    const favorites = active.filter((p) => p.favorite).sort((a, b) => a.name.localeCompare(b.name))
    const map = new Map<string, Project[]>()
    for (const p of active) {
      const key = p.clientId ?? ''
      map.set(key, [...(map.get(key) ?? []), p])
    }
    const groups = [...map.entries()]
      .map(([clientId, projects]) => ({ clientId, name: clientId ? clientById(clientId)?.name ?? 'Client' : 'No client', projects: projects.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => (a.clientId === '' ? 1 : b.clientId === '' ? -1 : a.name.localeCompare(b.name)))
    return { favorites, groups }
  }, [state.projects, q, clientById])

  const createProject = () => {
    const name = q.trim()
    if (!name) return
    const p = addProject({
      name, clientId: null, color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)], billable: state.settings.billableByDefault,
      hourlyRate: null, estimateHours: null, budget: null, isTemplate: false, favorite: false, note: '',
    })
    onChange({ projectId: p.id, taskId: null })
  }

  const renderProject = (p: Project) => (
    <div key={p.id}>
      <div className={cn('flex items-center hover:bg-ck-bg', value.projectId === p.id && !value.taskId && 'bg-ck-blue-light')}>
        <button
          type="button"
          onClick={() => onChange({ projectId: p.id, taskId: null })}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm"
        >
          <ProjectDot color={p.color} />
          <span className="truncate" style={{ color: p.color }}>{p.name}</span>
          {p.favorite && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />}
        </button>
        {p.tasks.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            className="px-2 text-xs text-ck-muted hover:text-ck-text"
            title="Tasks"
          >
            <span className="inline-flex items-center gap-0.5">{p.tasks.length} {expanded === p.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          </button>
        )}
      </div>
      {expanded === p.id &&
        p.tasks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange({ projectId: p.id, taskId: t.id })}
            className={cn('flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-sm hover:bg-ck-bg', value.taskId === t.id && 'bg-ck-blue-light')}
          >
            <span className={cn(t.done && 'text-ck-muted line-through')}>{t.name}</span>
          </button>
        ))}
    </div>
  )

  return (
    <div className="flex max-h-[380px] flex-col">
      <div className="border-b border-ck-border-light p-2">
        <input
          autoFocus
          className="ck-input h-8"
          placeholder="Search project..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && groups.length === 0 && createProject()}
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <button
          type="button"
          onClick={() => onChange({ projectId: null, taskId: null })}
          className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-ck-bg', !value.projectId && 'bg-ck-blue-light')}
        >
          <ProjectDot color="#999" /> No project
        </button>
        {favorites.length > 0 && (
          <div>
            <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-ck-muted">Favorites</div>
            {favorites.map(renderProject)}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.clientId}>
            <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-ck-muted">{g.name}</div>
            {g.projects.map(renderProject)}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="px-3 py-3 text-center text-sm text-ck-muted">No projects found</div>
        )}
      </div>
      <div className="border-t border-ck-border-light p-2">
        <button
          type="button"
          disabled={!q.trim()}
          onClick={createProject}
          className="flex w-full items-center justify-center gap-1 rounded-sm border border-ck-blue py-1.5 text-xs font-medium uppercase tracking-wide text-ck-blue hover:bg-ck-blue-light disabled:opacity-40"
        >
          <Plus size={14} /> Create {q.trim() ? `"${q.trim()}"` : 'new project'}
        </button>
      </div>
    </div>
  )
}

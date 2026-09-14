import { useState } from 'react'
import { Check, Plus, Tag as TagIcon } from 'lucide-react'
import { useStore } from '../store'
import { Popover, cn } from './ui'

export function TagLabel({ tagIds, className, placeholder }: { tagIds: string[]; className?: string; placeholder?: string }) {
  const { tagById } = useStore()
  const names = tagIds.map((id) => tagById(id)?.name).filter(Boolean)
  if (!names.length) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-sm text-ck-muted', className)}>
        <TagIcon size={16} aria-hidden="true" />{placeholder}
      </span>
    )
  }
  return <span className={cn('truncate text-sm text-ck-text', className)}>{names.join(', ')}</span>
}

export function TagPicker({ value, onChange, align = 'left', className, placeholder, disabled }: {
  value: string[]; onChange: (ids: string[]) => void; align?: 'left' | 'right'; className?: string
  /** text shown next to the icon while no tag is selected */
  placeholder?: string
  disabled?: boolean
}) {
  const { state, tagById, addTag } = useStore()
  const [q, setQ] = useState('')
  const query = q.trim()
  const tags = state.tags.filter((t) => !t.archived && t.name.toLowerCase().includes(query.toLowerCase()))
  const exact = state.tags.some((t) => !t.archived && t.name.toLowerCase() === query.toLowerCase())
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const create = () => {
    if (!query || exact) return
    const t = addTag(query)
    onChange([...value, t.id])
    setQ('')
  }
  const names = value.map((id) => tagById(id)?.name).filter(Boolean)
  const label = names.length ? `Tags: ${names.join(', ')}` : 'Add tags'

  if (disabled) {
    return names.length ? <span className={cn('max-w-[180px] truncate px-2 text-xs text-ck-muted', className)} title={names.join(', ')}>{names.join(', ')}</span> : null
  }
  return (
    <Popover
      align={align}
      width={260}
      className={className}
      trigger={(open) => (
        <button type="button" title={label} aria-label={label} aria-haspopup="true" aria-expanded={open} className="flex h-8 max-w-[180px] items-center rounded-sm px-2 hover:bg-black/5">
          <TagLabel tagIds={value} placeholder={placeholder} />
        </button>
      )}
    >
      {() => (
        <div className="flex max-h-[320px] flex-col">
          <div className="border-b border-ck-border-light p-2">
            <input
              autoFocus
              aria-label="Search or create tag"
              className="ck-input h-8"
              placeholder="Search tags..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (tags.length === 1) toggle(tags[0].id)
                else if (tags.length === 0) create()
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {tags.map((t) => {
              const on = value.includes(t.id)
              return (
                <button key={t.id} type="button" aria-pressed={on} onClick={() => toggle(t.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-ck-bg">
                  <span aria-hidden="true" className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border', on ? 'border-ck-blue bg-ck-blue text-white' : 'border-ck-border bg-white')}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{t.name}</span>
                </button>
              )
            })}
            {tags.length === 0 && (
              <div className="px-3 py-3 text-center text-sm text-ck-muted">
                {query ? <>No tags match "{query}". Press Enter to create it.</> : 'No tags yet. Type a name to create one.'}
              </div>
            )}
          </div>
          <div className="border-t border-ck-border-light p-2">
            <button type="button" disabled={!query || exact} onClick={create} className="flex w-full items-center justify-center gap-1 rounded-sm border border-ck-blue py-1.5 text-xs font-medium uppercase tracking-wide text-ck-blue hover:bg-ck-blue-light disabled:cursor-not-allowed disabled:opacity-40">
              <Plus size={14} aria-hidden="true" /> <span className="truncate">Create {query ? `"${query}"` : 'new tag'}</span>
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}

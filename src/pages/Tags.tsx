import { useId, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Plus, Tag as TagIcon, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { Button, EmptyState, IconButton, PageHeader, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import type { Tag } from '../types'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function Tags() {
  const { state, dispatch, addTag, can } = useStore()
  const { confirm, notify } = useFeedback()
  const [name, setName] = useState('')
  const [filter, setFilter] = useState<'active' | 'archived'>('active')
  const inputRef = useRef<HTMLInputElement>(null)
  const list = state.tags.filter((t) => (filter === 'archived') === t.archived).sort((a, b) => a.name.localeCompare(b.name))
  const findByName = (n: string, exceptId?: string) => state.tags.find((t) => t.id !== exceptId && t.name.toLowerCase() === n.trim().toLowerCase())
  const taken = name.trim() ? findByName(name) : undefined
  const usage = (id: string) => state.entries.filter((e) => e.tagIds.includes(id)).length

  const add = () => {
    const n = name.trim()
    if (!n || taken) return
    addTag(n)
    setName('')
    setFilter('active')
    notify(`Tag "${n}" added`)
  }

  const setArchived = (t: Tag, archived: boolean) => {
    dispatch({ type: 'tag/update', id: t.id, patch: { archived } })
    notify(`Tag "${t.name}" ${archived ? 'archived' : 'restored'}`, { action: { label: 'Undo', onClick: () => dispatch({ type: 'tag/update', id: t.id, patch: { archived: !archived } }) } })
  }

  const remove = async (t: Tag) => {
    const n = usage(t.id)
    const ok = await confirm({
      title: `Delete tag "${t.name}"?`,
      message: `${n ? `It is removed from ${plural(n, 'time entry', 'time entries')}; the entries themselves are kept.` : 'No time entry uses it.'} This can't be undone.`,
      confirmLabel: 'Delete tag',
      danger: true,
    })
    if (!ok) return
    dispatch({ type: 'tag/delete', id: t.id })
    notify(`Tag "${t.name}" deleted`)
  }

  return (
    <div>
      <PageHeader title="Tags" />
      <div className="ck-card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            className="ck-input min-w-[200px] flex-1"
            aria-label="New tag name"
            aria-invalid={taken ? true : undefined}
            aria-describedby={taken ? 'tag-name-error' : undefined}
            placeholder="Add new tag"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button onClick={add} disabled={!name.trim() || !!taken}><Plus size={16} aria-hidden="true" /> Add</Button>
          <select className="ck-select" aria-label="Show tags" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="active">Show active</option>
            <option value="archived">Show archived</option>
          </select>
        </div>
        {taken && <p id="tag-name-error" role="alert" className="mt-1.5 text-xs text-ck-red">A tag named "{taken.name}" already exists{taken.archived ? ' (archived)' : ''}.</p>}
        {!can.manage && <p className="mt-2 text-xs text-[#666]">Anyone can add tags. Only owners, admins and managers can rename, archive or delete them.</p>}
      </div>
      <div className="ck-card overflow-x-auto">
        {list.length === 0 ? (
          filter === 'archived' ? (
            <EmptyState icon={<Archive size={40} />} title="No archived tags" hint="Tags you archive are listed here." action={<Button variant="outline" onClick={() => setFilter('active')}>Show active tags</Button>} />
          ) : (
            <EmptyState
              icon={<TagIcon size={40} />}
              title="No tags yet"
              hint="Tags add another dimension to your time entries, e.g. “urgent” or “research”."
              action={<Button variant="outline" onClick={() => inputRef.current?.focus()}><Plus size={16} aria-hidden="true" /> Add a tag</Button>}
            />
          )
        ) : (
          <table className="ck-table w-full">
            <thead><tr><th>Name</th><th className="text-right">Entries</th>{can.manage && <th className="w-28 text-right">Actions</th>}</tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="hover:bg-ck-bg/40">
                  <td>
                    {can.manage
                      ? <NameInput key={t.name} value={t.name} label="Tag name" taken={(v) => !!findByName(v, t.id)} onSave={(v) => dispatch({ type: 'tag/update', id: t.id, patch: { name: v } })} />
                      : t.name}
                  </td>
                  <td className="text-right tabular-nums text-[#666]">{usage(t.id)}</td>
                  {can.manage && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <IconButton title={t.archived ? 'Restore' : 'Archive'} aria-label={`${t.archived ? 'Restore' : 'Archive'} ${t.name}`} onClick={() => setArchived(t, !t.archived)}>
                          {t.archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                        </IconButton>
                        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ck-muted transition-colors hover:bg-red-50 hover:text-ck-red" title="Delete" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/** Inline rename: saves on blur or Enter, Escape reverts; empty or duplicate names are flagged and never saved. */
function NameInput({ value, label, taken, onSave }: { value: string; label: string; taken: (v: string) => boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const errId = useId()
  const v = draft.trim()
  const error = !v ? 'Enter a name.' : taken(v) ? 'Another tag already has this name.' : null
  return (
    <div className="max-w-md">
      <input
        className={cn('w-full rounded-sm border bg-transparent px-2 py-1 outline-none', error ? 'border-ck-red' : 'border-transparent hover:border-ck-border focus:border-ck-blue')}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (error) return; if (v !== value) onSave(v); else setDraft(value) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setDraft(value) }}
      />
      {error && <p id={errId} role="alert" className="mt-1 px-2 text-xs text-ck-red">{error}</p>}
    </div>
  )
}

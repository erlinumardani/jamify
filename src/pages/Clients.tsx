import { useId, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Briefcase, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { Button, EmptyState, IconButton, PageHeader, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import type { Client } from '../types'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function Clients() {
  const { state, dispatch, addClient, can } = useStore()
  const { confirm, notify } = useFeedback()
  const [name, setName] = useState('')
  const [filter, setFilter] = useState<'active' | 'archived'>('active')
  const inputRef = useRef<HTMLInputElement>(null)
  const list = state.clients.filter((c) => (filter === 'archived') === c.archived).sort((a, b) => a.name.localeCompare(b.name))
  const findByName = (n: string, exceptId?: string) => state.clients.find((c) => c.id !== exceptId && c.name.toLowerCase() === n.trim().toLowerCase())
  const taken = name.trim() ? findByName(name) : undefined

  const add = () => {
    const n = name.trim()
    if (!n || taken) return
    addClient(n)
    setName('')
    setFilter('active')
    notify(`Client "${n}" added`)
  }

  const setArchived = (c: Client, archived: boolean) => {
    dispatch({ type: 'client/update', id: c.id, patch: { archived } })
    notify(`Client "${c.name}" ${archived ? 'archived' : 'restored'}`, { action: { label: 'Undo', onClick: () => dispatch({ type: 'client/update', id: c.id, patch: { archived: !archived } }) } })
  }

  const remove = async (c: Client) => {
    const projects = state.projects.filter((p) => p.clientId === c.id).length
    const invoices = state.invoices.filter((i) => i.clientId === c.id).length
    const kept = [projects && plural(projects, 'project'), invoices && plural(invoices, 'invoice')].filter(Boolean).join(' and ')
    const ok = await confirm({
      title: `Delete client "${c.name}"?`,
      message: `${kept ? `Its ${kept} ${projects + invoices === 1 ? 'is' : 'are'} kept without a client.` : 'No project or invoice uses it.'} This can't be undone.`,
      confirmLabel: 'Delete client',
      danger: true,
    })
    if (!ok) return
    dispatch({ type: 'client/delete', id: c.id })
    notify(`Client "${c.name}" deleted`)
  }

  return (
    <div>
      <PageHeader title="Clients" />
      <div className="ck-card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {can.manage ? (
            <>
              <input
                ref={inputRef}
                className="ck-input min-w-[200px] flex-1"
                aria-label="New client name"
                aria-invalid={taken ? true : undefined}
                aria-describedby={taken ? 'client-name-error' : undefined}
                placeholder="Add new client"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              <Button onClick={add} disabled={!name.trim() || !!taken}><Plus size={16} aria-hidden="true" /> Add</Button>
            </>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-[#666]">Only owners, admins and managers can add or edit clients.</p>
          )}
          <select className="ck-select" aria-label="Show clients" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="active">Show active</option>
            <option value="archived">Show archived</option>
          </select>
        </div>
        {taken && <p id="client-name-error" role="alert" className="mt-1.5 text-xs text-ck-red">A client named "{taken.name}" already exists{taken.archived ? ' (archived)' : ''}.</p>}
      </div>
      <div className="ck-card overflow-x-auto">
        {list.length === 0 ? (
          filter === 'archived' ? (
            <EmptyState icon={<Archive size={40} />} title="No archived clients" hint="Clients you archive are listed here." action={<Button variant="outline" onClick={() => setFilter('active')}>Show active clients</Button>} />
          ) : (
            <EmptyState
              icon={<Briefcase size={40} />}
              title="No clients yet"
              hint="Clients group your projects and let you filter reports and invoices."
              action={can.manage ? <Button variant="outline" onClick={() => inputRef.current?.focus()}><Plus size={16} aria-hidden="true" /> Add a client</Button> : undefined}
            />
          )
        ) : (
          <table className="ck-table w-full">
            <thead><tr><th>Name</th><th>Projects</th>{can.manage && <th className="w-28 text-right">Actions</th>}</tr></thead>
            <tbody>
              {list.map((c) => {
                const projects = state.projects.filter((p) => p.clientId === c.id)
                return (
                  <tr key={c.id} className="hover:bg-ck-bg/40">
                    <td>
                      {can.manage
                        ? <NameInput key={c.name} value={c.name} label="Client name" taken={(v) => !!findByName(v, c.id)} onSave={(v) => dispatch({ type: 'client/update', id: c.id, patch: { name: v } })} />
                        : c.name}
                    </td>
                    <td className="text-[#666]">{projects.length ? projects.map((p) => p.name).join(', ') : <span className="text-ck-muted">—</span>}</td>
                    {can.manage && (
                      <td>
                        <div className="flex justify-end gap-1">
                          <IconButton title={c.archived ? 'Restore' : 'Archive'} aria-label={`${c.archived ? 'Restore' : 'Archive'} ${c.name}`} onClick={() => setArchived(c, !c.archived)}>
                            {c.archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                          </IconButton>
                          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ck-muted transition-colors hover:bg-red-50 hover:text-ck-red" title="Delete" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
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
  const error = !v ? 'Enter a name.' : taken(v) ? 'Another client already has this name.' : null
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

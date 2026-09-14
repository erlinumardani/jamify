import { useEffect, useState } from 'react'
import { DollarSign, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { useFeedback } from './feedback'
import { Button, Field, Modal, cn } from './ui'
import { ProjectPicker } from './ProjectPicker'
import { TagPicker } from './TagPicker'
import { formatDuration, fromDateKey, pad, parseTimeInput, toDateKey } from '../lib/time'
import type { TimeEntry } from '../types'

export interface EntryModalTarget {
  /** existing entry id, or null when creating */
  id: string | null
  start: Date
  end: Date
  description?: string
  projectId?: string | null
  taskId?: string | null
  tagIds?: string[]
  billable?: boolean
}

export function EntryModal({ target, onClose }: { target: EntryModalTarget | null; onClose: () => void }) {
  const { state, dispatch, addEntry, updateEntry, deleteEntry, missingFields } = useStore()
  const { notify } = useFeedback()
  const [description, setDescription] = useState('')
  const [project, setProject] = useState<{ projectId: string | null; taskId: string | null }>({ projectId: null, taskId: null })
  const [tagIds, setTagIds] = useState<string[]>([])
  const [billable, setBillable] = useState(false)
  const [date, setDate] = useState('')
  const [startStr, setStartStr] = useState('')
  const [endStr, setEndStr] = useState('')

  useEffect(() => {
    if (!target) return
    setDescription(target.description ?? '')
    setProject({ projectId: target.projectId ?? null, taskId: target.taskId ?? null })
    setTagIds(target.tagIds ?? [])
    setBillable(target.billable ?? state.settings.billableByDefault)
    setDate(toDateKey(target.start))
    setStartStr(`${pad(target.start.getHours())}:${pad(target.start.getMinutes())}`)
    setEndStr(`${pad(target.end.getHours())}:${pad(target.end.getMinutes())}`)
  }, [target, state.settings.billableByDefault])

  if (!target) return null

  const { lockBefore } = state.settings
  const base = fromDateKey(date || toDateKey(new Date()))
  const start = parseTimeInput(startStr, base)
  let end = parseTimeInput(endStr, base)
  if (start && end && end <= start) end = new Date(end.getTime() + 86400000)
  const startError = start ? null : 'Enter a time like 09:00 or 9:30 am'
  const endError = end ? null : 'Enter a time like 17:00 or 5 pm'
  const dateError = !date ? 'Pick a date' : lockBefore && date < lockBefore ? `Dates before ${lockBefore} are locked` : null
  const missing = missingFields({ description, projectId: project.projectId, taskId: project.taskId, tagIds, billable })
  const valid = !!start && !!end && !dateError && !missing
  const seconds = start && end ? Math.round((end.getTime() - start.getTime()) / 1000) : 0

  const save = () => {
    if (!valid) return
    const patch: Partial<TimeEntry> = {
      description, projectId: project.projectId, taskId: project.taskId, tagIds, billable,
      start: start!.toISOString(), end: end!.toISOString(),
    }
    if (target.id) updateEntry(target.id, patch)
    else addEntry({ description, projectId: project.projectId, taskId: project.taskId, tagIds, billable, start: start!, end: end! })
    onClose()
  }

  const remove = () => {
    const entry = state.entries.find((e) => e.id === target.id)
    if (!entry) return onClose()
    deleteEntry(entry.id)
    onClose()
    notify('Time entry deleted', { action: { label: 'Undo', onClick: () => dispatch({ type: 'entry/add', entry }) } })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={target.id ? 'Edit time entry' : 'Add time entry'}
      footer={
        <>
          {target.id && (
            <Button variant="ghost" className="mr-auto text-ck-red hover:bg-red-50" onClick={remove}>
              <Trash2 size={16} aria-hidden="true" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid} title={missing ?? dateError ?? undefined}>{target.id ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Description">
          {(p) => <input {...p} autoFocus className="ck-input" placeholder="What have you worked on?" value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />}
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-full rounded-sm border border-ck-border sm:basis-0">
            <ProjectPicker value={project} onChange={setProject} />
          </div>
          <div className="rounded-sm border border-ck-border">
            <TagPicker value={tagIds} onChange={setTagIds} placeholder="Tags" align="right" />
          </div>
          <button
            type="button"
            title={billable ? 'Billable' : 'Non-billable'}
            aria-label="Billable"
            aria-pressed={billable}
            onClick={() => setBillable(!billable)}
            className={cn('flex h-9 w-9 items-center justify-center rounded-sm border', billable ? 'border-ck-blue bg-ck-blue-light text-ck-blue' : 'border-ck-border text-ck-muted hover:text-ck-text')}
          >
            <DollarSign size={16} aria-hidden="true" />
          </button>
        </div>
        {missing && <p className="text-xs text-amber-700">{missing}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Start" error={startError}>
            {(p) => <input {...p} className="ck-input" value={startStr} onChange={(e) => setStartStr(e.target.value)} placeholder="09:00" />}
          </Field>
          <Field label="End" error={endError}>
            {(p) => <input {...p} className="ck-input" value={endStr} onChange={(e) => setEndStr(e.target.value)} placeholder="10:00" />}
          </Field>
          <Field label="Date" error={dateError} className="col-span-2 sm:col-span-1">
            {(p) => <input {...p} type="date" className="ck-input" min={lockBefore ?? undefined} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <div className="text-sm text-[#666]">
          Duration: <span className="font-mono tabular-nums text-ck-text">{start && end ? formatDuration(seconds) : '--:--:--'}</span>
          {start && end && end.getDate() !== start.getDate() && <span className="ml-2 text-xs">(ends the next day)</span>}
        </div>
      </div>
    </Modal>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react'
import { useStore, uid } from '../store'
import { Button, Field, Modal, PageHeader, Toggle, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { SmtpSettings } from '../components/SmtpSettings'
import { DEFAULT_SETTINGS, PROJECT_COLORS, type AppState, type DurationFormat, type Member, type Project, type RoundingMode, type Task, type TimeEntry, type TimeFormat } from '../types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'IDR', 'JPY', 'AUD', 'CAD', 'SGD', 'INR']

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function SettingsPage() {
  const { state, dispatch, wipeData, importData, addProject, addTag, can } = useStore()
  const { confirm, notify } = useFeedback()
  const s = state.settings
  const jsonRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef(0)
  // what the name field shows while it is being edited; an empty name is never saved
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')
  const { hash } = useLocation()

  // links such as /settings#email (from the invite dialog) jump to their section
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])
  useEffect(() => () => window.clearTimeout(savedTimer.current), [])

  // every change saves right away; the header confirms it (the fieldset can't disable the toggles)
  const set = (patch: Partial<typeof s>) => {
    if (!can.admin) return
    dispatch({ type: 'settings/update', patch })
    setSaved(true)
    window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSaved(false), 2000)
  }

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'jamify-workspace.json'; a.click()
    URL.revokeObjectURL(url)
    notify('Workspace exported to jamify-workspace.json')
  }

  const onImportJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppState>
      if (!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.projects)) throw new Error('bad format')
      const full: AppState = {
        version: 2,
        clients: parsed.clients ?? [], tags: parsed.tags ?? [], members: parsed.members?.length ? parsed.members : state.members,
        projects: ((parsed.projects ?? []) as Partial<Project>[]).map((p) => ({ budget: null, isTemplate: false, favorite: false, note: '', isPublic: true, memberIds: [], ...p, tasks: ((p.tasks ?? []) as Partial<Task>[]).map((t) => ({ hourlyRate: null, ...t })) })) as Project[],
        entries: ((parsed.entries ?? []) as Partial<TimeEntry>[]).map((e) => ({ invoiceId: null, ...e })) as TimeEntry[],
        settings: { ...DEFAULT_SETTINGS, workspaceName: s.workspaceName, ...(parsed.settings ?? {}) },
        // the signed-in member stays who they are, whatever the file says
        currentUserId: state.currentUserId,
        expenses: parsed.expenses ?? [], invoices: parsed.invoices ?? [], timeOffPolicies: parsed.timeOffPolicies ?? [],
        timeOffRequests: parsed.timeOffRequests ?? [], approvals: parsed.approvals ?? [], schedules: parsed.schedules ?? [],
      }
      // account links come from this workspace, never from the file
      full.members = (full.members as Partial<Member>[]).map((m) => ({
        costRate: null, workingHours: 8, ...m, authUserId: state.members.find((x) => x.id === m.id)?.authUserId ?? null,
      })) as Member[]
      const me = state.members.find((m) => m.id === state.currentUserId)
      if (me && !full.members.some((m) => m.id === me.id)) full.members = [me, ...full.members]
      const ok = await confirm({
        title: 'Replace this workspace with the file?',
        message: (
          <>
            All data and settings in this workspace, currently {plural(state.entries.length, 'time entry', 'time entries')} and {plural(state.projects.length, 'project')}, are
            replaced for everyone by the file's {plural(full.entries.length, 'time entry', 'time entries')} and {plural(full.projects.length, 'project')}.
            This can't be undone, so export a backup first if you may need the current data.
          </>
        ),
        confirmLabel: 'Replace workspace',
        danger: true,
      })
      if (!ok) return
      importData(full)
      notify(`Imported ${plural(full.entries.length, 'time entry', 'time entries')} and ${plural(full.projects.length, 'project')}`)
    } catch {
      notify('Could not import: the file is not a valid workspace export.', { tone: 'error' })
    }
  }

  const onImportCsv = async (file: File) => {
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) throw new Error('empty')
      const header = rows[0].map((h) => h.trim().toLowerCase())
      const idx = (names: string[]) => header.findIndex((h) => names.includes(h))
      const iDesc = idx(['description', 'task description', 'note'])
      const iProj = idx(['project'])
      const iTask = idx(['task'])
      const iTags = idx(['tags', 'tag'])
      const iBill = idx(['billable'])
      const iStart = idx(['start', 'start time', 'start date time'])
      const iEnd = idx(['end', 'end time', 'end date time'])
      const iDate = idx(['date', 'start date'])
      const iDur = idx(['duration (h)', 'duration', 'duration (decimal)', 'hours'])
      if (iStart < 0 && iDate < 0) throw new Error('missing start')

      const projectByName = new Map(state.projects.map((p) => [p.name.toLowerCase(), p]))
      const tagByName = new Map(state.tags.map((t) => [t.name.toLowerCase(), t]))
      const entries: TimeEntry[] = []
      let skipped = 0
      for (const r of rows.slice(1)) {
        if (!r.some((c) => c.trim())) continue
        const startStr = iStart >= 0 ? r[iStart] : `${r[iDate]} 09:00`
        const start = new Date(startStr.replace(' ', 'T'))
        if (isNaN(start.getTime())) { skipped++; continue }
        let end: Date | null = null
        if (iEnd >= 0 && r[iEnd]) {
          const e = new Date(r[iEnd].replace(' ', 'T'))
          if (!isNaN(e.getTime())) end = e
        }
        if (!end && iDur >= 0 && r[iDur]) {
          const raw = r[iDur].trim()
          const hours = /^\d+:\d{2}/.test(raw) ? raw.split(':').reduce((acc, v, i) => acc + Number(v) / [1, 60, 3600][i], 0) : parseFloat(raw)
          if (!isNaN(hours)) end = new Date(start.getTime() + hours * 3600000)
        }
        if (!end || end <= start) { skipped++; continue }
        let projectId: string | null = null
        let taskId: string | null = null
        const pname = iProj >= 0 ? r[iProj].trim() : ''
        if (pname) {
          let p = projectByName.get(pname.toLowerCase())
          if (!p) {
            p = addProject({ name: pname, clientId: null, color: PROJECT_COLORS[projectByName.size % PROJECT_COLORS.length], billable: s.billableByDefault, hourlyRate: null, estimateHours: null, budget: null, isTemplate: false, favorite: false, note: '' })
            projectByName.set(pname.toLowerCase(), p)
          }
          projectId = p.id
          const tname = iTask >= 0 ? r[iTask].trim() : ''
          if (tname) {
            const existing = p.tasks.find((t) => t.name.toLowerCase() === tname.toLowerCase())
            if (existing) taskId = existing.id
            else {
              const task = { id: uid(), name: tname, done: false, hourlyRate: null }
              dispatch({ type: 'task/add', projectId: p.id, task })
              p.tasks.push(task)
              taskId = task.id
            }
          }
        }
        const tagIds: string[] = []
        if (iTags >= 0 && r[iTags]) {
          for (const raw of r[iTags].split(/[;,|]/)) {
            const tn = raw.trim()
            if (!tn) continue
            let t = tagByName.get(tn.toLowerCase())
            if (!t) { t = addTag(tn); tagByName.set(tn.toLowerCase(), t) }
            tagIds.push(t.id)
          }
        }
        const billable = iBill >= 0 ? /^(yes|true|1|y)$/i.test(r[iBill].trim()) : s.billableByDefault
        entries.push({ id: uid(), description: iDesc >= 0 ? r[iDesc] : '', projectId, taskId, tagIds, billable, start: start.toISOString(), end: end.toISOString(), userId: state.currentUserId, invoiceId: null })
      }
      const skippedNote = skipped ? `${plural(skipped, 'row')} without a valid start and end` : ''
      if (entries.length) {
        dispatch({ type: 'entry/addMany', entries })
        notify(`Imported ${plural(entries.length, 'time entry', 'time entries')}${skipped ? `; skipped ${skippedNote}` : ''}`, skipped ? { duration: 8000 } : undefined)
      } else {
        notify(`No time entries imported${skipped ? `: ${skippedNote}` : ': the file has no data rows'}.`, { tone: 'error', duration: 8000 })
      }
    } catch {
      notify('Could not import: the CSV needs a header row with Start and End (or Date and Duration).', { tone: 'error', duration: 8000 })
    }
  }

  // wiping affects everyone, so the admin types the workspace name to confirm
  const confirmWord = s.workspaceName.trim() || 'DELETE'
  const closeWipe = () => { setWipeOpen(false); setWipeText('') }
  const wipe = () => {
    if (wipeText.trim() !== confirmWord) return
    wipeData()
    closeWipe()
    notify('All workspace data deleted')
  }
  const wipeCounts = [
    plural(state.entries.length, 'time entry', 'time entries'), plural(state.projects.length, 'project'), plural(state.clients.length, 'client'),
    plural(state.tags.length, 'tag'), plural(state.expenses.length, 'expense'), plural(state.invoices.length, 'invoice'),
  ].join(', ')

  return (
    <div className="max-w-3xl">
      <PageHeader title="Workspace settings">
        {can.admin && (
          <span className={cn('inline-flex items-center gap-1.5 text-sm', saved ? 'font-medium text-ck-green' : 'text-ck-muted')}>
            {saved && <Check size={16} aria-hidden="true" />}
            <span role="status">{saved ? 'Saved' : ''}</span>
            {!saved && 'Changes save automatically'}
          </span>
        )}
      </PageHeader>

      {!can.admin && (
        <div className="mb-4 rounded-sm bg-ck-blue-light px-4 py-3 text-sm text-ck-blue-dark">Only the workspace owner and admins can change these settings.</div>
      )}
      <fieldset disabled={!can.admin} className="min-w-0 space-y-4">
        <Section title="General">
          <Field label="Workspace name" error={nameDraft !== null && !nameDraft.trim() ? 'Enter a workspace name. The saved name is kept until you do.' : null}>
            {(fp) => (
              <input
                {...fp}
                className="ck-input"
                value={nameDraft ?? s.workspaceName}
                onChange={(e) => { const v = e.target.value; setNameDraft(v); if (v.trim()) set({ workspaceName: v }) }}
                onBlur={() => setNameDraft(null)}
              />
            )}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Currency">
              {(fp) => (
                <select {...fp} className="ck-select w-full" value={s.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </Field>
            <Field label="Workspace hourly rate" help="Used when no task, project or member rate is set.">
              {(fp) => <input {...fp} type="number" min={0} className="ck-input" value={s.hourlyRate} onChange={(e) => set({ hourlyRate: Number(e.target.value) || 0 })} />}
            </Field>
          </div>
          <Toggle checked={s.billableByDefault} onChange={(v) => set({ billableByDefault: v })} label="New time entries are billable by default" />
        </Section>

        <Section title="Time & date">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Week starts on">
              {(fp) => (
                <select {...fp} className="ck-select w-full" value={s.weekStart} onChange={(e) => set({ weekStart: Number(e.target.value) as 0 | 1 })}>
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              )}
            </Field>
            <Field label="Time format">
              {(fp) => (
                <select {...fp} className="ck-select w-full" value={s.timeFormat} onChange={(e) => set({ timeFormat: e.target.value as TimeFormat })}>
                  <option value="24">24-hour (14:30)</option>
                  <option value="12">12-hour (2:30 PM)</option>
                </select>
              )}
            </Field>
            <Field label="Duration format">
              {(fp) => (
                <select {...fp} className="ck-select w-full" value={s.durationFormat} onChange={(e) => set({ durationFormat: e.target.value as DurationFormat })}>
                  <option value="full">Full (01:30:00)</option>
                  <option value="compact">Compact (1h 30m)</option>
                  <option value="decimal">Decimal (1.50)</option>
                </select>
              )}
            </Field>
          </div>
        </Section>

        <Section title="Time rounding" hint="Applied to durations and amounts in Reports and Invoices. Tracked entries keep their exact times.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Round to">
              {(fp) => (
                <select {...fp} className="ck-select w-full" value={s.roundingMinutes} onChange={(e) => set({ roundingMinutes: Number(e.target.value) })}>
                  <option value={0}>No rounding</option>
                  {[5, 6, 10, 12, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              )}
            </Field>
            <Field label="Direction" help={s.roundingMinutes ? undefined : 'Pick an interval first.'}>
              {(fp) => (
                <select {...fp} className="ck-select w-full" value={s.roundingMode} disabled={!s.roundingMinutes} onChange={(e) => set({ roundingMode: e.target.value as RoundingMode })}>
                  <option value="nearest">To nearest</option>
                  <option value="up">Round up</option>
                  <option value="down">Round down</option>
                </select>
              )}
            </Field>
          </div>
        </Section>

        <Section title="Timesheet lock" hint="Entries that start before this date can't be edited or deleted. Use it after invoicing or approving a period.">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Lock entries before">
              {(fp) => <input {...fp} type="date" className="ck-input w-auto" value={s.lockBefore ?? ''} onChange={(e) => set({ lockBefore: e.target.value || null })} />}
            </Field>
            {s.lockBefore && <Button variant="ghost" onClick={() => set({ lockBefore: null })}>Unlock all</Button>}
          </div>
        </Section>

        <Section title="Required fields" hint="The timer won't start and manual entries can't be added until these are filled in.">
          <Toggle checked={s.requireDescription} onChange={(v) => set({ requireDescription: v })} label="Description is required" />
          <Toggle checked={s.requireProject} onChange={(v) => set({ requireProject: v })} label="Project is required" />
          <Toggle checked={s.requireTags} onChange={(v) => set({ requireTags: v })} label="At least one tag is required" />
        </Section>

        <Section title="Targets & alerts" hint="Targets show progress on the Dashboard. Budget alerts highlight projects that reach the given share of their estimate or budget.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Daily target (hours)">
              {(fp) => <input {...fp} type="number" min={0} step={0.5} className="ck-input" placeholder="None" value={s.dailyTargetHours ?? ''} onChange={(e) => set({ dailyTargetHours: e.target.value === '' ? null : Number(e.target.value) })} />}
            </Field>
            <Field label="Weekly target (hours)">
              {(fp) => <input {...fp} type="number" min={0} step={0.5} className="ck-input" placeholder="None" value={s.weeklyTargetHours ?? ''} onChange={(e) => set({ weeklyTargetHours: e.target.value === '' ? null : Number(e.target.value) })} />}
            </Field>
            <Field label="Budget alert at (%)" help="Between 1 and 100.">
              {(fp) => <input {...fp} type="number" min={1} max={100} className="ck-input" value={s.budgetAlertPercent} onChange={(e) => set({ budgetAlertPercent: Math.min(100, Math.max(1, Number(e.target.value) || 80)) })} />}
            </Field>
          </div>
        </Section>

        {can.admin && (
          <Section
            id="email"
            title="Email (SMTP)"
            hint="Invitations are emailed through your own email provider. The password is encrypted in Supabase Vault and never shown again."
          >
            <SmtpSettings />
          </Section>
        )}

        <Section title="Data" hint="Everything is stored in Supabase in this workspace. Export a backup, or import a backup or a CSV timesheet.">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportJson}><Download size={15} aria-hidden="true" /> Export JSON</Button>
            <Button variant="outline" onClick={() => jsonRef.current?.click()}><Upload size={15} aria-hidden="true" /> Import JSON</Button>
            <Button variant="outline" onClick={() => csvRef.current?.click()}><FileSpreadsheet size={15} aria-hidden="true" /> Import CSV timesheet</Button>
            <input ref={jsonRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportJson(f); e.target.value = '' }} />
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportCsv(f); e.target.value = '' }} />
          </div>
          <p className="text-xs text-ck-muted">CSV columns recognised: Description, Project, Task, Tags, Billable, Start, End, Date, Duration. The Reports CSV export can be re-imported directly.</p>
        </Section>

        <Section title="Danger zone" tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Delete all data</div>
              <p className="text-sm text-[#666]">Deletes every time entry, project, client, tag, expense, invoice, time off request, approval and schedule, for everyone. Members and settings are kept.</p>
            </div>
            <Button variant="danger" onClick={() => setWipeOpen(true)}><Trash2 size={15} aria-hidden="true" /> Delete all data</Button>
          </div>
        </Section>
      </fieldset>

      <Modal
        open={wipeOpen}
        onClose={closeWipe}
        title="Delete all data?"
        footer={
          <>
            <Button variant="ghost" onClick={closeWipe}>Cancel</Button>
            <Button variant="danger" className="disabled:opacity-50" disabled={wipeText.trim() !== confirmWord} onClick={wipe}><Trash2 size={15} aria-hidden="true" /> Delete all data</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-[#555]">
          <p>
            This permanently deletes <b className="font-medium text-ck-text">{wipeCounts}</b>, plus all time off, approvals and schedules in this workspace, for everyone in it.
            Members and workspace settings are kept.
          </p>
          <p>
            This can't be undone. <button type="button" className="font-medium text-ck-blue hover:underline" onClick={exportJson}>Export a backup first</button>
          </p>
          <Field label={<>Type <span className="normal-case text-ck-text">{confirmWord}</span> to confirm</>}>
            {(fp) => <input {...fp} autoFocus autoComplete="off" spellCheck={false} className="ck-input" value={wipeText} onChange={(e) => setWipeText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && wipe()} />}
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function Section({ id, title, hint, tone, children }: { id?: string; title: string; hint?: string; tone?: 'danger'; children: React.ReactNode }) {
  return (
    <section id={id} className={cn('ck-card scroll-mt-4 space-y-4 p-5', tone === 'danger' && 'border-red-200!')}>
      <div>
        <h2 className={cn('text-xs font-medium uppercase tracking-wide', tone === 'danger' ? 'text-ck-red' : 'text-ck-muted')}>{title}</h2>
        {hint && <p className="mt-1 text-sm text-[#666]">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** Minimal RFC 4180 parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows
}

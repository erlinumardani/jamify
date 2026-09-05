import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react'
import { useStore, uid } from '../store'
import { Button, PageHeader, Toggle } from '../components/ui'
import { DEFAULT_SETTINGS, PROJECT_COLORS, type AppState, type DurationFormat, type Member, type Project, type RoundingMode, type Task, type TimeEntry, type TimeFormat } from '../types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'IDR', 'JPY', 'AUD', 'CAD', 'SGD', 'INR']

export default function SettingsPage() {
  const { state, dispatch, wipeData, importData, addProject, addTag } = useStore()
  const s = state.settings
  const jsonRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState(false)
  const [csvResult, setCsvResult] = useState<string | null>(null)

  const set = (patch: Partial<typeof s>) => {
    dispatch({ type: 'settings/update', patch })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'jamify-workspace.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const onImportJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppState>
      if (!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.projects)) throw new Error('bad format')
      const full: AppState = {
        version: 2,
        clients: parsed.clients ?? [], tags: parsed.tags ?? [], members: parsed.members?.length ? parsed.members : state.members,
        projects: ((parsed.projects ?? []) as Partial<Project>[]).map((p) => ({ budget: null, isTemplate: false, favorite: false, note: '', ...p, tasks: ((p.tasks ?? []) as Partial<Task>[]).map((t) => ({ hourlyRate: null, ...t })) })) as Project[],
        entries: ((parsed.entries ?? []) as Partial<TimeEntry>[]).map((e) => ({ invoiceId: null, ...e })) as TimeEntry[],
        settings: { ...DEFAULT_SETTINGS, workspaceName: s.workspaceName, ...(parsed.settings ?? {}) },
        currentUserId: parsed.currentUserId ?? state.currentUserId,
        expenses: parsed.expenses ?? [], invoices: parsed.invoices ?? [], timeOffPolicies: parsed.timeOffPolicies ?? [],
        timeOffRequests: parsed.timeOffRequests ?? [], approvals: parsed.approvals ?? [], schedules: parsed.schedules ?? [],
      }
      full.members = (full.members as Partial<Member>[]).map((m) => ({ costRate: null, workingHours: 8, ...m })) as Member[]
      if (confirm('Replace the current workspace with the imported data?')) importData(full)
    } catch {
      alert('Could not import: the file is not a valid workspace export.')
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
      if (entries.length) dispatch({ type: 'entry/addMany', entries })
      setCsvResult(`Imported ${entries.length} time entr${entries.length === 1 ? 'y' : 'ies'}${skipped ? `, skipped ${skipped} row${skipped === 1 ? '' : 's'} without a valid time` : ''}.`)
    } catch {
      setCsvResult('Could not import: expected a CSV with a header row containing at least Start and End (or Date and Duration).')
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Workspace settings">{saved && <span className="text-sm text-ck-green">Saved</span>}</PageHeader>

      <div className="space-y-4">
        <Section title="General">
          <div>
            <label className="ck-label">Workspace name</label>
            <input className="ck-input" value={s.workspaceName} onChange={(e) => set({ workspaceName: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="ck-label">Currency</label>
              <select className="ck-select w-full" value={s.currency} onChange={(e) => set({ currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="ck-label">Workspace hourly rate</label>
              <input type="number" min={0} className="ck-input" value={s.hourlyRate} onChange={(e) => set({ hourlyRate: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <Toggle checked={s.billableByDefault} onChange={(v) => set({ billableByDefault: v })} label="New time entries are billable by default" />
        </Section>

        <Section title="Time & date">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="ck-label">Week starts on</label>
              <select className="ck-select w-full" value={s.weekStart} onChange={(e) => set({ weekStart: Number(e.target.value) as 0 | 1 })}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
            <div>
              <label className="ck-label">Time format</label>
              <select className="ck-select w-full" value={s.timeFormat} onChange={(e) => set({ timeFormat: e.target.value as TimeFormat })}>
                <option value="24">24-hour (14:30)</option>
                <option value="12">12-hour (2:30 PM)</option>
              </select>
            </div>
            <div>
              <label className="ck-label">Duration format</label>
              <select className="ck-select w-full" value={s.durationFormat} onChange={(e) => set({ durationFormat: e.target.value as DurationFormat })}>
                <option value="full">Full (01:30:00)</option>
                <option value="compact">Compact (1h 30m)</option>
                <option value="decimal">Decimal (1.50)</option>
              </select>
            </div>
          </div>
        </Section>

        <Section title="Time rounding" hint="Applied to durations and amounts in Reports and Invoices. Tracked entries keep their exact times.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="ck-label">Round to</label>
              <select className="ck-select w-full" value={s.roundingMinutes} onChange={(e) => set({ roundingMinutes: Number(e.target.value) })}>
                <option value={0}>No rounding</option>
                {[5, 6, 10, 12, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </div>
            <div>
              <label className="ck-label">Direction</label>
              <select className="ck-select w-full" value={s.roundingMode} disabled={!s.roundingMinutes} onChange={(e) => set({ roundingMode: e.target.value as RoundingMode })}>
                <option value="nearest">To nearest</option>
                <option value="up">Round up</option>
                <option value="down">Round down</option>
              </select>
            </div>
          </div>
        </Section>

        <Section title="Timesheet lock" hint="Entries that start before this date can't be edited or deleted. Use it after invoicing or approving a period.">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="ck-label">Lock entries before</label>
              <input type="date" className="ck-input w-auto" value={s.lockBefore ?? ''} onChange={(e) => set({ lockBefore: e.target.value || null })} />
            </div>
            {s.lockBefore && <Button variant="ghost" size="sm" onClick={() => set({ lockBefore: null })}>Unlock all</Button>}
          </div>
        </Section>

        <Section title="Required fields" hint="The timer won't start and manual entries can't be added until these are filled in.">
          <Toggle checked={s.requireDescription} onChange={(v) => set({ requireDescription: v })} label="Description is required" />
          <Toggle checked={s.requireProject} onChange={(v) => set({ requireProject: v })} label="Project is required" />
          <Toggle checked={s.requireTags} onChange={(v) => set({ requireTags: v })} label="At least one tag is required" />
        </Section>

        <Section title="Targets & alerts" hint="Targets show progress on the Dashboard. Budget alerts highlight projects that reach the given share of their estimate or budget.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="ck-label">Daily target (hours)</label>
              <input type="number" min={0} step={0.5} className="ck-input" placeholder="None" value={s.dailyTargetHours ?? ''} onChange={(e) => set({ dailyTargetHours: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label className="ck-label">Weekly target (hours)</label>
              <input type="number" min={0} step={0.5} className="ck-input" placeholder="None" value={s.weeklyTargetHours ?? ''} onChange={(e) => set({ weeklyTargetHours: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label className="ck-label">Budget alert at (%)</label>
              <input type="number" min={1} max={100} className="ck-input" value={s.budgetAlertPercent} onChange={(e) => set({ budgetAlertPercent: Math.min(100, Math.max(1, Number(e.target.value) || 80)) })} />
            </div>
          </div>
        </Section>

        <Section title="Data" hint="Everything is stored in Supabase under your account. Export a backup, import a backup or a CSV timesheet, or start over.">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportJson}><Download size={15} /> Export JSON</Button>
            <Button variant="outline" onClick={() => jsonRef.current?.click()}><Upload size={15} /> Import JSON</Button>
            <Button variant="outline" onClick={() => csvRef.current?.click()}><FileSpreadsheet size={15} /> Import CSV timesheet</Button>
            <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportJson(f); e.target.value = '' }} />
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportCsv(f); e.target.value = '' }} />
            <Button variant="danger" onClick={() => confirm('Delete ALL data in this workspace (entries, projects, clients, tags, expenses, invoices, time off, approvals, schedules)? Your account and workspace settings are kept. This cannot be undone.') && wipeData()}><Trash2 size={15} /> Delete all data</Button>
          </div>
          {csvResult && <div className="text-sm text-[#555]">{csvResult}</div>}
          <p className="text-xs text-ck-muted">CSV columns recognised: Description, Project, Task, Tags, Billable, Start, End, Date, Duration. The Reports CSV export can be re-imported directly.</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="ck-card space-y-4 p-5">
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-ck-muted">{title}</h2>
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

import { useMemo, useState } from 'react'
import { eachDayOfInterval, format, differenceInCalendarDays } from 'date-fns'
import { BarChart3, ChevronDown, ChevronRight, Download, SearchX } from 'lucide-react'
import { useStore } from '../store'
import { Button, EmptyState, PageHeader, ProjectDot, Tabs, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { entrySeconds, formatDuration, formatMoney, formatTime, inRange, presetRange, RANGE_PRESETS, roundSeconds, toDateKey, type RangePreset } from '../lib/time'
import type { TimeEntry } from '../types'

type Tab = 'summary' | 'detailed' | 'members'
const num = 'text-right tabular-nums'

export default function Reports() {
  const { state, can, projectById, clientById, tagById, taskById, memberById, rateFor, costRateFor } = useStore()
  const { notify } = useFeedback()
  const { settings } = state
  const [tab, setTab] = useState<Tab>('summary')
  const [preset, setPreset] = useState<RangePreset>('thisWeek')
  const [custom, setCustom] = useState<[string, string]>(() => { const [f, t] = presetRange('thisWeek', settings.weekStart); return [toDateKey(f), toDateKey(t)] })
  const [projectFilter, setProjectFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [billableFilter, setBillableFilter] = useState<'all' | 'billable' | 'non'>('all')
  const [q, setQ] = useState('')
  const [applyRounding, setApplyRounding] = useState(true)
  const [activeBar, setActiveBar] = useState<number | null>(null)

  const [from, to] = useMemo<[Date, Date]>(() => {
    if (preset === 'custom') {
      const [f, t] = custom
      const fd = new Date(f), td = new Date(t)
      return isNaN(fd.getTime()) || isNaN(td.getTime()) ? presetRange('thisWeek', settings.weekStart) : fd <= td ? [fd, td] : [td, fd]
    }
    return presetRange(preset, settings.weekStart)
  }, [preset, custom, settings.weekStart])

  const rounded = applyRounding && settings.roundingMinutes > 0
  const secsOf = (e: TimeEntry) => (rounded ? roundSeconds(entrySeconds(e), settings.roundingMinutes, settings.roundingMode) : entrySeconds(e))

  const entries = useMemo(() => {
    return state.entries
      .filter((e) => e.end !== null && inRange(e, from, to))
      .filter((e) => !projectFilter || e.projectId === projectFilter)
      .filter((e) => !clientFilter || projectById(e.projectId)?.clientId === clientFilter)
      .filter((e) => !tagFilter || e.tagIds.includes(tagFilter))
      .filter((e) => !memberFilter || e.userId === memberFilter)
      .filter((e) => billableFilter === 'all' || (billableFilter === 'billable') === e.billable)
      .filter((e) => !q || e.description.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.start.localeCompare(a.start))
  }, [state.entries, from, to, projectFilter, clientFilter, tagFilter, memberFilter, billableFilter, q, projectById])

  const expenses = useMemo(() => {
    const f = toDateKey(from), t = toDateKey(to)
    return state.expenses
      .filter((x) => x.date >= f && x.date <= t)
      .filter((x) => !projectFilter || x.projectId === projectFilter)
      .filter((x) => !clientFilter || projectById(x.projectId)?.clientId === clientFilter)
      .filter((x) => !memberFilter || x.memberId === memberFilter)
      .filter((x) => billableFilter === 'all' || (billableFilter === 'billable') === x.billable)
  }, [state.expenses, from, to, projectFilter, clientFilter, memberFilter, billableFilter, projectById])

  const amount = (e: TimeEntry) => (secsOf(e) / 3600) * rateFor(e)
  const cost = (e: TimeEntry) => (secsOf(e) / 3600) * costRateFor(e)
  const total = entries.reduce((a, e) => a + secsOf(e), 0)
  const billableTotal = entries.filter((e) => e.billable).reduce((a, e) => a + secsOf(e), 0)
  const timeAmount = entries.reduce((a, e) => a + amount(e), 0)
  const laborCost = entries.reduce((a, e) => a + cost(e), 0)
  const expenseTotal = expenses.reduce((a, x) => a + x.amount, 0)
  const billableExpenses = expenses.filter((x) => x.billable).reduce((a, x) => a + x.amount, 0)
  const revenue = timeAmount + billableExpenses
  const profit = revenue - laborCost - expenseTotal

  const daily = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to })
    const span = differenceInCalendarDays(to, from)
    const bucketByWeek = span > 62
    const map = new Map<string, number>()
    for (const e of entries) {
      const d = new Date(e.start)
      const key = bucketByWeek ? format(d, 'yyyy-ww') : toDateKey(d)
      map.set(key, (map.get(key) ?? 0) + secsOf(e))
    }
    if (bucketByWeek) {
      const seen = new Map<string, Date>()
      for (const d of days) { const k = format(d, 'yyyy-ww'); if (!seen.has(k)) seen.set(k, d) }
      return [...seen.entries()].map(([k, d]) => ({ label: format(d, 'MMM d'), full: `Week of ${format(d, 'MMM d')}`, secs: map.get(k) ?? 0 }))
    }
    return days.map((d) => ({ label: format(d, span > 14 ? 'd' : 'EEE d'), full: format(d, 'EEE, MMM d'), secs: map.get(toDateKey(d)) ?? 0 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, from, to, rounded])

  const byProject = useMemo(() => {
    const map = new Map<string, { secs: number; amount: number; cost: number; items: Map<string, { secs: number; amount: number }> }>()
    for (const e of entries) {
      const key = e.projectId ?? ''
      const g = map.get(key) ?? { secs: 0, amount: 0, cost: 0, items: new Map() }
      const s = secsOf(e)
      g.secs += s; g.amount += amount(e); g.cost += cost(e)
      const desc = e.description || '(no description)'
      const it = g.items.get(desc) ?? { secs: 0, amount: 0 }
      it.secs += s; it.amount += amount(e)
      g.items.set(desc, it)
      map.set(key, g)
    }
    for (const x of expenses) {
      const key = x.projectId ?? ''
      const g = map.get(key) ?? { secs: 0, amount: 0, cost: 0, items: new Map() }
      if (x.billable) g.amount += x.amount
      g.cost += x.amount
      const it = g.items.get(`Expense: ${x.category}`) ?? { secs: 0, amount: 0 }
      if (x.billable) it.amount += x.amount
      g.items.set(`Expense: ${x.category}`, it)
      map.set(key, g)
    }
    return [...map.entries()]
      .map(([id, g]) => ({ id: id || null, ...g, items: [...g.items.entries()].sort((a, b) => b[1].secs - a[1].secs || b[1].amount - a[1].amount) }))
      .sort((a, b) => b.secs - a.secs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, expenses, rounded])

  const byMember = useMemo(() => {
    const map = new Map<string, { secs: number; billable: number; amount: number; cost: number }>()
    for (const e of entries) {
      const g = map.get(e.userId) ?? { secs: 0, billable: 0, amount: 0, cost: 0 }
      const s = secsOf(e)
      g.secs += s; if (e.billable) g.billable += s; g.amount += amount(e); g.cost += cost(e)
      map.set(e.userId, g)
    }
    return [...map.entries()].sort((a, b) => b[1].secs - a[1].secs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, rounded])

  const exportCsv = () => {
    try {
      const rows = [['Project', 'Client', 'Description', 'Task', 'Tags', 'Member', 'Billable', 'Start', 'End', 'Duration (h)', 'Amount', 'Cost']]
      for (const e of entries) {
        const p = projectById(e.projectId)
        rows.push([
          p?.name ?? '', clientById(p?.clientId ?? null)?.name ?? '', e.description, taskById(e.projectId, e.taskId)?.name ?? '',
          e.tagIds.map((t) => tagById(t)?.name ?? '').join('; '), memberById(e.userId)?.name ?? '', e.billable ? 'Yes' : 'No',
          format(new Date(e.start), 'yyyy-MM-dd HH:mm'), format(new Date(e.end!), 'yyyy-MM-dd HH:mm'),
          (secsOf(e) / 3600).toFixed(2), amount(e).toFixed(2), cost(e).toFixed(2),
        ])
      }
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url; a.download = `jamify-report-${toDateKey(from)}_${toDateKey(to)}.csv`; a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify(`Exported ${entries.length} time entr${entries.length === 1 ? 'y' : 'ies'} to CSV`)
    } catch {
      notify('Could not export the report', { tone: 'error' })
    }
  }

  const maxDay = Math.max(1, ...daily.map((d) => d.secs))
  const peak = daily.reduce<(typeof daily)[number] | null>((best, d) => (d.secs > (best?.secs ?? 0) ? d : best), null)
  const shownBar = activeBar !== null ? daily[activeBar] : undefined
  const activeProjects = state.projects.filter((p) => !p.isTemplate && (!p.archived || p.id === projectFilter))
  const cur = settings.currency
  const unit = differenceInCalendarDays(to, from) > 62 ? 'week' : 'day'
  const filtersActive = !!(projectFilter || clientFilter || tagFilter || memberFilter || billableFilter !== 'all' || q)
  const clearFilters = () => { setProjectFilter(''); setClientFilter(''); setTagFilter(''); setMemberFilter(''); setBillableFilter('all'); setQ('') }

  const onChartKey = (e: React.KeyboardEvent) => {
    const last = daily.length - 1
    const next = e.key === 'ArrowRight' ? Math.min(last, (activeBar ?? -1) + 1)
      : e.key === 'ArrowLeft' ? Math.max(0, (activeBar ?? last + 1) - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    setActiveBar(next)
  }

  const emptyState = (what: string) => (
    <div className="ck-card">
      {filtersActive ? (
        <EmptyState icon={<SearchX size={40} />} title="No results for these filters" hint={`No ${what} match the current filters in this period.`} action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>} />
      ) : (
        <EmptyState icon={<BarChart3 size={40} />} title={`No ${what} in this period`} hint="Pick another date range, or track some time to see it here." />
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader title="Reports">
        {settings.roundingMinutes > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-[#666]"><input type="checkbox" className="accent-ck-blue" checked={applyRounding} onChange={(e) => setApplyRounding(e.target.checked)} /> Round to {settings.roundingMinutes} min</label>
        )}
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!entries.length} title={entries.length ? undefined : 'No time entries to export'}><Download size={14} aria-hidden="true" /> Export CSV</Button>
      </PageHeader>

      <div className="ck-card flex flex-wrap items-center gap-2 p-3" role="search" aria-label="Report filters">
        <select className="ck-select" aria-label="Date range" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
          {RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {preset === 'custom' && (
          <div className="flex items-center gap-1">
            <input type="date" aria-label="Start date" className="ck-input w-auto" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            <span className="text-ck-muted" aria-hidden="true">–</span>
            <input type="date" aria-label="End date" className="ck-input w-auto" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
          </div>
        )}
        <span className="text-sm text-ck-muted">{format(from, 'MMM d, yyyy')} – {format(to, 'MMM d, yyyy')}</span>
        <div className="mx-1 hidden h-6 w-px bg-ck-border-light sm:block" />
        <select className="ck-select" aria-label="Project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="ck-select" aria-label="Client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {can.manage && (
          <select className="ck-select" aria-label="Member" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
            <option value="">All members</option>
            {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <select className="ck-select" aria-label="Tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">All tags</option>
          {state.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="ck-select" aria-label="Billable" value={billableFilter} onChange={(e) => setBillableFilter(e.target.value as typeof billableFilter)}>
          <option value="all">Billable & non-billable</option>
          <option value="billable">Billable</option>
          <option value="non">Non-billable</option>
        </select>
        <input type="search" aria-label="Description contains" className="ck-input w-full min-w-[160px] sm:w-auto" placeholder="Description contains..." value={q} onChange={(e) => setQ(e.target.value)} />
        {filtersActive && <Button variant="link" size="sm" className="text-sm normal-case tracking-normal" onClick={clearFilters}>Clear filters</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Total time" value={formatDuration(total, settings.durationFormat)} />
        <Tile label="Billable time" value={formatDuration(billableTotal, settings.durationFormat)} />
        <Tile label="Billable amount" value={formatMoney(revenue, cur)} sub={billableExpenses ? `incl. ${formatMoney(billableExpenses, cur)} expenses` : undefined} />
        <Tile label="Expenses" value={formatMoney(expenseTotal, cur)} />
        <Tile label="Labor cost" value={formatMoney(laborCost, cur)} />
        <Tile label="Profit" value={formatMoney(profit, cur)} tone={profit < 0 ? 'red' : 'green'} sub={profit < 0 ? 'Loss for this period' : undefined} />
      </div>

      <Tabs tabs={[{ id: 'summary', label: 'Summary' }, { id: 'detailed', label: 'Detailed' }, ...(can.manage ? [{ id: 'members' as const, label: 'Team' }] : [])]} value={tab} onChange={setTab} />

      {tab === 'summary' && (!entries.length && !expenses.length ? emptyState('time or expenses') : (
        <>
          <div className="ck-card p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span id="report-chart-title" className="text-xs font-medium uppercase tracking-wide text-ck-muted">Tracked time per {unit}</span>
              <span className="text-xs text-[#666] tabular-nums" aria-live="polite">
                {shownBar ? `${shownBar.full}: ${formatDuration(shownBar.secs, settings.durationFormat)}` : peak ? `Busiest ${unit}: ${peak.full} · ${formatDuration(peak.secs, settings.durationFormat)}` : ''}
              </span>
            </div>
            <div
              role="group"
              aria-labelledby="report-chart-title"
              aria-describedby="report-chart-hint"
              tabIndex={0}
              onKeyDown={onChartKey}
              onBlur={() => setActiveBar(null)}
              className="flex h-44 items-end gap-1 overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ck-blue"
            >
              {daily.map((d, i) => (
                <div
                  key={i}
                  className="relative flex h-full min-w-[14px] flex-1 cursor-pointer flex-col items-center justify-end"
                  onMouseEnter={() => setActiveBar(i)}
                  onMouseLeave={() => setActiveBar(null)}
                  onClick={() => setActiveBar(i)}
                >
                  <div
                    className={cn('ck-grow w-full rounded-t-sm transition-colors', activeBar === i ? 'bg-ck-blue-dark' : 'bg-ck-blue')}
                    style={{ height: `${(d.secs / maxDay) * 100}%`, minHeight: d.secs ? 2 : 0, animationDelay: `${i * 20}ms` }}
                  />
                </div>
              ))}
            </div>
            <p id="report-chart-hint" className="sr-only">Use the left and right arrow keys to read the time for each {unit}.</p>
            <div className="mt-1 flex gap-1 overflow-hidden" aria-hidden="true">
              {daily.map((d, i) => <div key={i} className={cn('min-w-[14px] flex-1 truncate text-center text-[10px]', activeBar === i ? 'font-medium text-ck-text' : 'text-ck-muted')}>{d.label}</div>)}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="ck-card p-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ck-muted">By project</div>
              <Donut slices={byProject.map((g) => ({ value: g.secs, color: projectById(g.id)?.color ?? '#c6d2d9', label: projectById(g.id)?.name ?? 'Without project' }))} total={total} label="Time by project" />
              <ul className="mt-4 space-y-2 text-sm">
                {byProject.map((g) => {
                  const p = projectById(g.id)
                  return (
                    <li key={g.id ?? 'none'} className="flex items-center gap-2">
                      <ProjectDot color={p?.color ?? '#c6d2d9'} />
                      <span className="min-w-0 flex-1 truncate">{p?.name ?? 'Without project'}</span>
                      <span className="tabular-nums text-ck-muted">{total ? Math.round((g.secs / total) * 100) : 0}%</span>
                      <span className="w-20 text-right font-mono">{formatDuration(g.secs, settings.durationFormat)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="ck-card overflow-x-auto">
              <table className="ck-table w-full min-w-[560px]">
                <thead>
                  <tr><th>Project / Description</th><th className="text-right">Duration</th><th className="text-right">Amount</th><th className="text-right">Cost</th><th className="text-right">Profit</th></tr>
                </thead>
                <tbody>
                  {byProject.map((g) => {
                    const p = projectById(g.id)
                    return (
                      <GroupRows key={g.id ?? 'none'} group={g} projectName={p?.name ?? 'Without project'} color={p?.color ?? '#c6d2d9'} clientName={clientById(p?.clientId ?? null)?.name} />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-ck-bg font-medium [&>td]:border-t [&>td]:border-ck-border">
                    <td>Total</td>
                    <td className="text-right font-mono">{formatDuration(total, settings.durationFormat)}</td>
                    <td className={num}>{formatMoney(revenue, cur)}</td>
                    <td className={num}>{formatMoney(laborCost + expenseTotal, cur)}</td>
                    <td className={cn(num, profit < 0 && 'text-ck-red')}>{formatMoney(profit, cur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ))}

      {tab === 'detailed' && (!entries.length ? emptyState('time entries') : (
        <div className="ck-card overflow-x-auto">
          <table className="ck-table w-full min-w-[860px]">
            <thead>
              <tr><th>Description</th><th>Project</th><th>Member</th><th>Tags</th><th>Date</th><th>Time</th><th className="text-right">Duration</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const p = projectById(e.projectId)
                const task = taskById(e.projectId, e.taskId)
                return (
                  <tr key={e.id}>
                    <td>{e.description || <span className="text-ck-muted">(no description)</span>}{e.invoiceId && <span className="ml-1 rounded-sm bg-green-50 px-1 text-[10px] uppercase text-green-700">invoiced</span>}</td>
                    <td>
                      {p ? (
                        <span className="inline-flex items-center gap-1.5" style={{ color: p.color }}>
                          <ProjectDot color={p.color} />{p.name}{task && <span className="text-ck-text">: {task.name}</span>}
                        </span>
                      ) : <span className="text-ck-muted">—</span>}
                    </td>
                    <td className="text-[#555]">{memberById(e.userId)?.name ?? '—'}</td>
                    <td className="text-ck-muted">{e.tagIds.map((t) => tagById(t)?.name).filter(Boolean).join(', ') || '—'}</td>
                    <td className="whitespace-nowrap">{format(new Date(e.start), 'MMM d, yyyy')}</td>
                    <td className="whitespace-nowrap text-ck-muted tabular-nums">{formatTime(new Date(e.start), settings.timeFormat)} – {formatTime(new Date(e.end!), settings.timeFormat)}</td>
                    <td className="text-right font-mono">{formatDuration(secsOf(e), settings.durationFormat)}</td>
                    <td className={cn(num, !e.billable && 'text-ck-muted')}>{e.billable ? formatMoney(amount(e), cur) : <><span aria-hidden="true">—</span><span className="sr-only">Non-billable</span></>}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ck-bg font-medium [&>td]:border-t [&>td]:border-ck-border">
                <td colSpan={6}>Total · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</td>
                <td className="text-right font-mono">{formatDuration(total, settings.durationFormat)}</td>
                <td className={num}>{formatMoney(timeAmount, cur)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {tab === 'members' && can.manage && (!byMember.length ? emptyState('time entries') : (
        <div className="ck-card overflow-x-auto">
          <table className="ck-table w-full min-w-[640px]">
            <thead><tr><th>Member</th><th className="text-right">Tracked</th><th className="text-right">Billable</th><th className="text-right">Amount</th><th className="text-right">Labor cost</th><th className="text-right">Profit</th></tr></thead>
            <tbody>
              {byMember.map(([id, g]) => (
                <tr key={id}>
                  <td>{memberById(id)?.name ?? 'Unknown member'}</td>
                  <td className="text-right font-mono">{formatDuration(g.secs, settings.durationFormat)}</td>
                  <td className="text-right font-mono">{formatDuration(g.billable, settings.durationFormat)}</td>
                  <td className={num}>{formatMoney(g.amount, cur)}</td>
                  <td className={num}>{formatMoney(g.cost, cur)}</td>
                  <td className={cn(num, g.amount - g.cost < 0 && 'text-ck-red')}>{formatMoney(g.amount - g.cost, cur)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ck-bg font-medium [&>td]:border-t [&>td]:border-ck-border">
                <td>Total</td>
                <td className="text-right font-mono">{formatDuration(total, settings.durationFormat)}</td>
                <td className="text-right font-mono">{formatDuration(billableTotal, settings.durationFormat)}</td>
                <td className={num}>{formatMoney(timeAmount, cur)}</td>
                <td className={num}>{formatMoney(laborCost, cur)}</td>
                <td className={cn(num, timeAmount - laborCost < 0 && 'text-ck-red')}>{formatMoney(timeAmount - laborCost, cur)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'green' }) {
  return (
    <div className="ck-card min-w-0 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ck-muted">{label}</div>
      <div className={cn('mt-1 break-words font-mono text-lg', tone === 'red' && 'text-ck-red', tone === 'green' && 'text-ck-green')}>{value}</div>
      {sub && <div className="text-[11px] text-ck-muted">{sub}</div>}
    </div>
  )
}

function GroupRows({ group, projectName, color, clientName }: {
  group: { secs: number; amount: number; cost: number; items: [string, { secs: number; amount: number }][] }
  projectName: string; color: string; clientName?: string
}) {
  const { state } = useStore()
  const [open, setOpen] = useState(true)
  const cur = state.settings.currency
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <>
      <tr className="cursor-pointer bg-white hover:bg-ck-bg/40" onClick={() => setOpen(!open)}>
        <td className="font-medium">
          <button type="button" aria-expanded={open} className="inline-flex items-center gap-2 rounded-sm text-left" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
            <Chevron size={14} className="shrink-0 text-ck-muted" aria-hidden="true" />
            <ProjectDot color={color} /> {projectName}{clientName && <span className="font-normal text-ck-muted">- {clientName}</span>}
          </button>
        </td>
        <td className="text-right font-mono">{formatDuration(group.secs, state.settings.durationFormat)}</td>
        <td className={num}>{formatMoney(group.amount, cur)}</td>
        <td className={num}>{formatMoney(group.cost, cur)}</td>
        <td className={cn(num, group.amount - group.cost < 0 && 'text-ck-red')}>{formatMoney(group.amount - group.cost, cur)}</td>
      </tr>
      {open && group.items.map(([desc, it]) => (
        <tr key={desc} className="text-[#555]">
          <td className="pl-14">{desc}</td>
          <td className="text-right font-mono">{it.secs ? formatDuration(it.secs, state.settings.durationFormat) : '—'}</td>
          <td className={num}>{formatMoney(it.amount, cur)}</td>
          <td /><td />
        </tr>
      ))}
    </>
  )
}

export function Donut({ slices, total, size = 160, label = 'Time breakdown' }: { slices: { value: number; color: string; label?: string }[]; total: number; size?: number; label?: string }) {
  const r = 40, c = 2 * Math.PI * r
  let offset = 0
  const { state } = useStore()
  const fmt = state.settings.durationFormat
  const summary = total > 0
    ? `${label}, ${formatDuration(total, fmt)} total: ${slices.filter((s) => s.label && s.value > 0).map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}`
    : `${label}: no time tracked`
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} role="img" aria-label={summary}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e4eaee" strokeWidth="14" />
        {total > 0 && slices.map((s, i) => {
          const len = (s.value / total) * c
          const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-mono text-sm">{formatDuration(total, fmt)}</span>
        <span className="text-[10px] uppercase tracking-wide text-ck-muted">total</span>
      </div>
    </div>
  )
}
